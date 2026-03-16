/**
 * app.competitive.tsx
 *
 * Dashboard principal du module Competitive Watcher.
 * Affiche :
 *  - Le résumé des produits surveillés et leurs prix
 *  - Les alertes non lues
 *  - Le bouton pour lancer un check manuel des prix
 *  - Le limiteur du plan avec CTA upgrade
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigate, useSubmit, useNavigation, useLocation, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Badge,
  Box,
  Banner,
  InlineGrid,
  Divider,
  EmptyState,
  Tooltip,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  getWatcherDashboard,
  runPriceChecks,
  WATCHER_PLAN_LIMITS,
  canAddWatchedProduct,
} from "../services/competitive/watcher.server";
import { hasFeatureAccess } from "../services/billing/plans.server";
import { scrapeProductPrice, fetchHtmlOnce } from "../services/competitive/price-scraper.server";
import { discoverCompetitors } from "../services/competitive/discovery.server";
import { analyzeCompetitivePage } from "../services/competitive/competitive-analysis.server";

/**
 * Tente de trouver un produit par nom sur un site concurrent (Shopify ou autre).
 * Essaie : /products.json, /search/suggest.json, puis /search?q=
 */
async function findProductOnSite(origin: string, productName: string): Promise<string | null> {
  const query = encodeURIComponent(productName);

  // Méthode 1 : Shopify products.json (public)
  try {
    const resp = await fetch(`${origin}/products.json?limit=20`, {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36" },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data?.products?.length) {
        const nameLC = productName.toLowerCase();
        const match = data.products.find((p: any) =>
          p.title?.toLowerCase().includes(nameLC) || nameLC.includes(p.title?.toLowerCase())
        );
        if (match?.handle) return `${origin}/products/${match.handle}`;
        // Pas de match exact, prendre le premier produit comme fallback
        if (data.products[0]?.handle) {
          console.log(`[findProduct] Pas de match exact, premier produit: ${data.products[0].title}`);
        }
      }
    }
  } catch {}

  // Méthode 2 : Shopify search suggest
  try {
    const resp = await fetch(`${origin}/search/suggest.json?q=${query}&resources[type]=product&resources[limit]=5`, {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36" },
    });
    if (resp.ok) {
      const data = await resp.json();
      const products = data?.resources?.results?.products;
      if (products?.length) {
        return `${origin}${products[0].url}`;
      }
    }
  } catch {}

  // Méthode 3 : Recherche HTML /search?q=... et extraction du premier lien /products/
  try {
    const html = await fetchHtmlOnce(`${origin}/search?q=${query}&type=product`, 8000);
    if (html) {
      const productLinkMatch = html.match(/href=["'](\/products\/[a-z0-9-]+)["']/i);
      if (productLinkMatch) {
        return `${origin}${productLinkMatch[1]}`;
      }
    }
  } catch {}

  return null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const paidAccess = await hasFeatureAccess(session.shop, "competitive_compare_advanced");
  if (!paidAccess.allowed) {
    throw redirect("/app/billing?source=competitive");
  }
  const automationAccess = await hasFeatureAccess(session.shop, "competitive_automation_plus");
  const data = await getWatcherDashboard(session.shop);
  if (!data) return json({ watchedProducts: [], unreadAlerts: 0, recentAlerts: [], plan: "FREE", limit: 3, current: 0 });

  const plan = data.plan as keyof typeof WATCHER_PLAN_LIMITS;
  const limit = WATCHER_PLAN_LIMITS[plan] ?? 3;

  const productsResponse = await admin.graphql(`
    query CompetitiveProducts {
      products(first: 50, sortKey: TITLE) {
        edges {
          node {
            id
            title
            handle
            variants(first: 1) {
              edges {
                node {
                  price
                }
              }
            }
          }
        }
      }
    }
  `);
  const productsJson = await productsResponse.json();
  const products =
    productsJson?.data?.products?.edges?.map((e: any) => ({
      id: e?.node?.id,
      title: e?.node?.title,
      handle: e?.node?.handle,
      price: parseFloat(e?.node?.variants?.edges?.[0]?.node?.price ?? "0") || null,
    })) ?? [];

  return json({
    watchedProducts: data.watchedProducts,
    unreadAlerts: data.unreadAlerts,
    recentAlerts: data.recentAlerts,
    plan: data.plan,
    limit,
    current: data.watchedProducts.length,
    products,
    shopDomain: session.shop,
    automationAccess,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Fallback robuste pour les POST embed qui perdent le contexte shop/host.
  let shopDomain = (formData.get("shopDomain") as string | null)?.trim() ?? "";
  try {
    const auth = await authenticate.admin(request);
    if (auth?.session?.shop) shopDomain = auth.session.shop;
  } catch {
    // On garde le fallback formData.shopDomain.
  }

  if (!shopDomain) {
    return json({ success: false, error: "Contexte boutique manquant. Rechargez la page." }, { status: 401 });
  }

  const paidAccess = await hasFeatureAccess(shopDomain, "competitive_compare_advanced");
  if (!paidAccess.allowed) {
    return json({ success: false, error: paidAccess.reason ?? "Accès payant requis." }, { status: 403 });
  }

  if (intent === "update_automation") {
    const automationAccess = await hasFeatureAccess(shopDomain, "competitive_automation_plus");
    if (!automationAccess.allowed) {
      return json({ success: false, error: automationAccess.reason ?? "Automation+ requis." }, { status: 403 });
    }

    const watchedProductId = (formData.get("watchedProductId") as string | null)?.trim() ?? "";
    const automationEnabled = formData.get("automationEnabled") === "on";
    const automationPricingAdvice = formData.get("automationPricingAdvice") === "on";
    const automationAlerts = formData.get("automationAlerts") === "on";
    const frequencyRaw = Number(formData.get("automationFrequencyHours") ?? 24);
    const thresholdRaw = Number(formData.get("automationThresholdPct") ?? 1);

    const frequency = Number.isFinite(frequencyRaw)
      ? Math.min(Math.max(Math.floor(frequencyRaw), 6), 48)
      : 24;
    const threshold = Number.isFinite(thresholdRaw)
      ? Math.min(Math.max(thresholdRaw, 0.3), 30)
      : 1;

    if (!watchedProductId) {
      return json({ success: false, error: "Produit de surveillance manquant." }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({ where: { shopDomain }, select: { id: true } });
    if (!shop) {
      return json({ success: false, error: "Boutique introuvable." }, { status: 404 });
    }

    await prisma.watchedProduct.updateMany({
      where: { id: watchedProductId, shopId: shop.id, isActive: true },
      data: {
        automationEnabled,
        automationPricingAdvice,
        automationAlerts,
        automationFrequencyHours: frequency,
        automationThresholdPct: threshold,
      },
    });

    return json({ success: true, automationUpdated: true, watchedProductId });
  }

  if (intent === "run_checks") {
    const count = await runPriceChecks(shopDomain);
    return json({ success: true, alertsGenerated: count });
  }

  if (intent === "mark_all_read") {
    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (shop) {
      await prisma.priceAlert.updateMany({
        where: { shopId: shop.id, isRead: false },
        data: { isRead: true },
      });
    }
    return json({ success: true });
  }

  if (intent === "check_one") {
    const watchedProductId = (formData.get("watchedProductId") as string | null)?.trim() ?? "";
    if (!watchedProductId) {
      return json({ success: false, error: "Produit de surveillance manquant." }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shop) {
      return json({ success: false, error: "Boutique introuvable." }, { status: 404 });
    }

    const watchedProduct = await prisma.watchedProduct.findFirst({
      where: { id: watchedProductId, shopId: shop.id, isActive: true },
    });
    if (!watchedProduct) {
      return json({ success: false, error: "Produit surveillé introuvable." }, { status: 404 });
    }

    const scraped = await scrapeProductPrice(watchedProduct.competitorUrl);
    if (!scraped.price) {
      await prisma.watchedProduct.update({
        where: { id: watchedProduct.id },
        data: { lastCheckedAt: new Date() },
      });
      return json({
        success: true,
        checked: false,
        watchedProductId: watchedProduct.id,
        warning: scraped.error ?? "Prix non détecté sur la page concurrente.",
      });
    }

    await prisma.priceSnapshot.create({
      data: {
        watchedProductId: watchedProduct.id,
        price: scraped.price,
        currency: scraped.currency,
        hasPromotion: scraped.hasPromotion,
        promotionLabel: scraped.promotionLabel,
        originalPrice: scraped.originalPrice,
      },
    });

    await prisma.watchedProduct.update({
      where: { id: watchedProduct.id },
      data: {
        lastPrice: scraped.price,
        lastCurrency: scraped.currency || "EUR",
        lastCheckedAt: new Date(),
      },
    });

    return json({ success: true, checked: true, watchedProductId: watchedProduct.id, newPrice: scraped.price });
  }

  if (intent === "delete_watch") {
    const watchedProductId = (formData.get("watchedProductId") as string | null)?.trim() ?? "";
    if (!watchedProductId) {
      return json({ success: false, error: "Produit de surveillance manquant." }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shop) {
      return json({ success: false, error: "Boutique introuvable." }, { status: 404 });
    }

    await prisma.watchedProduct.updateMany({
      where: { id: watchedProductId, shopId: shop.id, isActive: true },
      data: { isActive: false },
    });

    return json({ success: true, deleted: true, watchedProductId });
  }

  if (intent === "add_watch_manual") {
    const myProductTitle = (formData.get("myProductTitle") as string | null)?.trim() ?? "";
    const competitorUrl = (formData.get("competitorUrl") as string | null)?.trim() ?? "";
    const myCurrentPriceRaw = (formData.get("myCurrentPrice") as string | null)?.trim() ?? "";
    const myCurrentPrice = myCurrentPriceRaw ? Number(myCurrentPriceRaw) : null;

    if (!myProductTitle || !competitorUrl) {
      return json({ success: false, error: "Renseignez le nom de votre produit et l'URL du concurrent." }, { status: 400 });
    }

    let urlObj: URL;
    try {
      urlObj = new URL(competitorUrl);
    } catch {
      return json({ success: false, error: "URL concurrent invalide." }, { status: 400 });
    }

    // Nom du concurrent : utilise le champ s'il est rempli, sinon extrait du domaine
    const rawCompetitorName = (formData.get("competitorName") as string | null)?.trim() ?? "";
    const competitorName = rawCompetitorName || urlObj.hostname.replace(/^www\./, "").split(".")[0];

    console.log(`[add_watch] Ajout manuel: title="${myProductTitle}" competitor="${competitorName}" url="${competitorUrl}" price="${myCurrentPriceRaw}"`);

    const check = await canAddWatchedProduct(shopDomain);
    if (!check.allowed) {
      return json({ success: false, error: check.reason ?? "Limite atteinte." }, { status: 403 });
    }

    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shop) {
      return json({ success: false, error: "Boutique introuvable." }, { status: 404 });
    }

    const existing = await prisma.watchedProduct.findFirst({
      where: { shopId: shop.id, competitorDomain: urlObj.hostname, isActive: true },
    });
    if (existing) {
      return json({ success: true, alreadyExists: true });
    }

    // Si c'est une page d'accueil, tenter de trouver la page produit
    let finalUrl = competitorUrl;
    const isHomepage = urlObj.pathname === "/" || urlObj.pathname === "";
    if (isHomepage && myProductTitle) {
      console.log(`[add_watch] URL = page d'accueil, recherche du produit "${myProductTitle}" sur ${urlObj.origin}`);
      const foundProductUrl = await findProductOnSite(urlObj.origin, myProductTitle);
      if (foundProductUrl) {
        finalUrl = foundProductUrl;
        console.log(`[add_watch] Produit trouvé: ${finalUrl}`);
      } else {
        console.log(`[add_watch] Produit non trouvé via API, on garde l'URL d'accueil`);
      }
    }

    let initialPrice: number | null = null;
    let scrapedTitle: string | null = null;
    try {
      const scraped = await scrapeProductPrice(finalUrl);
      if (scraped.price) initialPrice = scraped.price;
      if (scraped.title) scrapedTitle = scraped.title;
    } catch {
      // non bloquant
    }

    const watched = await prisma.watchedProduct.create({
      data: {
        shopId: shop.id,
        shopifyProductId: `manual:${Date.now()}`,
        shopifyProductTitle: myProductTitle,
        competitorUrl: finalUrl,
        competitorName,
        competitorDomain: urlObj.hostname,
        myCurrentPrice: typeof myCurrentPrice === "number" && !Number.isNaN(myCurrentPrice) ? myCurrentPrice : null,
        lastPrice: initialPrice,
        lastCheckedAt: initialPrice ? new Date() : null,
      },
    });

    if (initialPrice) {
      await prisma.priceSnapshot.create({
        data: {
          watchedProductId: watched.id,
          price: initialPrice,
          currency: "EUR",
        },
      });
    }

    console.log(`[add_watch] OK: ${watched.id} — ${competitorName} (${finalUrl}) prix=${initialPrice} titre="${scrapedTitle}"`);
    return json({
      success: true,
      added: true,
      detectedPrice: initialPrice,
      detectedTitle: scrapedTitle,
      resolvedUrl: finalUrl !== competitorUrl ? finalUrl : null,
      noPrice: !initialPrice,
    });
  }

  if (intent === "auto_watch_from_shopify") {
    const packed = (formData.get("shopifyProductPacked") as string | null)?.trim() ?? "";
    if (!packed) {
      return json({ success: false, error: "Sélectionnez un produit Shopify." }, { status: 400 });
    }

    const [idPart, titlePart, handlePart, pricePart] = packed.split("::");
    const title = decodeURIComponent(titlePart ?? "").trim();
    const handle = decodeURIComponent(handlePart ?? "").trim();
    const shopifyPrice = parseFloat(pricePart ?? "0") || null;
    if (!idPart || !title) {
      return json({ success: false, error: "Produit Shopify invalide." }, { status: 400 });
    }

    const query = `${title} ${handle}`.trim();
    const candidates = await discoverCompetitors({
      query,
      ownDomain: shopDomain,
      limit: 5,
    });

    if (!candidates.length) {
      return json({
        success: false,
        error: "Aucun concurrent pertinent détecté automatiquement. Utilisez le mode manuel.",
      }, { status: 404 });
    }

    const best = candidates[0];
    let urlObj: URL;
    try {
      urlObj = new URL(best.url);
    } catch {
      return json({ success: false, error: "URL détectée invalide. Réessayez." }, { status: 400 });
    }

    const check = await canAddWatchedProduct(shopDomain);
    if (!check.allowed) {
      return json({ success: false, error: check.reason ?? "Limite atteinte." }, { status: 403 });
    }

    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shop) {
      return json({ success: false, error: "Boutique introuvable." }, { status: 404 });
    }

    const existing = await prisma.watchedProduct.findFirst({
      where: {
        shopId: shop.id,
        isActive: true,
        competitorUrl: best.url,
        shopifyProductTitle: title,
      },
      select: { id: true },
    });
    if (existing) {
      return json({
        success: true,
        autoAdded: false,
        alreadyExists: true,
        watchedProductId: existing.id,
      });
    }

    let initialPrice: number | null = null;
    try {
      const scraped = await scrapeProductPrice(best.url);
      if (scraped.price) initialPrice = scraped.price;
    } catch {
      // non bloquant
    }

    const watched = await prisma.watchedProduct.create({
      data: {
        shopId: shop.id,
        shopifyProductId: idPart,
        shopifyProductTitle: title,
        competitorUrl: best.url,
        competitorName: best.domain,
        competitorDomain: urlObj.hostname,
        myCurrentPrice: shopifyPrice,
        lastPrice: initialPrice,
        lastCheckedAt: initialPrice ? new Date() : null,
      },
    });

    if (initialPrice) {
      await prisma.priceSnapshot.create({
        data: {
          watchedProductId: watched.id,
          price: initialPrice,
          currency: "EUR",
        },
      });
    }

    return json({
      success: true,
      autoAdded: true,
      watchedProductId: watched.id,
      competitorName: best.domain,
      competitorUrl: best.url,
    });
  }

  if (intent === "discover_competitors") {
    const discoveryMode = (formData.get("discoveryMode") as string | null)?.trim() ?? "shopify";
    let query = "";

    if (discoveryMode === "shopify") {
      const packed = (formData.get("shopifyProductPacked") as string | null)?.trim() ?? "";
      if (!packed) {
        return json({ success: false, error: "Sélectionnez un produit Shopify." }, { status: 400 });
      }
      const [idPart, titlePart, handlePart] = packed.split("::");
      const title = decodeURIComponent(titlePart ?? "").trim();
      const handle = decodeURIComponent(handlePart ?? "").trim();
      if (!idPart || !title) {
        return json({ success: false, error: "Produit introuvable sur Shopify." }, { status: 400 });
      }
      query = `${title} ${handle}`.trim();
    } else {
      const manualProduct = (formData.get("manualProduct") as string | null)?.trim() ?? "";
      const manualUrl = (formData.get("manualUrl") as string | null)?.trim() ?? "";

      if (!manualProduct && !manualUrl) {
        return json({ success: false, error: "Saisissez un produit OU une URL." }, { status: 400 });
      }
      if (manualProduct && manualUrl) {
        return json({ success: false, error: "Choisissez un seul input: produit OU URL." }, { status: 400 });
      }

      if (manualUrl) {
        try {
          const u = new URL(manualUrl);
          query = `${u.hostname} ${u.pathname.replaceAll("-", " ")}`.trim();
        } catch {
          return json({ success: false, error: "URL invalide." }, { status: 400 });
        }
      } else {
        query = manualProduct;
      }
    }

    const limitParam = Number(formData.get("limit") ?? 10);
    const clampedLimit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 10;

    const candidates = await discoverCompetitors({
      query,
      ownDomain: shopDomain,
      limit: clampedLimit,
    });

    return json({ success: true, discovered: true, candidates, query });
  }

  if (intent === "analyze_competitor") {
    const watchedProductId = (formData.get("watchedProductId") as string | null)?.trim() ?? "";
    if (!watchedProductId) {
      return json({ success: false, analysisError: "Produit de surveillance manquant." }, { status: 400 });
    }

    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shop) {
      return json({ success: false, analysisError: "Boutique introuvable." }, { status: 404 });
    }

    const watchedProduct = await prisma.watchedProduct.findFirst({
      where: { id: watchedProductId, shopId: shop.id, isActive: true },
    });
    if (!watchedProduct?.competitorUrl) {
      return json({ success: false, analysisError: "URL concurrent manquante." }, { status: 404 });
    }

    try {
      console.log(`[analyze] Lancement analyse pour ${watchedProduct.competitorUrl}`);
      const analysis = await analyzeCompetitivePage({
        competitorUrl: watchedProduct.competitorUrl,
        own: {
          title: watchedProduct.shopifyProductTitle,
          price: watchedProduct.myCurrentPrice,
        },
      });
      console.log(`[analyze] Résultat: prix=${analysis.price}, strengths=${analysis.strengths.length}, diagnostic=${analysis.diagnostic}`);
      return json({ success: true, analysis, watchedProductId });
    } catch (err) {
      console.error(`[analyze] ERREUR:`, err);
      const msg = err instanceof Error ? err.message : "Impossible d'analyser la page concurrente.";
      return json({ success: false, analysisError: msg }, { status: 500 });
    }
  }

  return json({ error: "Action inconnue" }, { status: 400 });
};

// ── Composant : carte d'un produit surveillé ──────────────────────────────────
function WatchedProductCard({
  product,
  submit,
  shopDomain,
  actionBusy,
  actionData,
}: {
  product: any;
  submit: ReturnType<typeof useSubmit>;
  shopDomain: string;
  actionBusy: boolean;
  actionData: any;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const checkFetcher = useFetcher<{
    success?: boolean;
    checked?: boolean;
    warning?: string;
    newPrice?: number;
    watchedProductId?: string;
  }>();
  const analysisFetcher = useFetcher<{
    analysis?: {
      strengths: string[];
      weaknesses: string[];
      opportunities: string[];
      recommendations: string[];
      diagnostic: string | null;
      imageCount: number;
      hasVideo: boolean;
      trustSignals: string[];
      reviewSignals: string[];
    };
    analysisError?: string;
  }>();
  const analysis = analysisFetcher.data?.analysis;
  const analysisError = analysisFetcher.data?.analysisError;
  const analysisLoading = analysisFetcher.state === "submitting" || analysisFetcher.state === "loading";
  const checkLoading = checkFetcher.state !== "idle";
  const checkResult = checkFetcher.data;

  const lastHistory = product.priceHistory[0];
  const prevHistory = product.priceHistory[1];
  const alerts = product.alerts ?? [];
  const hasFreshCheck =
    product.lastCheckedAt &&
    Date.now() - new Date(product.lastCheckedAt).getTime() < 36 * 60 * 60 * 1000;

  const priceChange =
    lastHistory && prevHistory
      ? ((lastHistory.price - prevHistory.price) / prevHistory.price) * 100
      : null;

  const tone =
    priceChange === null
      ? "info"
      : priceChange < -1
      ? "critical"
      : priceChange > 1
      ? "success"
      : "info";

  const doCheck = () => {
    checkFetcher.submit(
      { intent: "check_one", watchedProductId: product.id, shopDomain },
      { method: "post" },
    );
  };

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text variant="headingSm" as="h3">{product.shopifyProductTitle}</Text>
            <Text variant="bodySm" as="p" tone="subdued">
              vs. <a href={product.competitorUrl} target="_blank" rel="noreferrer" style={{ color: "#2c6ecb" }}>{product.competitorName}</a>
            </Text>
          </BlockStack>
          <InlineStack gap="100">
            <Badge tone={product.lastPrice ? "success" : "attention"}>
              {product.lastPrice ? "Surveillance active" : "A vérifier"}
            </Badge>
            {priceChange !== null && (
              <Badge tone={tone}>
                {priceChange > 0 ? "+" : ""}{priceChange.toFixed(1)}%
              </Badge>
            )}
            <Badge tone={hasFreshCheck ? "success" : "warning"}>
              {hasFreshCheck ? "Check récent" : "Check en retard"}
            </Badge>
          </InlineStack>
        </InlineStack>

        <Divider />

        <InlineGrid columns={2} gap="200">
          <Box padding="200" background="bg-surface-secondary" borderRadius="100">
            <BlockStack gap="050" inlineAlign="center">
              <Text variant="bodySm" as="p" tone="subdued">Mon prix</Text>
              <Text variant="headingMd" as="p" fontWeight="bold">
                {product.myCurrentPrice ? `${product.myCurrentPrice} €` : "—"}
              </Text>
            </BlockStack>
          </Box>
          <Box padding="200" background="bg-surface-secondary" borderRadius="100">
            <BlockStack gap="050" inlineAlign="center">
              <Text variant="bodySm" as="p" tone="subdued">Concurrent</Text>
              <Text variant="headingMd" as="p" fontWeight="bold">
                {checkResult?.checked ? `${Number(checkResult.newPrice).toFixed(2)} €` : product.lastPrice ? `${product.lastPrice} €` : "Non vérifié"}
              </Text>
              {product.lastPrice && product.myCurrentPrice && (
                <Text variant="bodySm" as="p" tone="subdued">
                  Écart: {(product.lastPrice - product.myCurrentPrice).toFixed(2)} €
                </Text>
              )}
            </BlockStack>
          </Box>
        </InlineGrid>

        {lastHistory?.hasPromotion && (
          <Banner tone="warning">
            <Text as="p" variant="bodySm">
              Promotion active : {lastHistory.promotionLabel ?? "Promo détectée"}
            </Text>
          </Banner>
        )}

        {/* Résultat de la vérification (via fetcher, feedback temps réel) */}
        {checkLoading && (
          <Banner tone="info">
            <Text as="p" variant="bodySm">Vérification du prix en cours sur le site concurrent...</Text>
          </Banner>
        )}
        {checkResult?.checked && !checkLoading && (
          <Banner tone="success">
            <Text as="p" variant="bodySm">
              Prix détecté : {Number(checkResult.newPrice).toFixed(2)} € — mise à jour effectuée.
            </Text>
          </Banner>
        )}
        {checkResult?.warning && !checkLoading && (
          <Banner tone="warning">
            <Text as="p" variant="bodySm">
              Vérification faite mais prix non détecté sur la page. Vérifiez l'URL manuellement.
            </Text>
          </Banner>
        )}

        {!product.lastPrice && !checkResult && (
          <Banner tone="info">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="p" variant="bodySm">Concurrent non vérifié pour l'instant.</Text>
              <Button size="slim" onClick={doCheck} loading={checkLoading}>
                Vérifier maintenant
              </Button>
            </InlineStack>
          </Banner>
        )}

        <InlineStack gap="200" align="end">
          <Text variant="bodySm" as="p" tone="subdued">
            {product.lastPrice ? "Vérifié" : "Dernier check"} : {product.lastCheckedAt
              ? new Date(product.lastCheckedAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
              : "Jamais"}
          </Text>
          <Button
            tone="critical"
            variant="plain"
            onClick={() =>
              submit(
                { intent: "delete_watch", watchedProductId: product.id, shopDomain },
                { method: "post" },
              )
            }
            loading={actionBusy}
          >
            Supprimer
          </Button>
          <Button
            variant="plain"
            onClick={doCheck}
            loading={checkLoading}
          >
            {checkLoading ? "Vérification..." : "Vérifier le prix"}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setDetailsOpen(true);
              if (!analysis && !analysisLoading) {
                analysisFetcher.submit(
                  { intent: "analyze_competitor", watchedProductId: product.id, shopDomain },
                  { method: "post" },
                );
              }
            }}
          >
            Voir l'analyse concurrentielle
          </Button>
          {detailsOpen && (
            <Button variant="plain" onClick={() => setDetailsOpen(false)}>
              Masquer
            </Button>
          )}
        </InlineStack>

        {detailsOpen && (
          <Box padding="400" borderWidth="025" borderColor="border" borderRadius="200" background="bg-surface-secondary">
            <BlockStack gap="400">
              <Text variant="headingMd" as="h3">Analyse détaillée du concurrent</Text>
              <Text variant="bodySm" as="p" tone="subdued">
                Page analysée : <a href={product.competitorUrl} target="_blank" rel="noreferrer">{product.competitorUrl}</a>
              </Text>

              {analysisLoading && !analysis && (
                <Banner tone="info">
                  <Text as="p">Analyse de la page concurrente en cours... (réponse sous quelques secondes)</Text>
                </Banner>
              )}
              {analysisError && !analysis && (
                <Banner tone="critical">
                  <Text as="p">{analysisError}</Text>
                  <Button size="slim" onClick={() => analysisFetcher.submit(
                    { intent: "analyze_competitor", watchedProductId: product.id, shopDomain },
                    { method: "post" },
                  )}>
                    Réessayer
                  </Button>
                </Banner>
              )}
              {analysis && (
                <InlineGrid columns={2} gap="400">
                  <Box padding="400" background="bg-fill-success-secondary" borderRadius="200" borderWidth="025" borderColor="border-success">
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h4">Points forts du concurrent</Text>
                      {analysis.strengths?.length ? (
                        analysis.strengths.map((s, i) => (
                          <Text key={i} as="p" variant="bodySm">✓ {s}</Text>
                        ))
                      ) : (
                        <Text as="p" variant="bodySm" tone="subdued">Aucun point fort identifié.</Text>
                      )}
                    </BlockStack>
                  </Box>
                  <Box padding="400" background="bg-fill-critical-secondary" borderRadius="200" borderWidth="025" borderColor="border-critical">
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h4">Faiblesses / risques</Text>
                      {analysis.weaknesses?.length ? (
                        analysis.weaknesses.map((w, i) => (
                          <Text key={i} as="p" variant="bodySm">⚠ {w}</Text>
                        ))
                      ) : (
                        <Text as="p" variant="bodySm" tone="subdued">Aucune faiblesse identifiée.</Text>
                      )}
                    </BlockStack>
                  </Box>
                  <Box padding="400" background="bg-fill-info-secondary" borderRadius="200" borderWidth="025" borderColor="border-info">
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h4">Opportunités pour vous</Text>
                      {analysis.opportunities?.length ? (
                        analysis.opportunities.map((o, i) => (
                          <Text key={i} as="p" variant="bodySm">→ {o}</Text>
                        ))
                      ) : (
                        <Text as="p" variant="bodySm" tone="subdued">Aucune opportunité identifiée.</Text>
                      )}
                    </BlockStack>
                  </Box>
                  <Box padding="400" background="bg-fill-warning-secondary" borderRadius="200" borderWidth="025" borderColor="border-warning">
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h4">Recommandations actionnables</Text>
                      {analysis.recommendations?.length ? (
                        analysis.recommendations.map((r, i) => (
                          <Text key={i} as="p" variant="bodySm">💡 {r}</Text>
                        ))
                      ) : (
                        <Text as="p" variant="bodySm" tone="subdued">Aucune recommandation.</Text>
                      )}
                    </BlockStack>
                  </Box>
                </InlineGrid>
              )}
              {analysis && (
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h4">Signaux de confiance détectés</Text>
                  <InlineStack gap="200" wrap>
                    {analysis.trustSignals?.length ? analysis.trustSignals.map((t, i) => (
                      <Badge key={i} tone="success">{t}</Badge>
                    )) : (
                      <Text as="p" variant="bodySm" tone="subdued">Aucun signal de confiance détecté.</Text>
                    )}
                    {analysis.reviewSignals?.length ? analysis.reviewSignals.map((r, i) => (
                      <Badge key={`r-${i}`} tone="info">{r}</Badge>
                    )) : null}
                  </InlineStack>
                  <InlineStack gap="200">
                    <Badge tone="info">{analysis.imageCount ?? 0} image(s)</Badge>
                    {analysis.hasVideo && <Badge tone="attention">Vidéo présente</Badge>}
                  </InlineStack>
                  {analysis.diagnostic && (
                    <Box padding="300" background="bg-surface" borderRadius="150">
                      <Text as="p" variant="bodySm">{analysis.diagnostic}</Text>
                    </Box>
                  )}
                </BlockStack>
              )}
              {!analysis && !analysisLoading && !analysisError && (
                <Button
                  onClick={() => analysisFetcher.submit(
                    { intent: "analyze_competitor", watchedProductId: product.id, shopDomain },
                    { method: "post" },
                  )}
                  loading={analysisLoading}
                >
                  Lancer l'analyse de la page concurrente
                </Button>
              )}
              <Divider />
              <BlockStack gap="200">
                <Text variant="headingSm" as="h4">Historique des prix</Text>
                {product.priceHistory?.length ? (
                  product.priceHistory.slice(0, 5).map((h: any) => (
                    <Text key={h.id} as="p" variant="bodySm">
                      {new Date(h.capturedAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} — {Number(h.price).toFixed(2)} {h.currency}
                    </Text>
                  ))
                ) : (
                  <Text as="p" variant="bodySm" tone="subdued">Aucun historique.</Text>
                )}
              </BlockStack>
            </BlockStack>
          </Box>
        )}
      </BlockStack>
    </Card>
  );
}

// ── Composant : ligne d'un candidat concurrent ───────────────────────────────
function CandidateRow({
  candidate,
  index,
  shopDomain,
  productTitle,
  myPrice,
  contextualAction,
  addedIds,
  onAdd,
}: {
  candidate: any;
  index: number;
  shopDomain: string;
  productTitle: string;
  myPrice: number | null;
  contextualAction: string;
  addedIds: Set<string>;
  onAdd: (c: any) => void;
}) {
  const fetcher = useFetcher<{ success?: boolean; added?: boolean; error?: string; alreadyExists?: boolean }>();
  const isLoading = fetcher.state !== "idle";
  const isAdded = addedIds.has(candidate.domain) || (fetcher.data?.success && (fetcher.data?.added || fetcher.data?.alreadyExists));
  const hasError = fetcher.data && "error" in fetcher.data && !!fetcher.data.error;

  const pColor = candidate.platform ? (PLATFORM_COLORS[candidate.platform] ?? "#637381") : "#637381";
  const confidenceLabel = candidate.confidence === "elevee" ? "Pertinence élevée" : candidate.confidence === "moyenne" ? "Pertinence moyenne" : "Pertinence faible";
  const scorePercent = Math.round((candidate.score ?? 0) * 100);

  const effectiveTitle = productTitle || candidate.title || candidate.domain;

  const handleSurveiller = () => {
    const data: Record<string, string> = {
      intent: "add_watch_manual",
      shopDomain,
      myProductTitle: effectiveTitle,
      competitorName: candidate.domain,
      competitorUrl: candidate.url,
    };
    if (myPrice) data.myCurrentPrice = String(myPrice);
    fetcher.submit(data, { method: "post", action: contextualAction });
    onAdd(candidate);
  };

  return (
    <Box
      padding="300"
      borderWidth="025"
      borderColor="border"
      borderRadius="200"
      background={isAdded ? "bg-fill-success-secondary" : "bg-surface"}
    >
      <BlockStack gap="200">
        {hasError && (
          <Banner tone="critical">
            <Text as="p" variant="bodySm">{fetcher.data?.error}</Text>
          </Banner>
        )}
        <InlineStack align="space-between" blockAlign="start">
          <BlockStack gap="100">
            <InlineStack gap="200" blockAlign="center" wrap>
              <Text variant="bodyMd" as="p" fontWeight="bold">
                {index + 1}. {candidate.domain}
              </Text>
              {candidate.platform && (
                <span style={{
                  background: pColor,
                  color: "#fff",
                  padding: "2px 10px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}>
                  {candidate.platform}
                </span>
              )}
              {!candidate.platform && (
                <span style={{
                  background: "#e4e5e7",
                  color: "#303030",
                  padding: "2px 10px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}>
                  Site web
                </span>
              )}
              <Badge
                tone={
                  candidate.confidence === "elevee" ? "success"
                    : candidate.confidence === "moyenne" ? "warning"
                    : "attention"
                }
              >
                {confidenceLabel} ({scorePercent}%)
              </Badge>
            </InlineStack>
            <Text variant="bodySm" as="p" fontWeight="semibold">{candidate.title}</Text>
          </BlockStack>
          <InlineStack gap="200" blockAlign="center">
            <Button
              variant="plain"
              url={candidate.url}
              target="_blank"
              size="slim"
            >
              Visiter
            </Button>
            {isAdded ? (
              <Badge tone="success">Ajouté</Badge>
            ) : (
              <Button
                variant="primary"
                size="slim"
                loading={isLoading}
                onClick={handleSurveiller}
              >
                Surveiller
              </Button>
            )}
          </InlineStack>
        </InlineStack>
        {candidate.snippet && (
          <Text variant="bodySm" as="p" tone="subdued">
            {candidate.snippet.length > 180 ? candidate.snippet.slice(0, 180) + "…" : candidate.snippet}
          </Text>
        )}
        <InlineStack gap="200" wrap>
          <Text variant="bodySm" as="span" tone="subdued">{candidate.reason}</Text>
          {candidate.source && (
            <span style={{ fontSize: 11, color: "#8c9196", background: "#f6f6f7", padding: "1px 8px", borderRadius: 12 }}>
              via {candidate.source}
            </span>
          )}
        </InlineStack>
      </BlockStack>
    </Box>
  );
}

// ── Composant : panneau d'ajout de concurrent ─────────────────────────────────
const PLATFORM_COLORS: Record<string, string> = {
  Shopify: "#96bf48",
  WooCommerce: "#7f54b3",
  PrestaShop: "#df0067",
  BigCommerce: "#121118",
  Magento: "#f26322",
  Wix: "#0c6efc",
  Shopware: "#189eff",
  "E-commerce": "#2c6ecb",
};
const ALL_PLATFORMS = ["Tous", "Shopify", "WooCommerce", "PrestaShop", "Magento", "Wix", "Shopware", "E-commerce", "Site web"];

function PlatformFilterBar({
  filterPlatform,
  setFilterPlatform,
  platformCounts,
  hasResults,
}: {
  filterPlatform: string;
  setFilterPlatform: (p: string) => void;
  platformCounts: Record<string, number>;
  hasResults: boolean;
}) {
  const platforms = hasResults
    ? ALL_PLATFORMS.filter((p) => (platformCounts[p] ?? 0) > 0)
    : ALL_PLATFORMS;

  return (
    <Box padding="200" background="bg-surface-secondary" borderRadius="200">
      <BlockStack gap="150">
        <Text variant="bodySm" as="p" fontWeight="semibold">Filtrer par plateforme :</Text>
        <InlineStack gap="150" wrap>
          {platforms.map((p) => {
            const count = platformCounts[p] ?? 0;
            const isActive = filterPlatform === p;
            const color = PLATFORM_COLORS[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => setFilterPlatform(p)}
                style={{
                  padding: "5px 14px",
                  borderRadius: 20,
                  border: isActive ? "2px solid #111827" : "1px solid #c9cccf",
                  background: isActive ? "#111827" : "#fff",
                  color: isActive ? "#fff" : "#303030",
                  fontWeight: isActive ? 700 : 500,
                  fontSize: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "all 0.15s",
                }}
              >
                {color && (
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: isActive ? "#fff" : color, display: "inline-block", flexShrink: 0 }} />
                )}
                {p}
                {hasResults && <span style={{ opacity: 0.5, marginLeft: 2 }}>({count})</span>}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>
    </Box>
  );
}

function AddCompetitorPanel({
  products,
  shopDomain,
  contextualAction,
  limitReached,
  actionData,
}: {
  products: any[];
  shopDomain: string;
  contextualAction: string;
  limitReached: boolean;
  actionData: any;
}) {
  const discoverFetcher = useFetcher<{
    success?: boolean;
    discovered?: boolean;
    candidates?: any[];
    query?: string;
    error?: string;
  }>();
  const [selectedProduct, setSelectedProduct] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [addedDomains, setAddedDomains] = useState<Set<string>>(new Set());
  const [showManualForm, setShowManualForm] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState("Tous");
  const [maxResults, setMaxResults] = useState(25);

  const isSearching = discoverFetcher.state !== "idle";
  const allCandidates: any[] = discoverFetcher.data?.candidates ?? [];
  const searchQuery = discoverFetcher.data?.query ?? "";
  const searchError = discoverFetcher.data?.error;
  const hasResults = allCandidates.length > 0;

  const knownPlatformNames = ALL_PLATFORMS.slice(1);

  const filteredCandidates = allCandidates.filter((c) => {
    if (filterPlatform === "Tous") return true;
    if (filterPlatform === "Site web") return !c.platform;
    return c.platform === filterPlatform;
  }).slice(0, maxResults);

  const platformCounts = ALL_PLATFORMS.reduce<Record<string, number>>((acc, p) => {
    if (p === "Tous") { acc[p] = allCandidates.length; return acc; }
    if (p === "Site web") { acc[p] = allCandidates.filter((c) => !c.platform).length; return acc; }
    acc[p] = allCandidates.filter((c) => c.platform === p).length;
    return acc;
  }, {});

  const handleSearch = (limit = maxResults) => {
    if (manualMode) {
      if (!manualQuery.trim()) return;
      discoverFetcher.submit(
        { intent: "discover_competitors", shopDomain, discoveryMode: "manual", manualProduct: manualQuery, limit: String(limit) },
        { method: "post", action: contextualAction },
      );
    } else {
      if (!selectedProduct) return;
      discoverFetcher.submit(
        { intent: "discover_competitors", shopDomain, discoveryMode: "shopify", shopifyProductPacked: selectedProduct, limit: String(limit) },
        { method: "post", action: contextualAction },
      );
    }
  };

  const selectedTitle = (() => {
    if (manualMode) return manualQuery;
    if (!selectedProduct) return "";
    const [, titlePart] = selectedProduct.split("::");
    return decodeURIComponent(titlePart ?? "").trim();
  })();

  const selectedPrice = (() => {
    if (manualMode || !selectedProduct) return null;
    const parts = selectedProduct.split("::");
    const p = parseFloat(parts[3] ?? "0");
    return p > 0 ? p : null;
  })();

  const inputStyle: React.CSSProperties = {
    minHeight: 40,
    border: "1px solid #c9cccf",
    borderRadius: 8,
    padding: "8px 12px",
    background: "#ffffff",
    fontSize: 14,
    width: "100%",
  };

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="100">
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="headingMd" as="h3">Trouver des concurrents</Text>
            <InlineStack gap="150" blockAlign="center">
              <Text variant="bodySm" as="span" tone="subdued">Résultats max :</Text>
              <select
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value))}
                style={{ minHeight: 32, border: "1px solid #c9cccf", borderRadius: 6, padding: "4px 10px", background: "#fff", fontSize: 13, cursor: "pointer" }}
              >
                <option value={10}>Top 10</option>
                <option value={25}>Top 25</option>
                <option value={50}>Top 50</option>
              </select>
            </InlineStack>
          </InlineStack>
          <Text variant="bodySm" as="p" tone="subdued">
            Recherche sur DuckDuckGo + Bing + Google. Détection automatique des plateformes (Shopify, WooCommerce, PrestaShop...). Filtrez les résultats par type de site.
          </Text>
        </BlockStack>

        {actionData && "added" in actionData && actionData.added && (
          <Banner tone="success">
            <Text as="p">Concurrent ajouté avec succès et mis sous surveillance.</Text>
          </Banner>
        )}
        {actionData && "error" in actionData && actionData.error && (
          <Banner tone="critical">
            <Text as="p">{actionData.error}</Text>
          </Banner>
        )}

        {/* Filtres plateforme — toujours visibles */}
        <PlatformFilterBar
          filterPlatform={filterPlatform}
          setFilterPlatform={setFilterPlatform}
          platformCounts={platformCounts}
          hasResults={hasResults}
        />

        {/* Mode de recherche */}
        <InlineStack gap="200">
          <Button pressed={!manualMode} onClick={() => setManualMode(false)} size="slim">
            Depuis mes produits Shopify
          </Button>
          <Button pressed={manualMode} onClick={() => setManualMode(true)} size="slim">
            Recherche libre
          </Button>
        </InlineStack>

        {/* Champ + bouton */}
        {!manualMode ? (
          <InlineStack gap="200" blockAlign="end">
            <div style={{ flex: 1 }}>
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                disabled={limitReached}
                style={inputStyle}
              >
                <option value="" disabled>Choisir un produit Shopify...</option>
                {products.map((p: any) => (
                  <option
                    key={p.id}
                    value={`${p.id}::${encodeURIComponent(p.title ?? "")}::${encodeURIComponent(p.handle ?? "")}::${p.price ?? 0}`}
                  >
                    {p.title}{p.price ? ` (${p.price} €)` : ""}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="primary"
              onClick={() => handleSearch(maxResults)}
              loading={isSearching}
              disabled={!selectedProduct || limitReached}
            >
              {isSearching ? "Recherche en cours…" : "Trouver mes concurrents"}
            </Button>
          </InlineStack>
        ) : (
          <InlineStack gap="200" blockAlign="end">
            <div style={{ flex: 1 }}>
              <input
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch(maxResults)}
                placeholder='Ex: "leggings yoga femme", "montre connectée sport"…'
                style={inputStyle}
              />
            </div>
            <Button
              variant="primary"
              onClick={() => handleSearch(maxResults)}
              loading={isSearching}
              disabled={!manualQuery.trim() || limitReached}
            >
              {isSearching ? "Recherche en cours…" : "Trouver mes concurrents"}
            </Button>
          </InlineStack>
        )}

        {isSearching && (
          <Banner tone="info">
            <BlockStack gap="100">
              <Text as="p" fontWeight="semibold">Recherche en cours...</Text>
              <Text as="p" variant="bodySm">Analyse des résultats DuckDuckGo, Bing et Google. Détection des plateformes e-commerce en cours. Cela peut prendre jusqu'à 15 secondes.</Text>
            </BlockStack>
          </Banner>
        )}
        {searchError && !isSearching && (
          <Banner tone="critical">
            <Text as="p">{searchError}</Text>
          </Banner>
        )}

        {/* Résultats */}
        {hasResults && !isSearching && (
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingSm" as="h4">
                {filteredCandidates.length} concurrent{filteredCandidates.length > 1 ? "s" : ""} affiché{filteredCandidates.length > 1 ? "s" : ""}
                {filterPlatform !== "Tous" ? ` (${filterPlatform})` : ""}
                {" "}sur {allCandidates.length} trouvé{allCandidates.length > 1 ? "s" : ""} pour « {searchQuery} »
              </Text>
            </InlineStack>

            {filteredCandidates.length === 0 ? (
              <Banner tone="info">
                <Text as="p">Aucune boutique "{filterPlatform}" dans les résultats. Sélectionnez "Tous" pour voir l'ensemble.</Text>
              </Banner>
            ) : (
              <BlockStack gap="150">
                {filteredCandidates.map((c: any, idx: number) => (
                  <CandidateRow
                    key={c.domain}
                    candidate={c}
                    index={idx}
                    shopDomain={shopDomain}
                    productTitle={selectedTitle}
                    myPrice={selectedPrice}
                    contextualAction={contextualAction}
                    addedIds={addedDomains}
                    onAdd={(added) => setAddedDomains((prev) => new Set([...prev, added.domain]))}
                  />
                ))}
              </BlockStack>
            )}
          </BlockStack>
        )}

        {allCandidates.length === 0 && discoverFetcher.data?.discovered === true && !isSearching && (
          <Banner tone="warning">
            <BlockStack gap="100">
              <Text as="p" fontWeight="semibold">Aucun concurrent trouvé</Text>
              <Text as="p" variant="bodySm">
                Essayez avec une requête plus précise. Par exemple, ajoutez le type de produit exact, la niche ou la catégorie.
                Sinon, utilisez "Ajouter via URL directe" ci-dessous pour ajouter un concurrent manuellement.
              </Text>
            </BlockStack>
          </Banner>
        )}

        <Divider />

        <InlineStack>
          <Button variant="plain" onClick={() => setShowManualForm((v) => !v)} size="slim">
            {showManualForm ? "Masquer le formulaire" : "Ajouter un concurrent manuellement (URL directe)"}
          </Button>
        </InlineStack>

        {showManualForm && (
          <ManualAddForm contextualAction={contextualAction} shopDomain={shopDomain} />
        )}
      </BlockStack>
    </Card>
  );
}

// ── Composant : formulaire d'ajout manuel avec feedback ───────────────────────
function ManualAddForm({ contextualAction, shopDomain }: { contextualAction: string; shopDomain: string }) {
  const fetcher = useFetcher<any>();
  const [myProductTitle, setMyProductTitle] = useState("");
  const [myCurrentPrice, setMyCurrentPrice] = useState("");
  const [competitorName, setCompetitorName] = useState("");
  const [competitorUrl, setCompetitorUrl] = useState("");

  const isSubmitting = fetcher.state !== "idle";
  const data = fetcher.data;
  const success = data?.success && !data?.alreadyExists;
  const alreadyExists = data?.alreadyExists;
  const error = data?.error;

  const isUrlHomepage = (() => {
    try { return new URL(competitorUrl).pathname === "/" || new URL(competitorUrl).pathname === ""; } catch { return false; }
  })();

  const handleSubmit = () => {
    if (!myProductTitle || !competitorUrl) return;
    const formData: Record<string, string> = {
      intent: "add_watch_manual",
      shopDomain,
      myProductTitle,
      competitorUrl,
    };
    if (competitorName) formData.competitorName = competitorName;
    if (myCurrentPrice) formData.myCurrentPrice = myCurrentPrice;
    fetcher.submit(formData, { method: "post", action: contextualAction });
  };

  useEffect(() => {
    if (success) {
      setMyProductTitle("");
      setMyCurrentPrice("");
      setCompetitorName("");
      setCompetitorUrl("");
    }
  }, [success]);

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", border: "1px solid #ccc", borderRadius: 8, fontSize: 14, width: "100%",
  };

  return (
    <BlockStack gap="200">
      {success && (
        <Banner tone="success" onDismiss={() => {}}>
          <BlockStack gap="100">
            <Text as="p" fontWeight="semibold">Concurrent ajouté avec succès !</Text>
            {data?.detectedPrice && <Text as="p">Prix détecté : {data.detectedPrice} €</Text>}
            {data?.detectedTitle && <Text as="p">Produit trouvé : {data.detectedTitle}</Text>}
            {data?.resolvedUrl && <Text as="p">URL produit résolue : {data.resolvedUrl}</Text>}
            {data?.noPrice && <Text as="p" tone="caution">Prix non détecté — il sera récupéré lors de la prochaine vérification ou ajoutez l'URL directe du produit.</Text>}
          </BlockStack>
        </Banner>
      )}
      {alreadyExists && (
        <Banner tone="warning" onDismiss={() => {}}>
          <Text as="p">Ce concurrent est déjà surveillé.</Text>
        </Banner>
      )}
      {error && (
        <Banner tone="critical" onDismiss={() => {}}>
          <Text as="p">{error}</Text>
        </Banner>
      )}

      <Banner tone="info">
        <Text as="p">
          Pour un suivi des prix optimal, utilisez l'URL directe d'un produit concurrent
          (ex: https://boutique.com/products/nom-du-produit).
          Si vous collez l'URL de la boutique, nous essaierons de trouver le produit automatiquement.
        </Text>
      </Banner>

      {competitorUrl && isUrlHomepage && myProductTitle && (
        <Banner tone="warning">
          <Text as="p">
            L'URL semble être une page d'accueil. Nous allons rechercher "{myProductTitle}" sur ce site automatiquement.
            Pour de meilleurs résultats, collez directement l'URL de la page produit.
          </Text>
        </Banner>
      )}

      <InlineGrid columns={2} gap="200">
        <input
          name="myProductTitle" placeholder="Nom de votre produit *" style={inputStyle}
          value={myProductTitle} onChange={(e) => setMyProductTitle(e.target.value)}
        />
        <input
          name="myCurrentPrice" type="number" step="0.01" placeholder="Votre prix (optionnel)" style={inputStyle}
          value={myCurrentPrice} onChange={(e) => setMyCurrentPrice(e.target.value)}
        />
        <input
          name="competitorUrl" type="url" placeholder="URL du produit concurrent ou de la boutique *" style={inputStyle}
          value={competitorUrl} onChange={(e) => setCompetitorUrl(e.target.value)}
        />
        <input
          name="competitorName" placeholder="Nom du concurrent (auto-détecté si vide)" style={inputStyle}
          value={competitorName} onChange={(e) => setCompetitorName(e.target.value)}
        />
      </InlineGrid>
      <Button onClick={handleSubmit} variant="primary" loading={isSubmitting}>
        {isSubmitting ? "Ajout en cours..." : "Ajouter et surveiller"}
      </Button>
    </BlockStack>
  );
}

// ── Composant : carte d'une alerte récente ────────────────────────────────────
function AlertRow({ alert }: { alert: any }) {
  const alertColor =
    alert.alertType === "PRICE_DROP" || alert.alertType === "PROMOTION_STARTED"
      ? "critical"
      : "success";

  const icon =
    alert.alertType === "PRICE_DROP"
      ? "↓"
      : alert.alertType === "PRICE_INCREASE"
      ? "↑"
      : "🏷";

  return (
    <Box
      padding="300"
      borderWidth="025"
      borderColor="border"
      borderRadius="200"
      background={!alert.isRead ? "bg-surface-warning" : undefined}
    >
      <InlineStack align="space-between" blockAlign="start">
        <InlineStack gap="200" blockAlign="start">
          <Text variant="headingMd" as="span">{icon}</Text>
          <BlockStack gap="100">
            <Text variant="bodyMd" as="p" fontWeight="semibold">
              {alert.title}
            </Text>
            <Text variant="bodySm" as="p" tone="subdued">
              {new Date(alert.createdAt).toLocaleString("fr-FR")}
            </Text>
            {alert.suggestion && (
              <Box
                padding="200"
                background="bg-surface-secondary"
                borderRadius="100"
              >
                <Text variant="bodySm" as="p" tone="subdued">
                  💡 {alert.suggestion}
                </Text>
              </Box>
            )}
          </BlockStack>
        </InlineStack>
        {!alert.isRead && (
          <Badge tone="attention">Nouveau</Badge>
        )}
      </InlineStack>
    </Box>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function CompetitiveDashboard() {
  const {
    watchedProducts,
    unreadAlerts,
    recentAlerts,
    plan,
    limit,
    current,
    products,
    shopDomain,
    automationAccess,
  } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const location = useLocation();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isRunningChecks = navigation.state === "submitting";
  const isActionBusy = navigation.state === "submitting";
  const limitReached = limit !== -1 && current >= limit;
  const contextualAction = `${location.pathname}${location.search ?? ""}`;
  const scrollToQuickAdd = () => {
    if (typeof document !== "undefined") {
      document.getElementById("quick-add")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <Page
      title="Veille concurrentielle"
      subtitle="Analyse détaillée de vos concurrents : forces, faiblesses, opportunités et recommandations"
      primaryAction={{
        content: "Vérifier tous les prix",
        disabled: watchedProducts.length === 0,
        onAction: () => submit({ intent: "run_checks" }, { method: "post" }),
      }}
      secondaryActions={[
        {
          content: "Ajouter une surveillance",
          disabled: limitReached,
          onAction: scrollToQuickAdd,
        },
      ]}
    >
      <BlockStack gap="500">

        {unreadAlerts > 0 ? (
          <Banner tone="critical">
            <BlockStack gap="200">
              <InlineStack gap="200" align="space-between" blockAlign="center">
                <Text as="p">
                  <strong>{unreadAlerts} nouvelle{unreadAlerts > 1 ? "s" : ""} alerte{unreadAlerts > 1 ? "s" : ""}</strong>
                  {" "}— un concurrent a changé son prix !
                </Text>
                <InlineStack gap="200">
                  <Button
                    variant="plain"
                    onClick={() => submit({ intent: "mark_all_read" }, { method: "post" })}
                  >
                    Tout marquer comme lu
                  </Button>
                  <Button url="/app/competitive/alerts">
                    Voir les alertes
                  </Button>
                </InlineStack>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                Plan {plan} — {current}/{limit === -1 ? "∞" : limit} produits surveillés
              </Text>
            </BlockStack>
          </Banner>
        ) : (
          <Banner tone={limitReached ? "warning" : "info"}>
            <InlineStack gap="200" align="space-between" blockAlign="center">
              <Text as="p">
                Plan <Badge tone="info">{plan}</Badge> — Produits surveillés :{" "}
                <strong>{current}/{limit === -1 ? "∞" : limit}</strong>
              </Text>
              {limitReached && (
                <Button variant="primary" onClick={() => navigate("/app/billing")}>
                  Passer au Pro ($19/mois)
                </Button>
              )}
            </InlineStack>
          </Banner>
        )}

        {/* Produits surveillés — contenu principal avec analyse détaillée */}
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="headingLg" as="h2">Mes produits sous surveillance</Text>
            <InlineStack gap="200">
              <Button
                variant="primary"
                onClick={scrollToQuickAdd}
                disabled={limitReached}
              >
                Ajouter un produit
              </Button>
              <Tooltip content="Lance une vérification manuelle de tous les prix">
                <Button
                  onClick={() => submit({ intent: "run_checks" }, { method: "post" })}
                  loading={isRunningChecks}
                  disabled={watchedProducts.length === 0}
                >
                  {isRunningChecks ? "Vérification..." : "Vérifier les prix"}
                </Button>
              </Tooltip>
            </InlineStack>
          </InlineStack>

          {watchedProducts.length === 0 ? (
            <Card>
              <EmptyState
                heading="Aucun produit surveillé"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                action={{
                  content: "Ajouter un produit concurrent",
                  onAction: scrollToQuickAdd,
                }}
              >
                <p>
                  Ajoutez vos concurrents pour obtenir une analyse détaillée : points forts,
                  faiblesses, opportunités et recommandations actionnables.
                </p>
              </EmptyState>
            </Card>
          ) : (
            <InlineGrid columns={2} gap="400">
              {watchedProducts.map((wp: any) => (
                <WatchedProductCard
                  key={wp.id}
                  product={wp}
                  submit={submit}
                  shopDomain={shopDomain}
                  actionBusy={isActionBusy}
                  actionData={actionData}
                />
              ))}
            </InlineGrid>
          )}
        </BlockStack>

        {/* ── Section : Trouver & surveiller des concurrents ─────────── */}
        <div id="quick-add">
        <AddCompetitorPanel
          products={products}
          shopDomain={shopDomain}
          contextualAction={contextualAction}
          limitReached={limitReached}
          actionData={actionData}
        />
        </div>

        <Layout>
          <Layout.Section>
            {/* Alertes récentes ─────────────────────────────────────── */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h3">Alertes récentes</Text>
                  {unreadAlerts > 0 && (
                    <Badge tone="critical">{unreadAlerts}</Badge>
                  )}
                </InlineStack>

                {recentAlerts.length === 0 ? (
                  <Text variant="bodySm" as="p" tone="subdued">
                    Aucune alerte pour l'instant. Les alertes apparaîtront
                    dès qu'un concurrent changera son prix.
                  </Text>
                ) : (
                  <BlockStack gap="200">
                    {recentAlerts.slice(0, 5).map((alert: any) => (
                      <AlertRow key={alert.id} alert={alert} />
                    ))}
                    {recentAlerts.length > 5 && (
                      <Button
                        variant="plain"
                        url="/app/competitive/alerts"
                      >
                        Voir toutes les alertes →
                      </Button>
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* Explication du module ────────────────────────────────── */}
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h3">Comment ça fonctionne</Text>
                {[
                  { step: "1", text: "Ajoutez un concurrent (auto ou manuel)" },
                  { step: "2", text: "Cliquez sur « Voir l'analyse concurrentielle »" },
                  { step: "3", text: "Forces, faiblesses, opportunités et recommandations" },
                  { step: "4", text: "Alertes automatiques si le prix change" },
                ].map((item) => (
                  <Box
                    key={item.step}
                    padding="200"
                    borderWidth="025"
                    borderColor="border"
                    borderRadius="100"
                  >
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone="info">{item.step}</Badge>
                      <Text variant="bodySm" as="p">{item.text}</Text>
                    </InlineStack>
                  </Box>
                ))}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
