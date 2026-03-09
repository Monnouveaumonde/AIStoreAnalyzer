import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  InlineGrid,
  Box,
  Divider,
  Badge,
  InlineStack,
  Button,
  List,
  ProgressBar,
  Collapsible,
  Toast,
  Frame,
} from "@shopify/polaris";
import { useState, useCallback, Fragment } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * AiInsightsRenderer
 *
 * Parser Markdown minimal — SANS dangerouslySetInnerHTML, donc sans risque XSS.
 * Supporte :  ## Titre → <Text headingMd>
 *             **gras** → <Text fontWeight="bold">
 *             - item   → <List.Item>
 *             texte    → <Text bodyMd>
 *
 * Approuvé Shopify App Store : aucune injection HTML, uniquement composants React.
 */
function AiInsightsRenderer({ content }: { content: string }) {
  const lines = content.split("\n");

  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    elements.push(
      <List key={`list-${key}`}>
        {listItems.map((item, i) => (
          <List.Item key={i}>{renderInline(item)}</List.Item>
        ))}
      </List>
    );
    listItems = [];
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Titre ## ou ###
    if (/^#{2,3}\s/.test(trimmed)) {
      flushList(String(idx));
      const title = trimmed.replace(/^#{2,3}\s+/, "");
      elements.push(
        <Text key={idx} variant="headingSm" as="h3" fontWeight="bold">
          {renderInline(title)}
        </Text>
      );
      return;
    }

    // Élément de liste - ou *
    if (/^[-*]\s/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-*]\s+/, ""));
      return;
    }

    // Ligne vide
    if (!trimmed) {
      flushList(String(idx));
      return;
    }

    // Paragraphe normal
    flushList(String(idx));
    elements.push(
      <Text key={idx} variant="bodyMd" as="p">
        {renderInline(trimmed)}
      </Text>
    );
  });

  flushList("end");

  return <BlockStack gap="200">{elements}</BlockStack>;
}

/**
 * Transforme le **gras** en nœuds React sans innerHTML.
 */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Fragment>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <Text key={i} as="span" fontWeight="bold">
              {part.slice(2, -2)}
            </Text>
          );
        }
        return part;
      })}
    </Fragment>
  );
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const { id } = params;

  const analysis = await prisma.analysis.findUnique({
    where: { id },
    include: {
      opportunities: { orderBy: { impactPercent: "desc" } },
      recommendations: true,
      shop: true,
    },
  });

  if (!analysis) throw new Response("Not found", { status: 404 });

  const totalImpact = analysis.opportunities.reduce(
    (acc: number, o: any) => acc * (1 + o.impactPercent / 100),
    1
  );

  return json({
    analysis,
    totalRevenueImpact: Math.round((totalImpact - 1) * 100),
    appUrl: process.env.SHOPIFY_APP_URL || "",
  });
};

function ScoreCard({ label, score, details }: { label: string; score: number; details?: any }) {
  const [open, setOpen] = useState(false);
  const tone = score >= 70 ? "success" : score >= 40 ? "warning" : "critical";

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingMd" as="h3">{label}</Text>
          <Badge tone={tone}>{Math.round(score)}/100</Badge>
        </InlineStack>
        <ProgressBar progress={score} tone={tone} size="small" />
        {details && (
          <>
            <Button variant="plain" onClick={() => setOpen(!open)}>
              {open ? "Masquer les détails" : "Voir les détails"}
            </Button>
            <Collapsible open={open} id={`details-${label}`}>
              <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                <Text variant="bodySm" as="p">
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px" }}>
                    {JSON.stringify(details, null, 2)}
                  </pre>
                </Text>
              </Box>
            </Collapsible>
          </>
        )}
      </BlockStack>
    </Card>
  );
}

export default function ReportPage() {
  const { analysis, totalRevenueImpact, appUrl } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [toastActive, setToastActive] = useState(false);

  const handleShare = useCallback(async () => {
    if (!analysis.shareSlug) return;
    const url = `${appUrl}/report/${analysis.shareSlug}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore clipboard error
    }
    setToastActive(true);
  }, [analysis.shareSlug, appUrl]);

  const totalImpact = analysis.opportunities.reduce(
    (acc: number, o: any) => acc + o.impactPercent,
    0
  );

  return (
    <Frame>
    <Page
      title={`Rapport d'analyse`}
      subtitle={`${analysis.shop.shopName || analysis.shop.shopDomain} — ${new Date(analysis.createdAt).toLocaleDateString("fr-FR")}`}
      backAction={{ content: "Dashboard", url: "/app" }}
      secondaryActions={[
        {
          content: "Voir le rapport public",
          url: analysis.shareSlug ? `/report/${analysis.shareSlug}` : "#",
          external: true,
          disabled: !analysis.shareSlug,
        },
        {
          content: "Copier le lien de partage",
          onAction: handleShare,
          disabled: !analysis.shareSlug,
        },
      ]}
    >
      <BlockStack gap="500">
        {/* Score global */}
        <Card>
          <BlockStack gap="300" align="center" inlineAlign="center">
            <Text variant="heading2xl" as="h1">
              Store Score: {Math.round(analysis.overallScore)}/100
            </Text>
            <ProgressBar
              progress={analysis.overallScore}
              tone={analysis.overallScore >= 70 ? "success" : analysis.overallScore >= 40 ? "warning" : "critical"}
            />
          </BlockStack>
        </Card>

        {/* Scores détaillés */}
        <Layout>
          <Layout.Section>
            <BlockStack gap="300">
              <Text variant="headingLg" as="h2">Scores par catégorie</Text>
              <InlineGrid columns={2} gap="300">
                <ScoreCard label="SEO" score={analysis.seoScore} details={analysis.seoDetails} />
                <ScoreCard label="Vitesse" score={analysis.speedScore} details={analysis.speedDetails} />
                <ScoreCard label="Produits" score={analysis.productScore} details={analysis.productDetails} />
                <ScoreCard label="Conversion" score={analysis.conversionScore} details={analysis.conversionDetails} />
                <ScoreCard label="UX" score={analysis.uxScore} details={analysis.uxDetails} />
                <ScoreCard label="Trust" score={analysis.trustScore} details={analysis.trustDetails} />
                <ScoreCard label="Prix" score={analysis.pricingScore} details={analysis.pricingDetails} />
              </InlineGrid>
            </BlockStack>
          </Layout.Section>
        </Layout>

        <Divider />

        {/* Opportunités */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingLg" as="h2">
                Opportunités de revenus
              </Text>
              <Badge tone="attention">+{totalRevenueImpact}% de potentiel combiné</Badge>
            </InlineStack>

            {analysis.opportunities.map((opp: any) => (
              <Box
                key={opp.id}
                padding="300"
                borderWidth="025"
                borderColor="border"
                borderRadius="200"
              >
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Badge
                        tone={
                          opp.priority === "CRITICAL" ? "critical" :
                          opp.priority === "HIGH" ? "warning" : "info"
                        }
                      >
                        {opp.priority}
                      </Badge>
                      <Text variant="headingSm" as="h4">{opp.title}</Text>
                    </InlineStack>
                    <Badge tone="success">+{opp.impactPercent}%</Badge>
                  </InlineStack>
                  <Text variant="bodyMd" as="p">{opp.description}</Text>
                  <Text variant="bodySm" as="p" tone="success" fontWeight="semibold">
                    {opp.estimatedImpact}
                  </Text>
                </BlockStack>
              </Box>
            ))}
          </BlockStack>
        </Card>

        {/* Coaching IA */}
        {analysis.aiInsights && (
          <Card>
            <BlockStack gap="300">
              <Text variant="headingLg" as="h2">Coaching IA</Text>
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <AiInsightsRenderer content={analysis.aiInsights} />
              </Box>
            </BlockStack>
          </Card>
        )}

        {/* Recommandations */}
        {analysis.recommendations.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text variant="headingLg" as="h2">Recommandations actionnables</Text>
              {analysis.recommendations.map((rec: any) => (
                <Box
                  key={rec.id}
                  padding="200"
                  borderWidth="025"
                  borderColor="border"
                  borderRadius="100"
                >
                  <InlineStack align="space-between" blockAlign="start">
                    <BlockStack gap="100">
                      <InlineStack gap="100">
                        <Badge>{rec.category}</Badge>
                        <Text variant="bodyMd" as="p" fontWeight="semibold">
                          {rec.title}
                        </Text>
                      </InlineStack>
                    </BlockStack>
                    <InlineStack gap="100">
                      <Badge tone="info">{rec.difficulty}</Badge>
                      <Badge tone="success">{rec.impact}</Badge>
                    </InlineStack>
                  </InlineStack>
                </Box>
              ))}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
    {toastActive && (
      <Toast
        content="Lien de partage copié dans le presse-papier !"
        onDismiss={() => setToastActive(false)}
      />
    )}
    </Frame>
  );
}
