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

function DetailRow({ label, value, tone }: { label: string; value: string | number | boolean | null; tone?: "success" | "critical" | "subdued" }) {
  const displayValue = typeof value === "boolean" ? (value ? "✓ Oui" : "✗ Non") : String(value ?? "—");
  const displayTone = typeof value === "boolean" ? (value ? "success" : "critical") : tone;
  return (
    <InlineStack align="space-between" blockAlign="center">
      <Text variant="bodySm" as="p">{label}</Text>
      <Text variant="bodySm" as="p" tone={displayTone} fontWeight="semibold">{displayValue}</Text>
    </InlineStack>
  );
}

function formatDetailsForCategory(label: string, details: any): React.ReactNode {
  if (!details || typeof details !== "object") return null;

  const rows: { label: string; value: any }[] = [];

  if (label === "SEO") {
    const mt = details.metaTitles;
    const md = details.metaDescriptions;
    const alt = details.altTexts;
    if (mt) {
      rows.push({ label: "Produits analysés", value: mt.total });
      rows.push({ label: "Meta titles manquants", value: mt.missing });
      rows.push({ label: "Meta titles trop longs", value: mt.tooLong });
      rows.push({ label: "Meta titles dupliqués", value: mt.duplicates });
    }
    if (md) {
      rows.push({ label: "Meta descriptions manquantes", value: md.missing });
      rows.push({ label: "Meta descriptions trop courtes", value: md.tooShort });
      rows.push({ label: "Meta descriptions trop longues", value: md.tooLong });
    }
    if (alt) {
      rows.push({ label: "Images totales", value: alt.total });
      rows.push({ label: "Images sans alt text", value: alt.missing });
    }
    rows.push({ label: "Sitemap présent", value: details.sitemapPresent });
    rows.push({ label: "Robots.txt présent", value: details.robotsTxt });
  } else if (label === "Vitesse") {
    rows.push({ label: "Score performance", value: `${details.performanceScore ?? "—"}/100` });
    rows.push({ label: "First Contentful Paint", value: details.firstContentfulPaint ? `${(details.firstContentfulPaint / 1000).toFixed(1)}s` : "—" });
    rows.push({ label: "Largest Contentful Paint", value: details.largestContentfulPaint ? `${(details.largestContentfulPaint / 1000).toFixed(1)}s` : "—" });
    rows.push({ label: "Time to Interactive", value: details.timeToInteractive ? `${(details.timeToInteractive / 1000).toFixed(1)}s` : "—" });
    rows.push({ label: "Speed Index", value: details.speedIndex ? `${(details.speedIndex / 1000).toFixed(1)}s` : "—" });
    rows.push({ label: "Total Blocking Time", value: details.totalBlockingTime ? `${details.totalBlockingTime}ms` : "—" });
    rows.push({ label: "Cumulative Layout Shift", value: details.cumulativeLayoutShift ?? "—" });
  } else if (label === "Produits") {
    rows.push({ label: "Produits totaux", value: details.totalProducts });
    rows.push({ label: "Avec descriptions", value: `${details.withDescriptions ?? 0}/${details.totalProducts}` });
    rows.push({ label: "Avec images", value: `${details.withImages ?? 0}/${details.totalProducts}` });
    rows.push({ label: "Avec prix", value: `${details.withPricing ?? 0}/${details.totalProducts}` });
    rows.push({ label: "Avec variantes", value: `${details.withVariants ?? 0}/${details.totalProducts}` });
    rows.push({ label: "Avec prix barré", value: `${details.withCompareAtPrice ?? 0}/${details.totalProducts}` });
    rows.push({ label: "Images moy. par produit", value: details.avgImagesPerProduct });
    rows.push({ label: "Longueur moy. description", value: `${details.avgDescriptionLength ?? 0} caractères` });
  } else if (label === "UX") {
    rows.push({ label: "Thème", value: details.themeInfo?.name ?? "—" });
    rows.push({ label: "Nombre de pages", value: details.pageCount });
    rows.push({ label: "Liens de navigation", value: details.menuItemCount });
    rows.push({ label: "Profondeur de navigation", value: details.navigationDepth });
    rows.push({ label: "Page À propos", value: details.hasAboutPage });
    rows.push({ label: "Page Contact", value: details.hasContactPage });
    rows.push({ label: "Page FAQ", value: details.hasFaqPage });
    rows.push({ label: "Recherche activée", value: details.hasSearchEnabled });
    rows.push({ label: "Optimisation mobile", value: details.hasMobileOptimization });
    rows.push({ label: "Footer présent", value: details.hasFooter });
  } else if (label === "Trust") {
    rows.push({ label: "Avis clients", value: details.hasReviews });
    rows.push({ label: "App d'avis détectée", value: details.reviewAppDetected ?? false });
    rows.push({ label: "Badges de confiance", value: details.hasTrustBadges });
    rows.push({ label: "Preuve sociale", value: details.hasSocialProof });
    rows.push({ label: "Paiement sécurisé", value: details.hasSecureCheckout });
    rows.push({ label: "Infos de contact", value: details.hasContactInfo });
    rows.push({ label: "Politique de retour", value: details.hasRefundPolicy });
    rows.push({ label: "Politique de livraison", value: details.hasShippingPolicy });
    rows.push({ label: "Politique de confidentialité", value: details.hasPrivacyPolicy });
    rows.push({ label: "Conditions générales", value: details.hasTermsOfService });
  } else if (label === "Prix") {
    rows.push({ label: "Prix moyen", value: `${details.avgPrice ?? 0} €` });
    rows.push({ label: "Prix minimum", value: `${details.minPrice ?? 0} €` });
    rows.push({ label: "Prix maximum", value: `${details.maxPrice ?? 0} €` });
    rows.push({ label: "Écart de prix", value: `${details.priceRange ?? 0} €` });
    rows.push({ label: "Réduction moyenne", value: `${details.avgDiscount ?? 0}%` });
    rows.push({ label: "Produits avec prix barré", value: `${details.productsWithCompareAt ?? 0}/${details.totalProducts ?? 0}` });
    rows.push({ label: "Seuil livraison gratuite", value: details.hasFreeShippingThreshold });
    if (details.priceDistribution?.length) {
      rows.push({ label: "—— Répartition des prix ——", value: "" });
      for (const d of details.priceDistribution) {
        rows.push({ label: `  ${d.range}`, value: `${d.count} produit${d.count > 1 ? "s" : ""}` });
      }
    }
  } else if (label === "Conversion") {
    const convLabels: Record<string, string> = {
      hasCart: "Panier",
      hasCheckoutCustomization: "Checkout personnalisé",
      hasDiscountCodes: "Codes promo",
      activeDiscounts: "Promos actives",
      hasCollections: "Collections",
      collectionCount: "Nombre de collections",
      hasFeaturedProducts: "Produits mis en avant",
      productOrganization: "Score organisation",
    };
    for (const [key, value] of Object.entries(details)) {
      rows.push({ label: convLabels[key] || key, value: value as any });
    }
  }

  if (rows.length === 0) return null;

  return (
    <BlockStack gap="100">
      {rows.map((r, i) => (
        <DetailRow key={i} label={r.label} value={r.value} />
      ))}
    </BlockStack>
  );
}

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
                {formatDetailsForCategory(label, details)}
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
