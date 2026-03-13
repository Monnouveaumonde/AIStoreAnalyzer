/**
 * app.competitive.alerts.tsx
 *
 * Page historique complet des alertes de prix.
 * Permet de :
 *  - Voir toutes les alertes (avec pagination)
 *  - Filtrer par type (baisse, hausse, promo)
 *  - Marquer comme lu
 *  - Voir la suggestion IA associée
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Badge,
  InlineStack,
  Box,
  Button,
  EmptyState,
  Divider,
  Select,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { hasPaidModulesAccess } from "../services/billing/plans.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const paidAccess = await hasPaidModulesAccess(session.shop);
  if (!paidAccess.allowed) {
    throw redirect("/app/billing?source=competitive");
  }
  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") || "ALL";

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ alerts: [], unreadCount: 0 });

  const where: any = { shopId: shop.id };
  if (filter !== "ALL") where.alertType = filter;

  const [alerts, unreadCount] = await Promise.all([
    prisma.priceAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        watchedProduct: {
          select: {
            shopifyProductTitle: true,
            competitorName: true,
            competitorUrl: true,
          },
        },
      },
    }),
    prisma.priceAlert.count({ where: { shopId: shop.id, isRead: false } }),
  ]);

  return json({ alerts, unreadCount });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const paidAccess = await hasPaidModulesAccess(session.shop);
  if (!paidAccess.allowed) {
    return redirect("/app/billing?source=competitive");
  }
  const formData = await request.formData();
  const intent = formData.get("intent");
  const alertId = formData.get("alertId") as string;

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ error: "Boutique introuvable" }, { status: 404 });

  if (intent === "mark_read" && alertId) {
    await prisma.priceAlert.update({
      where: { id: alertId },
      data: { isRead: true },
    });
  }

  if (intent === "mark_all_read") {
    await prisma.priceAlert.updateMany({
      where: { shopId: shop.id, isRead: false },
      data: { isRead: true },
    });
  }

  return json({ success: true });
};

const ALERT_TYPE_LABELS: Record<string, { label: string; tone: "critical" | "success" | "warning" | "info" }> = {
  PRICE_DROP: { label: "Baisse de prix", tone: "critical" },
  PRICE_INCREASE: { label: "Hausse de prix", tone: "success" },
  PROMOTION_STARTED: { label: "Promo lancée", tone: "warning" },
  PROMOTION_ENDED: { label: "Promo terminée", tone: "info" },
  NEW_COMPETITOR: { label: "Nouveau concurrent", tone: "info" },
};

export default function AlertsPage() {
  const { alerts, unreadCount } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [filter, setFilter] = useState("ALL");

  const filterOptions = [
    { label: "Toutes les alertes", value: "ALL" },
    { label: "Baisses de prix", value: "PRICE_DROP" },
    { label: "Hausses de prix", value: "PRICE_INCREASE" },
    { label: "Promotions", value: "PROMOTION_STARTED" },
  ];

  const handleFilterChange = (value: string) => {
    setFilter(value);
    submit({ filter: value }, { method: "get" });
  };

  const markRead = (alertId: string) => {
    submit({ intent: "mark_read", alertId }, { method: "post" });
  };

  return (
    <Page
      title="Alertes de prix"
      subtitle={`${unreadCount} alerte${unreadCount > 1 ? "s" : ""} non lue${unreadCount > 1 ? "s" : ""}`}
      backAction={{ content: "Competitive Watcher", url: "/app/competitive" }}
      secondaryActions={unreadCount > 0 ? [
        {
          content: "Tout marquer comme lu",
          onAction: () => submit({ intent: "mark_all_read" }, { method: "post" }),
        },
      ] : []}
    >
      <BlockStack gap="400">
        {/* Filtre */}
        <Card>
          <Box maxWidth="300px">
            <Select
              label="Filtrer par type"
              options={filterOptions}
              value={filter}
              onChange={handleFilterChange}
            />
          </Box>
        </Card>

        {alerts.length === 0 ? (
          <Card>
            <EmptyState
              heading="Aucune alerte"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>
                Aucune alerte pour le moment. Les alertes apparaissent
                automatiquement dès qu'un concurrent change son prix.
              </p>
            </EmptyState>
          </Card>
        ) : (
          <Card>
            <BlockStack gap="300">
              {alerts.map((alert: any, index: number) => {
                const alertMeta =
                  ALERT_TYPE_LABELS[alert.alertType] ?? { label: alert.alertType, tone: "info" };

                return (
                  <Box key={alert.id}>
                    <Box
                      padding="400"
                      background={!alert.isRead ? "bg-surface-warning" : undefined}
                      borderRadius="200"
                    >
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="start">
                          <InlineStack gap="200" blockAlign="center">
                            <Badge tone={alertMeta.tone}>{alertMeta.label}</Badge>
                            <Text variant="headingSm" as="h3">{alert.title}</Text>
                            {!alert.isRead && <Badge tone="attention">Nouveau</Badge>}
                          </InlineStack>
                          <InlineStack gap="100">
                            <Text variant="bodySm" as="p" tone="subdued">
                              {new Date(alert.createdAt).toLocaleString("fr-FR")}
                            </Text>
                            {!alert.isRead && (
                              <Button variant="plain" onClick={() => markRead(alert.id)}>
                                Marquer lu
                              </Button>
                            )}
                          </InlineStack>
                        </InlineStack>

                        <Text variant="bodyMd" as="p">{alert.message}</Text>

                        {/* Comparaison de prix */}
                        {alert.oldPrice && alert.newPrice && (
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="bodySm" as="p" tone="subdued">
                              Ancien : <strong>{alert.oldPrice} €</strong>
                            </Text>
                            <Text variant="bodyMd" as="span">→</Text>
                            <Text variant="bodySm" as="p">
                              Nouveau : <strong>{alert.newPrice} €</strong>
                            </Text>
                            <Badge
                              tone={alert.priceDiffPercent < 0 ? "critical" : "success"}
                            >
                              {alert.priceDiffPercent > 0 ? "+" : ""}
                              {alert.priceDiffPercent.toFixed(1)}%
                            </Badge>
                          </InlineStack>
                        )}

                        {/* Suggestion IA */}
                        {alert.suggestion && (
                          <Box
                            padding="300"
                            background="bg-surface-secondary"
                            borderRadius="200"
                          >
                            <BlockStack gap="100">
                              <Text variant="bodySm" as="p" fontWeight="semibold" tone="subdued">
                                💡 Suggestion IA
                              </Text>
                              <Text variant="bodySm" as="p">{alert.suggestion}</Text>
                            </BlockStack>
                          </Box>
                        )}

                        {/* Produit concerné */}
                        <Text variant="bodySm" as="p" tone="subdued">
                          Produit : {alert.watchedProduct?.shopifyProductTitle} —
                          Concurrent : {alert.watchedProduct?.competitorName}
                        </Text>
                      </BlockStack>
                    </Box>
                    {index < alerts.length - 1 && <Divider />}
                  </Box>
                );
              })}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
