import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineGrid,
  Box,
  InlineStack,
  Badge,
  Divider,
  Banner,
  ProgressBar,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: {
      analyses: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { opportunities: true },
      },
      subscription: true,
    },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { shopDomain, shopName: shopDomain },
      include: {
        analyses: { orderBy: { createdAt: "desc" }, take: 5, include: { opportunities: true } },
        subscription: true,
      },
    });
  }

  const latestAnalysis = shop.analyses[0] || null;
  const planLimits = {
    FREE: 3,
    PRO: 20,
    GROWTH: -1,
  };
  const limit = planLimits[shop.plan as keyof typeof planLimits] || 3;
  const remaining = limit === -1 ? "illimité" : `${limit - shop.analysisCount}/${limit}`;

  return json({
    shop: {
      domain: shop.shopDomain,
      name: shop.shopName,
      plan: shop.plan,
      analysisCount: shop.analysisCount,
      remaining,
    },
    latestAnalysis: latestAnalysis
      ? {
          id: latestAnalysis.id,
          overallScore: latestAnalysis.overallScore,
          seoScore: latestAnalysis.seoScore,
          speedScore: latestAnalysis.speedScore,
          productScore: latestAnalysis.productScore,
          conversionScore: latestAnalysis.conversionScore,
          uxScore: latestAnalysis.uxScore,
          trustScore: latestAnalysis.trustScore,
          pricingScore: latestAnalysis.pricingScore,
          opportunityCount: latestAnalysis.opportunities.length,
          createdAt: latestAnalysis.createdAt,
        }
      : null,
    recentAnalyses: shop.analyses.map((a) => ({
      id: a.id,
      overallScore: a.overallScore,
      createdAt: a.createdAt,
    })),
  });
};

function ScoreCircle({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? "success" : score >= 50 ? "warning" : "critical";
  return (
    <Box padding="300" borderWidth="025" borderColor="border" borderRadius="200">
      <BlockStack gap="200" align="center" inlineAlign="center">
        <Text variant="headingXl" as="p" alignment="center" fontWeight="bold">
          {Math.round(score)}
        </Text>
        <ProgressBar progress={score} tone={color} size="small" />
        <Text variant="bodySm" as="p" alignment="center" tone="subdued">
          {label}
        </Text>
      </BlockStack>
    </Box>
  );
}

export default function Dashboard() {
  const { shop, latestAnalysis, recentAnalyses } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Page title="AI Store Analyzer" subtitle={`${shop.name || shop.domain}`}>
      <BlockStack gap="500">
        <Banner tone="info">
          <InlineStack gap="200" align="space-between" blockAlign="center">
            <Text as="p">
              Plan <Badge tone="info">{shop.plan}</Badge> — Analyses restantes : {shop.remaining}
            </Text>
            {shop.plan === "FREE" && (
              <Button variant="primary" onClick={() => navigate("/app/billing")}>
                Passer au Pro
              </Button>
            )}
          </InlineStack>
        </Banner>

        {!latestAnalysis ? (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400" align="center" inlineAlign="center">
                  <Text variant="headingLg" as="h2">
                    Bienvenue dans AI Store Analyzer
                  </Text>
                  <Text variant="bodyMd" as="p" tone="subdued">
                    Lancez votre première analyse pour obtenir votre Store Score et
                    découvrir les opportunités de croissance de votre boutique.
                  </Text>
                  <Button variant="primary" size="large" onClick={() => navigate("/app/analyze")}>
                    Lancer ma première analyse
                  </Button>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        ) : (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingLg" as="h2">Store Score</Text>
                    <Button onClick={() => navigate("/app/analyze")}>Nouvelle analyse</Button>
                  </InlineStack>

                  <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="200" align="center" inlineAlign="center">
                      <Text variant="heading3xl" as="p" fontWeight="bold">
                        {Math.round(latestAnalysis.overallScore)}/100
                      </Text>
                      <ProgressBar
                        progress={latestAnalysis.overallScore}
                        tone={latestAnalysis.overallScore >= 70 ? "success" : latestAnalysis.overallScore >= 40 ? "warning" : "critical"}
                        size="small"
                      />
                      <Text variant="bodySm" as="p" tone="subdued">
                        {latestAnalysis.opportunityCount} opportunités de revenus détectées
                      </Text>
                    </BlockStack>
                  </Box>

                  <Divider />

                  <InlineGrid columns={4} gap="300">
                    <ScoreCircle score={latestAnalysis.seoScore} label="SEO" />
                    <ScoreCircle score={latestAnalysis.speedScore} label="Vitesse" />
                    <ScoreCircle score={latestAnalysis.productScore} label="Produits" />
                    <ScoreCircle score={latestAnalysis.conversionScore} label="Conversion" />
                  </InlineGrid>
                  <InlineGrid columns={3} gap="300">
                    <ScoreCircle score={latestAnalysis.uxScore} label="UX" />
                    <ScoreCircle score={latestAnalysis.trustScore} label="Trust" />
                    <ScoreCircle score={latestAnalysis.pricingScore} label="Prix" />
                  </InlineGrid>

                  <InlineStack gap="300" align="end">
                    <Button onClick={() => navigate(`/app/report/${latestAnalysis.id}`)}>
                      Voir le rapport complet
                    </Button>
                    <Button variant="primary" onClick={() => navigate("/app/analyze")}>
                      Relancer l'analyse
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">Historique</Text>
                  {recentAnalyses.map((a) => (
                    <Box
                      key={a.id}
                      padding="200"
                      borderWidth="025"
                      borderColor="border"
                      borderRadius="100"
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <Text variant="bodyMd" as="p" fontWeight="semibold">
                            Score: {Math.round(a.overallScore)}/100
                          </Text>
                          <Text variant="bodySm" as="p" tone="subdued">
                            {new Date(a.createdAt).toLocaleDateString("fr-FR")}
                          </Text>
                        </BlockStack>
                        <Button
                          variant="plain"
                          onClick={() => navigate(`/app/report/${a.id}`)}
                        >
                          Voir
                        </Button>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}
      </BlockStack>
    </Page>
  );
}
