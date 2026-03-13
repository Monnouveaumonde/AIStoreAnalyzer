/**
 * app.competitive.$id.tsx
 *
 * Page de détail d'un produit concurrent surveillé.
 * Affiche :
 *  - L'historique complet des prix sous forme de tableau
 *  - Les alertes associées à ce produit
 *  - Le bouton pour lancer un check manuel sur ce seul produit
 *  - Le bouton de suppression (désactivation)
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
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
  IndexTable,
  Banner,
  Divider,
  Modal,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { scrapeProductPrice } from "../services/competitive/price-scraper.server";
import { generatePriceSuggestion } from "../services/competitive/price-ai.server";
import { analyzeCompetitivePage } from "../services/competitive/competitive-analysis.server";
import { hasFeatureAccess } from "../services/billing/plans.server";

async function fetchOwnProductSignals(admin: any, shopifyProductId: string) {
  if (!admin || !shopifyProductId.startsWith("gid://shopify/Product/")) {
    return null;
  }
  try {
    const response = await admin.graphql(
      `#graphql
      query ProductComparison($id: ID!) {
        product(id: $id) {
          id
          title
          descriptionHtml
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 12) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    `,
      { variables: { id: shopifyProductId } }
    );
    const payload = await response.json();
    const product = payload?.data?.product;
    if (!product) return null;
    return {
      title: product.title ?? null,
      contentLength: (product.descriptionHtml ?? "").replace(/<[^>]+>/g, " ").length,
      imageCount: product.images?.edges?.length ?? 0,
      price: product.priceRangeV2?.minVariantPrice?.amount
        ? Number(product.priceRangeV2.minVariantPrice.amount)
        : null,
      currency: product.priceRangeV2?.minVariantPrice?.currencyCode ?? "EUR",
    };
  } catch {
    return null;
  }
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  let shopDomain = (url.searchParams.get("shop") ?? "").trim();
  let admin: any = null;
  try {
    const auth = await authenticate.admin(request);
    const { session } = auth;
    if (session?.shop) shopDomain = session.shop;
    admin = auth.admin;
  } catch (error) {
    if (!shopDomain) throw error;
  }

  if (!shopDomain) {
    throw redirect("/auth/login");
  }

  const paidAccess = await hasFeatureAccess(shopDomain, "competitive_compare_advanced");
  if (!paidAccess.allowed) {
    throw redirect("/app/billing?source=competitive");
  }
  const { id } = params;

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true, shopDomain: true },
  });
  if (!shop) throw new Response("Boutique introuvable", { status: 404 });

  const watchedProduct = await prisma.watchedProduct.findFirst({
    where: { id, shopId: shop.id, isActive: true },
    include: {
      priceHistory: { orderBy: { capturedAt: "desc" }, take: 30 },
      alerts: { orderBy: { createdAt: "desc" }, take: 20 },
      shop: { select: { shopDomain: true } },
    },
  });

  if (!watchedProduct) throw new Response("Produit introuvable", { status: 404 });

  const ownSignals = await fetchOwnProductSignals(admin, watchedProduct.shopifyProductId);
  const comparison = await analyzeCompetitivePage({
    competitorUrl: watchedProduct.competitorUrl,
    own: {
      title: ownSignals?.title ?? watchedProduct.shopifyProductTitle,
      price: ownSignals?.price ?? watchedProduct.myCurrentPrice,
      currency: ownSignals?.currency ?? "EUR",
      imageCount: ownSignals?.imageCount ?? null,
      contentLength: ownSignals?.contentLength ?? null,
    },
  });

  return json({
    watchedProduct,
    ownSignals,
    comparison,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const url = new URL(request.url);

  let shopDomain =
    ((formData.get("shopDomain") as string | null) ?? "").trim() ||
    (url.searchParams.get("shop") ?? "").trim();
  try {
    const { session } = await authenticate.admin(request);
    if (session?.shop) shopDomain = session.shop;
  } catch {
    // fallback shopDomain conservé
  }

  if (!shopDomain) {
    return json({ success: false, error: "Contexte boutique manquant." }, { status: 401 });
  }

  const paidAccess = await hasFeatureAccess(shopDomain, "competitive_compare_advanced");
  if (!paidAccess.allowed) {
    return redirect("/app/billing?source=competitive");
  }
  const { id } = params;
  const intent = formData.get("intent");

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });
  if (!shop) return json({ success: false, error: "Boutique introuvable" }, { status: 404 });

  const watchedProduct = await prisma.watchedProduct.findFirst({
    where: { id, shopId: shop.id, isActive: true },
  });
  if (!watchedProduct) return json({ error: "Produit introuvable" }, { status: 404 });

  if (intent === "check_now") {
    const scraped = await scrapeProductPrice(watchedProduct.competitorUrl);
    if (!scraped.price) {
      await prisma.watchedProduct.update({
        where: { id },
        data: { lastCheckedAt: new Date() },
      });
      return json({
        success: true,
        checked: false,
        warning: scraped.error ?? "Prix non récupéré sur la page concurrente.",
      });
    }

    const oldPrice = watchedProduct.lastPrice;
    await prisma.priceSnapshot.create({
      data: {
        watchedProductId: id!,
        price: scraped.price,
        currency: scraped.currency,
        hasPromotion: scraped.hasPromotion,
        promotionLabel: scraped.promotionLabel,
        originalPrice: scraped.originalPrice,
      },
    });
    await prisma.watchedProduct.update({
      where: { id },
      data: { lastPrice: scraped.price, lastCheckedAt: new Date() },
    });

    // Génération alerte si prix changé
    if (oldPrice && Math.abs((scraped.price - oldPrice) / oldPrice) > 0.01) {
      const priceDiffPercent = ((scraped.price - oldPrice) / oldPrice) * 100;
      const alertType = priceDiffPercent < 0 ? "PRICE_DROP" : "PRICE_INCREASE";

      let suggestion: string | null = null;
      try {
        suggestion = await generatePriceSuggestion({
          productTitle: watchedProduct.shopifyProductTitle,
          myPrice: watchedProduct.myCurrentPrice,
          competitorPrice: scraped.price,
          competitorName: watchedProduct.competitorName,
          alertType,
          priceDiffPercent,
        });
      } catch {
        // non bloquant
      }

      await prisma.priceAlert.create({
        data: {
          shopId: shop.id,
          watchedProductId: id!,
          alertType,
          oldPrice,
          newPrice: scraped.price,
          priceDiffPercent,
          title:
            alertType === "PRICE_DROP"
              ? `Baisse chez ${watchedProduct.competitorName} (${priceDiffPercent.toFixed(1)}%)`
              : `Hausse chez ${watchedProduct.competitorName} (+${priceDiffPercent.toFixed(1)}%)`,
          message: `Le prix est passé de ${oldPrice} → ${scraped.price} €`,
          suggestion,
        },
      });
    }

    return json({ success: true, checked: true, newPrice: scraped.price });
  }

  if (intent === "delete") {
    await prisma.watchedProduct.update({
      where: { id },
      data: { isActive: false },
    });
    return redirect("/app/competitive");
  }

  return json({ error: "Action inconnue" }, { status: 400 });
};

export default function WatchedProductDetail() {
  const { watchedProduct, ownSignals, comparison } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const isChecking = navigation.state === "submitting";

  const priceHistory = watchedProduct.priceHistory;
  const minPrice = priceHistory.length > 0 ? Math.min(...priceHistory.map((h: any) => h.price)) : null;
  const maxPrice = priceHistory.length > 0 ? Math.max(...priceHistory.map((h: any) => h.price)) : null;
  const avgPrice = priceHistory.length > 0
    ? priceHistory.reduce((s: number, h: any) => s + h.price, 0) / priceHistory.length
    : null;

  return (
    <Page
      title={watchedProduct.shopifyProductTitle}
      subtitle={`Surveillance : ${watchedProduct.competitorName}`}
      backAction={{ content: "Competitive Watcher", url: "/app/competitive" }}
      primaryAction={{
        content: isChecking ? "Vérification..." : "Vérifier maintenant",
        loading: isChecking,
        onAction: () =>
          submit(
            { intent: "check_now", shopDomain: watchedProduct.shop.shopDomain },
            { method: "post" },
          ),
      }}
      secondaryActions={[
        {
          content: "Supprimer la surveillance",
          destructive: true,
          onAction: () => setDeleteModalOpen(true),
        },
      ]}
    >
      <BlockStack gap="500">
        {actionData && "checked" in actionData && actionData.checked && (
          <Banner tone="success">
            <Text as="p">Vérification effectuée. Le prix concurrent a été mis à jour.</Text>
          </Banner>
        )}
        {actionData && "warning" in actionData && actionData.warning && (
          <Banner tone="warning">
            <Text as="p">{String((actionData as any).warning)}</Text>
          </Banner>
        )}
        {actionData && "error" in actionData && actionData.error && (
          <Banner tone="critical">
            <Text as="p">{String((actionData as any).error)}</Text>
          </Banner>
        )}

        {/* Résumé statistiques */}
        <Layout>
          <Layout.Section>
            <InlineStack gap="400">
              {[
                { label: "Prix actuel concurrent", value: watchedProduct.lastPrice ? `${watchedProduct.lastPrice} €` : "—" },
                { label: "Mon prix", value: watchedProduct.myCurrentPrice ? `${watchedProduct.myCurrentPrice} €` : "—" },
                { label: "Prix min (30j)", value: minPrice ? `${minPrice.toFixed(2)} €` : "—" },
                { label: "Prix max (30j)", value: maxPrice ? `${maxPrice.toFixed(2)} €` : "—" },
                { label: "Prix moy (30j)", value: avgPrice ? `${avgPrice.toFixed(2)} €` : "—" },
              ].map((stat) => (
                <Box key={stat.label} padding="300" borderWidth="025" borderColor="border" borderRadius="200">
                  <BlockStack gap="100" inlineAlign="center">
                    <Text variant="headingMd" as="p" fontWeight="bold">{stat.value}</Text>
                    <Text variant="bodySm" as="p" tone="subdued">{stat.label}</Text>
                  </BlockStack>
                </Box>
              ))}
            </InlineStack>
          </Layout.Section>
        </Layout>

        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd" as="h2">Comparatif concurrentiel avancé</Text>
            <InlineGrid columns={2} gap="200">
              <Box padding="300" borderWidth="025" borderColor="border" borderRadius="200">
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">Mon produit</Text>
                  <Text as="p" variant="bodySm">
                    Titre: {ownSignals?.title ?? watchedProduct.shopifyProductTitle}
                  </Text>
                  <Text as="p" variant="bodySm">
                    Prix: {ownSignals?.price ? `${Number(ownSignals.price).toFixed(2)} ${ownSignals?.currency ?? "EUR"}` : "Non renseigné"}
                  </Text>
                  <Text as="p" variant="bodySm">
                    Images: {ownSignals?.imageCount ?? "N/A"}
                  </Text>
                  <Text as="p" variant="bodySm">
                    Longueur contenu: {ownSignals?.contentLength ?? "N/A"}
                  </Text>
                </BlockStack>
              </Box>
              <Box padding="300" borderWidth="025" borderColor="border" borderRadius="200">
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">Produit concurrent</Text>
                  <Text as="p" variant="bodySm">
                    Titre: {comparison.title ?? watchedProduct.competitorName}
                  </Text>
                  <Text as="p" variant="bodySm">
                    Prix: {comparison.price ? `${comparison.price.toFixed(2)} ${comparison.currency}` : "Non détecté"}
                  </Text>
                  <Text as="p" variant="bodySm">
                    Images: {comparison.imageCount}
                  </Text>
                  <Text as="p" variant="bodySm">
                    CTA détectés: {comparison.ctaCount}
                  </Text>
                  <Text as="p" variant="bodySm">
                    Vidéo: {comparison.hasVideo ? "Oui" : "Non"}
                  </Text>
                </BlockStack>
              </Box>
            </InlineGrid>

            {comparison.diagnostic && (
              <Banner tone="warning">
                <Text as="p">{comparison.diagnostic}</Text>
              </Banner>
            )}

            <InlineGrid columns={3} gap="200">
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">Points forts concurrent</Text>
                  {comparison.strengths.length === 0 ? (
                    <Text as="p" variant="bodySm" tone="subdued">Aucun signal fort détecté.</Text>
                  ) : (
                    comparison.strengths.map((s, idx) => (
                      <Text key={`s-${idx}`} as="p" variant="bodySm">- {s}</Text>
                    ))
                  )}
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">Points faibles / risques</Text>
                  {comparison.weaknesses.length === 0 ? (
                    <Text as="p" variant="bodySm" tone="subdued">Aucun risque majeur détecté.</Text>
                  ) : (
                    comparison.weaknesses.map((w, idx) => (
                      <Text key={`w-${idx}`} as="p" variant="bodySm">- {w}</Text>
                    ))
                  )}
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">Opportunités & conseils</Text>
                  {[...comparison.opportunities, ...comparison.recommendations].length === 0 ? (
                    <Text as="p" variant="bodySm" tone="subdued">Pas de recommandation supplémentaire.</Text>
                  ) : (
                    [...comparison.opportunities, ...comparison.recommendations].map((r, idx) => (
                      <Text key={`r-${idx}`} as="p" variant="bodySm">- {r}</Text>
                    ))
                  )}
                </BlockStack>
              </Card>
            </InlineGrid>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="150">
            <Text variant="headingSm" as="h3">Détails de vérification</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              URL concurrente: {watchedProduct.competitorUrl}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Statut: {watchedProduct.lastPrice ? "Prix détecté" : "Prix non détecté pour l'instant"}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Dernier check: {watchedProduct.lastCheckedAt
                ? new Date(watchedProduct.lastCheckedAt).toLocaleString("fr-FR")
                : "Jamais"}
            </Text>
          </BlockStack>
        </Card>

        <Divider />

        {/* Historique des prix */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Historique des prix (30 dernières vérifications)</Text>
            {priceHistory.length === 0 ? (
              <Text as="p" tone="subdued">Aucun historique disponible.</Text>
            ) : (
              <IndexTable
                itemCount={priceHistory.length}
                headings={[
                  { title: "Date" },
                  { title: "Prix concurrent" },
                  { title: "Promotion" },
                  { title: "Variation" },
                ]}
                selectable={false}
              >
                {priceHistory.map((snapshot: any, index: number) => {
                  const prev = priceHistory[index + 1];
                  const change = prev
                    ? ((snapshot.price - prev.price) / prev.price) * 100
                    : null;

                  return (
                    <IndexTable.Row id={snapshot.id} key={snapshot.id} position={index}>
                      <IndexTable.Cell>
                        <Text variant="bodySm" as="p">
                          {new Date(snapshot.capturedAt).toLocaleString("fr-FR", {
                            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text variant="bodyMd" as="p" fontWeight="semibold">
                          {snapshot.price.toFixed(2)} {snapshot.currency}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {snapshot.hasPromotion ? (
                          <Badge tone="warning">{snapshot.promotionLabel ?? "Promo"}</Badge>
                        ) : (
                          <Text as="p" tone="subdued">—</Text>
                        )}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {change !== null ? (
                          <Badge tone={change < -1 ? "critical" : change > 1 ? "success" : "info"}>
                            {change > 0 ? "+" : ""}{change.toFixed(1)}%
                          </Badge>
                        ) : (
                          <Text as="p" tone="subdued">—</Text>
                        )}
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            )}
          </BlockStack>
        </Card>

        {/* Alertes liées à ce produit */}
        {watchedProduct.alerts.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Alertes récentes</Text>
              {watchedProduct.alerts.map((alert: any) => (
                <Box key={alert.id} padding="300" borderWidth="025" borderColor="border" borderRadius="100">
                  <BlockStack gap="150">
                    <InlineStack align="space-between">
                      <Text variant="headingSm" as="h4">{alert.title}</Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        {new Date(alert.createdAt).toLocaleDateString("fr-FR")}
                      </Text>
                    </InlineStack>
                    <Text variant="bodySm" as="p">{alert.message}</Text>
                    {alert.suggestion && (
                      <Text variant="bodySm" as="p" tone="subdued">💡 {alert.suggestion}</Text>
                    )}
                  </BlockStack>
                </Box>
              ))}
            </BlockStack>
          </Card>
        )}
      </BlockStack>

      {/* Modal de confirmation suppression */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Supprimer la surveillance"
        primaryAction={{
          content: "Supprimer",
          destructive: true,
          onAction: () =>
            submit(
              { intent: "delete", shopDomain: watchedProduct.shop.shopDomain },
              { method: "post" },
            ),
        }}
        secondaryActions={[{ content: "Annuler", onAction: () => setDeleteModalOpen(false) }]}
      >
        <Modal.Section>
          <Text as="p">
            Êtes-vous sûr de vouloir arrêter la surveillance de "
            {watchedProduct.shopifyProductTitle}" chez {watchedProduct.competitorName} ?
            L'historique des prix sera conservé.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
