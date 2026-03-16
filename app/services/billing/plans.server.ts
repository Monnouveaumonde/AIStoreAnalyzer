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
      "Boutons \"Faire moi-même\" sur chaque conseil",
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
      "SEO Optimizer (scan + correction auto)",
      "Veille concurrentielle (prix, alertes)",
      "Rapport viral partageable",
      "Compatible Automation+ (+5$/mois)",
    ],
  },
  GROWTH: {
    name: "Growth",
    price: 49,
    analysisLimit: -1,
    features: [
      "Analyses illimitées",
      "Rapport détaillé complet",
      "Coaching IA avancé",
      "SEO Optimizer (scan + correction auto)",
      "Veille concurrentielle illimitée",
      "Rapport viral partageable",
      "Benchmarking sectoriel",
      "Alertes automatiques",
      "Support prioritaire",
      "Compatible Automation+ (+5$/mois)",
    ],
  },
} as const;

export type PlanType = keyof typeof PLANS;
export type FeatureKey =
  | "competitive_compare_advanced"
  | "competitive_automation_plus"
  | "seo_optimizer";

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

export async function createAutomationAddonSubscription(
  admin: AdminApiContext,
  shopDomain: string
): Promise<string | null> {
  const response = await admin.graphql(
    `
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
  `,
    {
      variables: {
        name: "ShopPulseAi - Automation+ Addon",
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: 5, currencyCode: "USD" },
                interval: "EVERY_30_DAYS",
              },
            },
          },
        ],
        returnUrl: `${process.env.APP_URL}/app/billing/callback?addon=automation_plus&shop=${shopDomain}`,
        test: process.env.NODE_ENV !== "production",
      },
    }
  );

  const data = await response.json();
  const result = data.data?.appSubscriptionCreate;
  if (result?.userErrors?.length > 0) {
    console.error("Addon billing errors:", result.userErrors);
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

export async function hasPaidModulesAccess(shopDomain: string): Promise<{ allowed: boolean; reason?: string }> {
  return hasFeatureAccess(shopDomain, "competitive_compare_advanced");
}

export async function hasFeatureAccess(
  shopDomain: string,
  feature: FeatureKey
): Promise<{ allowed: boolean; reason?: string }> {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: { subscription: true },
  });

  if (!shop) return { allowed: false, reason: "Boutique non trouvée" };
  const isPaidPlan = shop.plan === "PRO" || shop.plan === "GROWTH";

  if (feature === "competitive_compare_advanced" || feature === "seo_optimizer") {
    if (!isPaidPlan) {
      return {
        allowed: false,
        reason: "Module réservé aux plans payants (Pro ou Growth).",
      };
    }
    return { allowed: true };
  }

  if (feature === "competitive_automation_plus") {
    if (!isPaidPlan) {
      return { allowed: false, reason: "Automation+ disponible sur PRO ou GROWTH." };
    }
    if (!shop.subscription?.automationAddonActive) {
      return { allowed: false, reason: "Activez l'option Automation+ (+$5/mois)." };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: "Feature non reconnue." };
}
