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
import { json } from "@remix-run/node";
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
  Banner,
  InlineGrid,
  Divider,
  Spinner,
  EmptyState,
  Tooltip,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  getWatcherDashboard,
  runPriceChecks,
  WATCHER_PLAN_LIMITS,
} from "../services/competitive/watcher.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const data = await getWatcherDashboard(session.shop);
  if (!data) return json({ watchedProducts: [], unreadAlerts: 0, recentAlerts: [], plan: "FREE", limit: 3, current: 0 });

  const plan = data.plan as keyof typeof WATCHER_PLAN_LIMITS;
  const limit = WATCHER_PLAN_LIMITS[plan] ?? 3;

  return json({
    watchedProducts: data.watchedProducts,
    unreadAlerts: data.unreadAlerts,
    recentAlerts: data.recentAlerts,
    plan: data.plan,
    limit,
    current: data.watchedProducts.length,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "run_checks") {
    const count = await runPriceChecks(session.shop);
    return json({ success: true, alertsGenerated: count });
  }

  if (intent === "mark_all_read") {
    const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
    if (shop) {
      await prisma.priceAlert.updateMany({
        where: { shopId: shop.id, isRead: false },
        data: { isRead: true },
      });
    }
    return json({ success: true });
  }

  return json({ error: "Action inconnue" }, { status: 400 });
};

// ── Composant : carte d'un produit surveillé ──────────────────────────────────
function WatchedProductCard({ product }: { product: any }) {
  const navigate = useNavigate();
  const lastHistory = product.priceHistory[0];
  const prevHistory = product.priceHistory[1];

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

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start">
          <BlockStack gap="100">
            <Text variant="headingSm" as="h3">{product.shopifyProductTitle}</Text>
            <Text variant="bodySm" as="p" tone="subdued">
              vs. {product.competitorName}
            </Text>
          </BlockStack>
          {priceChange !== null && (
            <Badge tone={tone}>
              {priceChange > 0 ? "+" : ""}{priceChange.toFixed(1)}%
            </Badge>
          )}
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
                {product.lastPrice ? `${product.lastPrice} €` : "Non vérifié"}
              </Text>
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

        <InlineStack gap="200" align="end">
          <Text variant="bodySm" as="p" tone="subdued">
            Vérifié : {product.lastCheckedAt
              ? new Date(product.lastCheckedAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
              : "Jamais"}
          </Text>
          <Button
            variant="plain"
            onClick={() => navigate(`/app/competitive/${product.id}`)}
          >
            Détails
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
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
  const { watchedProducts, unreadAlerts, recentAlerts, plan, limit, current } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isRunningChecks = navigation.state === "submitting";
  const limitReached = limit !== -1 && current >= limit;

  return (
    <Page
      title="Competitive Watcher"
      subtitle="Surveillez les prix de vos concurrents en temps réel"
      primaryAction={{
        content: "Ajouter un produit",
        disabled: limitReached,
        onAction: () => navigate("/app/competitive/add"),
      }}
      secondaryActions={[
        {
          content: "Voir toutes les alertes",
          url: "/app/competitive/alerts",
        },
      ]}
    >
      <BlockStack gap="500">

        {/* Bandeau plan + quota ──────────────────────────────────────────── */}
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

        {/* Résumé alertes non lues ─────────────────────────────────────── */}
        {unreadAlerts > 0 && (
          <Banner tone="critical">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="p">
                <strong>{unreadAlerts} nouvelle{unreadAlerts > 1 ? "s" : ""} alerte{unreadAlerts > 1 ? "s" : ""}</strong>{" "}
                — un concurrent a changé son prix !
              </Text>
              <InlineStack gap="200">
                <Button
                  variant="plain"
                  onClick={() => submit({ intent: "mark_all_read" }, { method: "post" })}
                >
                  Tout marquer comme lu
                </Button>
                <Button onClick={() => navigate("/app/competitive/alerts")}>
                  Voir les alertes
                </Button>
              </InlineStack>
            </InlineStack>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            {/* Liste produits surveillés ─────────────────────────────── */}
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingLg" as="h2">
                  Produits surveillés ({current})
                </Text>
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

              {watchedProducts.length === 0 ? (
                <Card>
                  <EmptyState
                    heading="Aucun produit surveillé"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    action={{
                      content: "Ajouter un produit concurrent",
                      onAction: () => navigate("/app/competitive/add"),
                    }}
                  >
                    <p>
                      Ajoutez les URLs de vos concurrents pour surveiller
                      automatiquement leurs prix et recevoir des alertes.
                    </p>
                  </EmptyState>
                </Card>
              ) : (
                <InlineGrid columns={2} gap="400">
                  {watchedProducts.map((wp: any) => (
                    <WatchedProductCard key={wp.id} product={wp} />
                  ))}
                </InlineGrid>
              )}
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
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
                        onClick={() => navigate("/app/competitive/alerts")}
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
                  { step: "1", text: "Ajoutez l'URL du produit chez votre concurrent" },
                  { step: "2", text: "Vérification automatique 1x/jour" },
                  { step: "3", text: "Alerte email + dashboard si le prix change" },
                  { step: "4", text: "Suggestion IA de réaction immédiate" },
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
