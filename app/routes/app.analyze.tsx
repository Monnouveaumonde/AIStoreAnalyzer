import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  ProgressBar,
  Spinner,
  Box,
  Badge,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { runFullAnalysis } from "../services/analyzers";
import { detectOpportunities, calculateTotalRevenueImpact } from "../services/opportunities.server";
import { generateAiInsights } from "../services/ai/insights.server";
import { canRunAnalysis } from "../services/billing/plans.server";
import { nanoid } from "../lib/utils.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const check = await canRunAnalysis(session.shop);
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    select: { plan: true },
  });

  return json({
    canAnalyze: check.allowed,
    reason: check.reason,
    shopDomain: session.shop,
    plan: shop?.plan ?? "FREE",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const check = await canRunAnalysis(shopDomain);
  if (!check.allowed) {
    return json({ error: check.reason }, { status: 403 });
  }

  try {
    const analysisResult = await runFullAnalysis(admin, shopDomain);
    const opportunities = detectOpportunities(analysisResult);

    let aiInsights = "";
    try {
      aiInsights = await generateAiInsights(analysisResult, opportunities, shopDomain);
    } catch (e) {
      console.error("AI insights generation failed:", e);
    }

    const shareSlug = `${shopDomain.replace(".myshopify.com", "")}-${nanoid(8)}`;

    let shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shop) {
      shop = await prisma.shop.create({ data: { shopDomain, shopName: shopDomain } });
    }

    const analysis = await prisma.analysis.create({
      data: {
        shopId: shop.id,
        overallScore: analysisResult.overallScore,
        seoScore: analysisResult.seo.score,
        speedScore: analysisResult.speed.score,
        productScore: analysisResult.products.score,
        conversionScore: analysisResult.conversion.score,
        uxScore: analysisResult.ux.score,
        trustScore: analysisResult.trust.score,
        pricingScore: analysisResult.pricing.score,
        seoDetails: analysisResult.seo.details as any,
        speedDetails: analysisResult.speed.details as any,
        productDetails: analysisResult.products.details as any,
        conversionDetails: analysisResult.conversion.details as any,
        uxDetails: analysisResult.ux.details as any,
        trustDetails: analysisResult.trust.details as any,
        pricingDetails: analysisResult.pricing.details as any,
        aiInsights,
        status: "COMPLETED",
        shareSlug,
        isPublic: true,
        opportunities: {
          create: opportunities.map((opp) => ({
            type: opp.type as any,
            title: opp.title,
            description: opp.description,
            estimatedImpact: opp.estimatedImpact,
            impactPercent: opp.impactPercent,
            priority: opp.priority as any,
            category: opp.category,
          })),
        },
        recommendations: {
          create: [
            ...analysisResult.seo.recommendations.map((r) => ({
              category: "SEO",
              title: r,
              description: r,
              actionSteps: [r],
              difficulty: "MEDIUM" as const,
              impact: "MEDIUM" as const,
            })),
            ...analysisResult.products.recommendations.map((r) => ({
              category: "Produits",
              title: r,
              description: r,
              actionSteps: [r],
              difficulty: "MEDIUM" as const,
              impact: "HIGH" as const,
            })),
            ...analysisResult.trust.recommendations.map((r) => ({
              category: "Trust",
              title: r,
              description: r,
              actionSteps: [r],
              difficulty: "EASY" as const,
              impact: "HIGH" as const,
            })),
          ],
        },
      },
      include: { opportunities: true },
    });

    await prisma.shop.update({
      where: { shopDomain },
      data: { analysisCount: { increment: 1 } },
    });

    return json({
      success: true,
      analysisId: analysis.id,
      score: analysis.overallScore,
      totalImpact: calculateTotalRevenueImpact(opportunities),
    });
  } catch (error) {
    console.error("Analysis error:", error);
    return json({ error: "Une erreur est survenue pendant l'analyse." }, { status: 500 });
  }
};

export default function AnalyzePage() {
  const { canAnalyze, reason, shopDomain, plan } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const isAnalyzing = navigation.state === "submitting";

  return (
    <Page
      title="Analyser votre boutique"
      subtitle={shopDomain}
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Lancer une analyse complète
              </Text>
              <Text variant="bodyMd" as="p">
                Notre IA va analyser 7 dimensions de votre boutique : SEO, Vitesse,
                Pages produits, Conversion, UX, Trust et Prix.
              </Text>

              {!canAnalyze && reason && (
                <Banner tone="warning">
                  <Text as="p">{reason}</Text>
                </Banner>
              )}

              {isAnalyzing && (
                <Box padding="600">
                  <BlockStack gap="400" align="center" inlineAlign="center">
                    <Spinner size="large" />
                    <Text variant="bodyMd" as="p">
                      Analyse en cours... Cela peut prendre 15 à 30 secondes.
                    </Text>
                    <ProgressBar progress={50} tone="highlight" />
                    {plan === "FREE" && (
                      <Banner tone="info">
                        <Text as="p">
                          Pendant que l'analyse tourne : debloquez les modules SEO Optimizer et
                          Espionnage concurrentiel avec un plan payant.
                        </Text>
                        <Button url="/app/billing">Voir les plans</Button>
                      </Banner>
                    )}
                  </BlockStack>
                </Box>
              )}

              {actionData && "success" in actionData && actionData.success && (
                <Banner tone="success">
                  <BlockStack gap="200">
                    <Text as="p" fontWeight="bold">
                      Analyse terminée ! Score : {actionData.score}/100
                    </Text>
                    <Text as="p">
                      Potentiel d'augmentation des revenus : +{actionData.totalImpact}%
                    </Text>
                    <Button url={`/app/report/${actionData.analysisId}`}>
                      Voir le rapport complet
                    </Button>
                  </BlockStack>
                </Banner>
              )}

              {actionData && "error" in actionData && (
                <Banner tone="critical">
                  <Text as="p">{actionData.error}</Text>
                </Banner>
              )}

              <Button
                variant="primary"
                size="large"
                disabled={!canAnalyze || isAnalyzing}
                onClick={() => submit(null, { method: "post" })}
                loading={isAnalyzing}
              >
                {isAnalyzing ? "Analyse en cours..." : "Lancer l'analyse"}
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h3">Ce qui est analysé</Text>
              {[
                { label: "SEO", desc: "Titles, descriptions, alt texts, structure" },
                { label: "Vitesse", desc: "Core Web Vitals, LCP, FCP, CLS" },
                { label: "Produits", desc: "Descriptions, images, variantes, prix" },
                { label: "Conversion", desc: "Réductions, collections, organisation" },
                { label: "UX", desc: "Navigation, pages essentielles, thème" },
                { label: "Trust", desc: "Politiques, avis, badges, sécurité" },
                { label: "Prix", desc: "Prix barrés, distribution, stratégie" },
              ].map((item) => (
                <Box key={item.label} padding="200" borderWidth="025" borderColor="border" borderRadius="100">
                  <BlockStack gap="100">
                    <Text variant="bodyMd" as="p" fontWeight="semibold">{item.label}</Text>
                    <Text variant="bodySm" as="p" tone="subdued">{item.desc}</Text>
                  </BlockStack>
                </Box>
              ))}
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h3">Modules premium</Text>
                {plan === "FREE" ? (
                  <Badge tone="attention">Verrouille en Free</Badge>
                ) : (
                  <Badge tone="success">Inclus dans votre plan</Badge>
                )}
              </InlineStack>
              <Text variant="bodySm" as="p" tone="subdued">
                Activez ces modules pour transformer le diagnostic en actions automatiques
                (optimisation SEO et reponse aux variations de prix concurrentes).
              </Text>
              <BlockStack gap="200">
                <Box padding="200" borderWidth="025" borderColor="border" borderRadius="100">
                  <Text variant="bodySm" as="p" fontWeight="semibold">SEO Optimizer</Text>
                  <Text variant="bodySm" as="p" tone="subdued">Corrections SEO assistees par IA.</Text>
                </Box>
                <Box padding="200" borderWidth="025" borderColor="border" borderRadius="100">
                  <Text variant="bodySm" as="p" fontWeight="semibold">Espionnage concurrentiel</Text>
                  <Text variant="bodySm" as="p" tone="subdued">Alertes prix + suggestions de reaction.</Text>
                </Box>
              </BlockStack>
              {plan === "FREE" ? (
                <Button variant="primary" url="/app/billing">
                  Debloquer les modules
                </Button>
              ) : (
                <InlineStack gap="200">
                  <Button url="/app/seo">Ouvrir SEO</Button>
                  <Button url="/app/competitive">Ouvrir Watcher</Button>
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
