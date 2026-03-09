import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useLoaderData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineGrid,
  Badge,
  List,
  InlineStack,
  Box,
  Divider,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { PLANS, createSubscription } from "../services/billing/plans.server";
import type { PlanType } from "../services/billing/plans.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    include: { subscription: true },
  });

  return json({
    currentPlan: shop?.plan || "FREE",
    shopDomain: session.shop,
    plans: PLANS,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan") as PlanType;

  if (!plan || !PLANS[plan]) {
    return json({ error: "Plan invalide" }, { status: 400 });
  }

  if (plan === "FREE") {
    await prisma.shop.update({
      where: { shopDomain: session.shop },
      data: { plan: "FREE" },
    });
    return json({ success: true, message: "Plan mis à jour vers Free" });
  }

  const confirmationUrl = await createSubscription(admin, plan, session.shop);

  if (confirmationUrl) {
    return redirect(confirmationUrl);
  }

  return json({ error: "Erreur lors de la création de l'abonnement" }, { status: 500 });
};

function PlanCard({
  name,
  price,
  features,
  isCurrent,
  planKey,
  onSelect,
}: {
  name: string;
  price: number;
  features: readonly string[];
  isCurrent: boolean;
  planKey: string;
  onSelect: (plan: string) => void;
}) {
  const isPro = planKey === "PRO";

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingLg" as="h2">{name}</Text>
          {isCurrent && <Badge tone="success">Plan actuel</Badge>}
          {isPro && !isCurrent && <Badge tone="attention">Populaire</Badge>}
        </InlineStack>

        <BlockStack gap="100">
          <InlineStack gap="100" blockAlign="end">
            <Text variant="heading2xl" as="p" fontWeight="bold">
              {price === 0 ? "Gratuit" : `$${price}`}
            </Text>
            {price > 0 && (
              <Text variant="bodyMd" as="p" tone="subdued">/mois</Text>
            )}
          </InlineStack>
        </BlockStack>

        <Divider />

        <List>
          {features.map((feature, i) => (
            <List.Item key={i}>{feature}</List.Item>
          ))}
        </List>

        <Button
          variant={isPro ? "primary" : "secondary"}
          disabled={isCurrent}
          onClick={() => onSelect(planKey)}
          fullWidth
        >
          {isCurrent ? "Plan actuel" : `Choisir ${name}`}
        </Button>
      </BlockStack>
    </Card>
  );
}

export default function BillingPage() {
  const { currentPlan, plans } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  const handleSelect = (plan: string) => {
    const formData = new FormData();
    formData.set("plan", plan);
    submit(formData, { method: "post" });
  };

  return (
    <Page
      title="Abonnement"
      subtitle="Choisissez le plan adapté à votre croissance"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <BlockStack gap="500">
        {actionData && "error" in actionData && (
          <Banner tone="critical"><Text as="p">{actionData.error}</Text></Banner>
        )}
        {actionData && "success" in actionData && (
          <Banner tone="success"><Text as="p">{actionData.message}</Text></Banner>
        )}

        <InlineGrid columns={3} gap="400">
          {(Object.entries(plans) as [string, typeof plans[keyof typeof plans]][]).map(
            ([key, plan]) => (
              <PlanCard
                key={key}
                name={plan.name}
                price={plan.price}
                features={plan.features}
                isCurrent={currentPlan === key}
                planKey={key}
                onSelect={handleSelect}
              />
            )
          )}
        </InlineGrid>

        <Card>
          <BlockStack gap="200">
            <Text variant="headingSm" as="h3">Garanties</Text>
            <List>
              <List.Item>Annulation à tout moment sans engagement</List.Item>
              <List.Item>Facturation via Shopify — sécurisée et transparente</List.Item>
              <List.Item>14 jours d'essai gratuit pour les plans payants</List.Item>
              <List.Item>Support par email sous 24h</List.Item>
            </List>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
