/**
 * watcher.server.ts
 *
 * Logique métier centrale du Competitive Watcher :
 *  - Vérification des limites du plan
 *  - Déclenchement des checks de prix
 *  - Génération des alertes et suggestions IA
 *  - Calcul du prix optimisé recommandé
 */

import prisma from "../../db.server";
import { scrapeProductPrice } from "./price-scraper.server";
import { generatePriceSuggestion } from "./price-ai.server";

// Limites par plan (produits surveillés actifs en simultané)
export const WATCHER_PLAN_LIMITS = {
  FREE: 3,
  PRO: 10,
  GROWTH: -1, // illimité
} as const;

/**
 * Vérifie si le marchand peut ajouter un nouveau produit surveillé.
 */
export async function canAddWatchedProduct(
  shopDomain: string
): Promise<{ allowed: boolean; reason?: string; current: number; limit: number }> {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: {
      watchedProducts: { where: { isActive: true } },
    },
  });

  if (!shop) return { allowed: false, reason: "Boutique introuvable", current: 0, limit: 0 };

  const plan = shop.plan as keyof typeof WATCHER_PLAN_LIMITS;
  const limit = WATCHER_PLAN_LIMITS[plan] ?? 3;
  const current = shop.watchedProducts.length;

  if (limit !== -1 && current >= limit) {
    return {
      allowed: false,
      reason: `Limite atteinte (${current}/${limit} produits). Passez au plan supérieur.`,
      current,
      limit,
    };
  }

  return { allowed: true, current, limit };
}

/**
 * Lance un check de prix pour tous les produits surveillés actifs d'une boutique.
 * Appelé par un cron job ou manuellement depuis le dashboard.
 * Retourne le nombre d'alertes générées.
 */
export async function runPriceChecks(shopDomain: string): Promise<number> {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: {
      watchedProducts: { where: { isActive: true } },
    },
  });

  if (!shop) return 0;

  let alertsGenerated = 0;

  // On traite les produits en parallèle par batch de 3 (respect des serveurs cibles)
  const batchSize = 3;
  for (let i = 0; i < shop.watchedProducts.length; i += batchSize) {
    const batch = shop.watchedProducts.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((wp) => checkSingleProduct(wp, shop.id))
    );
    alertsGenerated += results.filter(
      (r) => r.status === "fulfilled" && r.value === true
    ).length;
  }

  return alertsGenerated;
}

/**
 * Vérifie uniquement les produits "en retard" (jamais checkés ou >24h),
 * avec une limite pour éviter les timeouts HTTP.
 */
export async function runStalePriceChecks(
  shopDomain: string,
  maxProducts = 3,
  options?: { onlyAutomation?: boolean }
): Promise<{ checkedProducts: number; alertsGenerated: number }> {
  const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const safeMax = Number.isFinite(maxProducts)
    ? Math.min(Math.max(Math.floor(maxProducts), 1), 20)
    : 3;

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });
  if (!shop) return { checkedProducts: 0, alertsGenerated: 0 };

  const staleProducts = await prisma.watchedProduct.findMany({
    where: {
      shopId: shop.id,
      isActive: true,
      ...(options?.onlyAutomation ? { automationEnabled: true } : {}),
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: threshold } }],
    },
    select: {
      id: true,
      competitorUrl: true,
      competitorName: true,
      lastPrice: true,
      myCurrentPrice: true,
      shopifyProductTitle: true,
      automationThresholdPct: true,
      automationAlerts: true,
      automationPricingAdvice: true,
    },
    orderBy: { lastCheckedAt: "asc" },
    take: safeMax,
  });

  if (staleProducts.length === 0) {
    return { checkedProducts: 0, alertsGenerated: 0 };
  }

  let alertsGenerated = 0;
  const batchSize = 3;
  for (let i = 0; i < staleProducts.length; i += batchSize) {
    const batch = staleProducts.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((wp) => checkSingleProduct(wp, shop.id))
    );
    alertsGenerated += results.filter(
      (r) => r.status === "fulfilled" && r.value === true
    ).length;
  }

  return { checkedProducts: staleProducts.length, alertsGenerated };
}

/**
 * Lance un check auto si au moins un produit n'a pas été vérifié
 * depuis plus de 24h (ou jamais vérifié).
 */
export async function runDailyCheckIfNeeded(shopDomain: string): Promise<boolean> {
  const result = await runStalePriceChecks(shopDomain, 3);
  return result.checkedProducts > 0;
}

/**
 * Vérifie le prix d'un produit surveillé unique.
 * Crée un snapshot et génère une alerte si le prix a changé.
 * Retourne true si une alerte a été générée.
 */
async function checkSingleProduct(
  watchedProduct: {
    id: string;
    competitorUrl: string;
    competitorName: string;
    lastPrice: number | null;
    myCurrentPrice: number | null;
    shopifyProductTitle: string;
    automationThresholdPct?: number | null;
    automationAlerts?: boolean | null;
    automationPricingAdvice?: boolean | null;
  },
  shopId: string
): Promise<boolean> {
  const scraped = await scrapeProductPrice(watchedProduct.competitorUrl);

  if (scraped.error || scraped.price === null) {
    await prisma.watchedProduct.update({
      where: { id: watchedProduct.id },
      data: {
        lastCheckedAt: new Date(),
        automationLastRunAt: new Date(),
        automationLastStatus: "error",
        automationLastError: scraped.error ?? "Prix non détecté",
      },
    });
    return false;
  }

  const newPrice = scraped.price;
  const oldPrice = watchedProduct.lastPrice;

  // Sauvegarde du snapshot
  await prisma.priceSnapshot.create({
    data: {
      watchedProductId: watchedProduct.id,
      price: newPrice,
      currency: scraped.currency,
      hasPromotion: scraped.hasPromotion,
      promotionLabel: scraped.promotionLabel,
      originalPrice: scraped.originalPrice,
    },
  });

  // Mise à jour du dernier prix connu
  await prisma.watchedProduct.update({
    where: { id: watchedProduct.id },
    data: {
      lastPrice: newPrice,
      lastCheckedAt: new Date(),
      automationLastRunAt: new Date(),
      automationLastStatus: "success",
      automationLastError: null,
    },
  });

  // Pas d'alerte si c'est le premier check (pas d'ancien prix)
  if (oldPrice === null) return false;

  const priceDiff = newPrice - oldPrice;
  const priceDiffPercent = oldPrice > 0 ? (priceDiff / oldPrice) * 100 : 0;

  // Pas d'alerte si le prix n'a pas changé
  if (priceDiff === 0) return false;

  // Seuil de déclenchement : changement > threshold% (évite le bruit sur les centimes)
  const threshold = watchedProduct.automationThresholdPct ?? 1;
  if (Math.abs(priceDiffPercent) < threshold && !scraped.hasPromotion) return false;
  if (watchedProduct.automationAlerts === false) return false;

  // Détermination du type d'alerte
  let alertType: "PRICE_DROP" | "PRICE_INCREASE" | "PROMOTION_STARTED" | "PROMOTION_ENDED";
  let title: string;
  let message: string;

  if (scraped.hasPromotion && scraped.originalPrice && scraped.originalPrice > newPrice) {
    alertType = "PROMOTION_STARTED";
    title = `Promo chez ${watchedProduct.competitorName}`;
    message = `${watchedProduct.competitorName} a lancé une promotion sur "${watchedProduct.shopifyProductTitle}" : ${scraped.promotionLabel ?? "Promotion détectée"}. Nouveau prix : ${newPrice} ${scraped.currency} (ancien : ${scraped.originalPrice} ${scraped.currency}).`;
  } else if (priceDiff < 0) {
    alertType = "PRICE_DROP";
    const pct = Math.abs(priceDiffPercent).toFixed(1);
    title = `Baisse de prix chez ${watchedProduct.competitorName} (-${pct}%)`;
    message = `${watchedProduct.competitorName} a baissé son prix pour "${watchedProduct.shopifyProductTitle}" de ${oldPrice} → ${newPrice} ${scraped.currency} (-${pct}%).`;
  } else {
    alertType = "PRICE_INCREASE";
    const pct = priceDiffPercent.toFixed(1);
    title = `Hausse de prix chez ${watchedProduct.competitorName} (+${pct}%)`;
    message = `${watchedProduct.competitorName} a augmenté son prix pour "${watchedProduct.shopifyProductTitle}" de ${oldPrice} → ${newPrice} ${scraped.currency} (+${pct}%).`;
  }

  // Génération de la suggestion IA (non bloquante)
  let suggestion: string | null = null;
  if (watchedProduct.automationPricingAdvice !== false) {
    try {
      suggestion = await generatePriceSuggestion({
        productTitle: watchedProduct.shopifyProductTitle,
        myPrice: watchedProduct.myCurrentPrice,
        competitorPrice: newPrice,
        competitorName: watchedProduct.competitorName,
        alertType,
        priceDiffPercent,
      });
    } catch {
      // Si l'IA échoue, on continue sans suggestion
    }
  }

  await prisma.priceAlert.create({
    data: {
      shopId,
      watchedProductId: watchedProduct.id,
      alertType,
      oldPrice,
      newPrice,
      priceDiffPercent,
      title,
      message,
      suggestion,
    },
  });

  return true;
}

/**
 * Retourne un résumé du dashboard Competitive Watcher pour une boutique.
 */
export async function getWatcherDashboard(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return null;

  const [watchedProducts, unreadAlerts, recentAlerts] = await Promise.all([
    prisma.watchedProduct.findMany({
      where: { shopId: shop.id, isActive: true },
      include: {
        priceHistory: {
          orderBy: { capturedAt: "desc" },
          take: 10,
        },
        alerts: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.priceAlert.count({
      where: { shopId: shop.id, isRead: false },
    }),
    prisma.priceAlert.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        watchedProduct: {
          select: { shopifyProductTitle: true, competitorName: true },
        },
      },
    }),
  ]);

  return {
    watchedProducts,
    unreadAlerts,
    recentAlerts,
    plan: shop.plan,
  };
}
