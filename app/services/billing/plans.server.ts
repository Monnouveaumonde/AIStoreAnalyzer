import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "../../db.server";

export const PLANS = {
  FREE: {
    name: "Free",
    price: 0,
    analysisLimit: 3,
    features: [
      "3 analyses par mois",
      "Score global de la boutique",
      "Recommandations de base",
    ],
  },
  PRO: {
    name: "Pro",
    price: 19,
    analysisLimit: 20,
    features: [
      "20 analyses par mois",
      "Rapport détaillé complet",
      "Coaching IA personnalisé",
      "Export PDF",
      "Rapport viral partageable",
    ],
  },
  GROWTH: {
    name: "Growth",
    price: 49,
    analysisLimit: -1, // illimité
    features: [
      "Analyses illimitées",
      "Rapport détaillé complet",
      "Coaching IA avancé",
      "Export PDF",
      "Rapport viral partageable",
      "Benchmarking sectoriel",
      "Alertes automatiques",
      "Support prioritaire",
    ],
  },
} as const;

export type PlanType = keyof typeof PLANS;

export async function createSubscription(
  admin: AdminApiContext,
  plan: PlanType,
  shopDomain: string
): Promise<string | null> {
  if (plan === "FREE") return null;

  const planConfig = PLANS[plan];

  const response = await admin.graphql(`
    mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
      appSubscriptionCreate(
        name: $name
        lineItems: $lineItems
        returnUrl: $returnUrl
        test: $test
      ) {
        appSubscription { id }
        confirmationUrl
        userErrors { field message }
      }
    }
  `, {
    variables: {
      name: `ShopPulseAi - ${planConfig.name}`,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: planConfig.price, currencyCode: "USD" },
              interval: "EVERY_30_DAYS",
            },
          },
        },
      ],
      returnUrl: `${process.env.APP_URL}/app/billing/callback?plan=${plan}&shop=${shopDomain}`,
      test: process.env.NODE_ENV !== "production",
    },
  });

  const data = await response.json();
  const result = data.data?.appSubscriptionCreate;

  if (result?.userErrors?.length > 0) {
    console.error("Billing errors:", result.userErrors);
    return null;
  }

  return result?.confirmationUrl || null;
}

export async function checkAndResetMonthlyLimits(shopDomain: string): Promise<void> {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return;

  const now = new Date();
  const monthsSinceReset = (now.getTime() - shop.monthlyReset.getTime()) / (1000 * 60 * 60 * 24 * 30);

  if (monthsSinceReset >= 1) {
    await prisma.shop.update({
      where: { shopDomain },
      data: { analysisCount: 0, monthlyReset: now },
    });
  }
}

export async function canRunAnalysis(shopDomain: string): Promise<{ allowed: boolean; reason?: string }> {
  await checkAndResetMonthlyLimits(shopDomain);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: { subscription: true },
  });

  if (!shop) return { allowed: false, reason: "Boutique non trouvée" };

  const plan = shop.plan as PlanType;
  const limit = PLANS[plan].analysisLimit;

  if (limit === -1) return { allowed: true };
  if (shop.analysisCount >= limit) {
    return {
      allowed: false,
      reason: `Limite atteinte (${shop.analysisCount}/${limit}). Passez au plan supérieur pour plus d'analyses.`,
    };
  }

  return { allowed: true };
}
