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
import { useLoaderData, useNavigate, useSubmit, useNavigation } from "@remix-run/react";
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

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const { id } = params;

  const watchedProduct = await prisma.watchedProduct.findUnique({
    where: { id },
    include: {
      priceHistory: { orderBy: { capturedAt: "desc" }, take: 30 },
      alerts: { orderBy: { createdAt: "desc" }, take: 20 },
      shop: { select: { shopDomain: true } },
    },
  });

  if (!watchedProduct) throw new Response("Produit introuvable", { status: 404 });

  return json({ watchedProduct });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;
  const formData = await request.formData();
  const intent = formData.get("intent");

  const watchedProduct = await prisma.watchedProduct.findUnique({ where: { id } });
  if (!watchedProduct) return json({ error: "Produit introuvable" }, { status: 404 });

  if (intent === "check_now") {
    const scraped = await scrapeProductPrice(watchedProduct.competitorUrl);
    if (scraped.price) {
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
        const shop = await prisma.shop.findFirst({ where: { shopDomain: session.shop } });
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
        } catch { /* non-bloquant */ }

        if (shop) {
          await prisma.priceAlert.create({
            data: {
              shopId: shop.id,
              watchedProductId: id!,
              alertType,
              oldPrice,
              newPrice: scraped.price,
              priceDiffPercent,
              title: alertType === "PRICE_DROP"
                ? `Baisse chez ${watchedProduct.competitorName} (${priceDiffPercent.toFixed(1)}%)`
                : `Hausse chez ${watchedProduct.competitorName} (+${priceDiffPercent.toFixed(1)}%)`,
              message: `Le prix est passé de ${oldPrice} → ${scraped.price} €`,
              suggestion,
            },
          });
        }
      }

      return json({ success: true, newPrice: scraped.price });
    }
    return json({ error: scraped.error ?? "Prix non récupéré" }, { status: 400 });
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
  const { watchedProduct } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const navigate = useNavigate();
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
        onAction: () => submit({ intent: "check_now" }, { method: "post" }),
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
          onAction: () => submit({ intent: "delete" }, { method: "post" }),
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
