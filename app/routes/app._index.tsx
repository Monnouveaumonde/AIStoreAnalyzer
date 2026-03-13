import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit, useNavigation, useActionData } from "@remix-run/react";
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
import { hasFeatureAccess } from "../services/billing/plans.server";

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
      watchedProducts: {
        where: { isActive: true },
        select: { id: true, shopifyProductTitle: true, competitorName: true },
      },
      seoScans: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, createdAt: true },
      },
    },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { shopDomain, shopName: shopDomain },
      include: {
        analyses: { orderBy: { createdAt: "desc" }, take: 5, include: { opportunities: true } },
        subscription: true,
        watchedProducts: { where: { isActive: true }, select: { id: true, shopifyProductTitle: true, competitorName: true } },
        seoScans: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, createdAt: true } },
      },
    });
  }

  const latestAnalysis = shop.analyses[0] || null;
  const planLimits = { FREE: 3, PRO: 20, GROWTH: -1 };
  const limit = planLimits[shop.plan as keyof typeof planLimits] || 3;
  const remaining = limit === -1 ? "illimité" : `${limit - shop.analysisCount}/${limit}`;
  const automationAccess = await hasFeatureAccess(shopDomain, "competitive_automation_plus");

  return json({
    shop: {
      domain: shop.shopDomain,
      name: shop.shopName,
      plan: shop.plan,
      analysisCount: shop.analysisCount,
      remaining,
      autoCompetitiveEnabled: shop.autoCompetitiveEnabled,
      autoCompetitiveFrequency: shop.autoCompetitiveFrequency,
      autoSeoEnabled: shop.autoSeoEnabled,
      autoSeoFrequency: shop.autoSeoFrequency,
      autoAnalysisEnabled: shop.autoAnalysisEnabled,
      autoAnalysisFrequency: shop.autoAnalysisFrequency,
      autoAlertsEnabled: shop.autoAlertsEnabled,
      autoAlertThresholdPct: shop.autoAlertThresholdPct,
      autoThemeWatchEnabled: shop.autoThemeWatchEnabled,
      autoThemeWatchFrequency: shop.autoThemeWatchFrequency,
      autoProductDropEnabled: shop.autoProductDropEnabled,
      autoProductDropFrequency: shop.autoProductDropFrequency,
      autoSeoFixEnabled: shop.autoSeoFixEnabled,
      autoSeoFixFrequency: shop.autoSeoFixFrequency,
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
    watchedProducts: shop.watchedProducts,
    latestSeoScan: shop.seoScans[0] ?? null,
    automationAccess,
    shopDomain,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_automation") {
    await prisma.shop.update({
      where: { shopDomain },
      data: {
        autoCompetitiveEnabled: formData.get("autoCompetitiveEnabled") === "on",
        autoCompetitiveFrequency: (formData.get("autoCompetitiveFrequency") as string) || "daily",
        autoSeoEnabled: formData.get("autoSeoEnabled") === "on",
        autoSeoFrequency: (formData.get("autoSeoFrequency") as string) || "monthly",
        autoAnalysisEnabled: formData.get("autoAnalysisEnabled") === "on",
        autoAnalysisFrequency: (formData.get("autoAnalysisFrequency") as string) || "monthly",
        autoAlertsEnabled: formData.get("autoAlertsEnabled") === "on",
        autoAlertThresholdPct: Number(formData.get("autoAlertThresholdPct") ?? 5),
        autoThemeWatchEnabled: formData.get("autoThemeWatchEnabled") === "on",
        autoThemeWatchFrequency: (formData.get("autoThemeWatchFrequency") as string) || "weekly",
        autoProductDropEnabled: formData.get("autoProductDropEnabled") === "on",
        autoProductDropFrequency: (formData.get("autoProductDropFrequency") as string) || "daily",
        autoSeoFixEnabled: formData.get("autoSeoFixEnabled") === "on",
        autoSeoFixFrequency: (formData.get("autoSeoFixFrequency") as string) || "weekly",
      },
    });
    return json({ success: true, saved: true });
  }

  return json({ error: "Action inconnue" }, { status: 400 });
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

function AutoCard({
  icon,
  label,
  description,
  enabledName,
  enabledValue,
  freqName,
  freqValue,
  freqOptions,
  locked,
  lockReason,
}: {
  icon: string;
  label: string;
  description: string;
  enabledName: string;
  enabledValue: boolean;
  freqName: string;
  freqValue: string;
  freqOptions: Array<{ value: string; label: string }>;
  locked: boolean;
  lockReason?: string;
}) {
  return (
    <Box
      padding="400"
      borderWidth="025"
      borderColor={locked ? "border" : enabledValue ? "border-success" : "border"}
      borderRadius="200"
      background={locked ? "bg-surface-secondary" : enabledValue ? "bg-fill-success-secondary" : "bg-surface"}
    >
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="start">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="headingMd" as="span">{icon}</Text>
            <BlockStack gap="050">
              <Text variant="bodyMd" as="p" fontWeight="bold">{label}</Text>
              {locked && lockReason && (
                <Badge tone="attention">{lockReason}</Badge>
              )}
            </BlockStack>
          </InlineStack>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: locked ? "not-allowed" : "pointer" }}>
            <input
              type="checkbox"
              name={enabledName}
              defaultChecked={enabledValue}
              disabled={locked}
              style={{ width: 18, height: 18, cursor: locked ? "not-allowed" : "pointer", accentColor: "#2c6ecb" }}
            />
            <Text as="span" variant="bodySm" fontWeight="semibold">
              {enabledValue ? "Actif" : "Inactif"}
            </Text>
          </label>
        </InlineStack>
        <Text variant="bodySm" as="p" tone="subdued">{description}</Text>
        <InlineStack gap="100" blockAlign="center">
          <Text variant="bodySm" as="span" tone="subdued">Fréquence :</Text>
          <select
            name={freqName}
            defaultValue={freqValue}
            disabled={locked}
            style={{
              minHeight: 30,
              border: "1px solid #c9cccf",
              borderRadius: 6,
              padding: "3px 8px",
              fontSize: 13,
              background: locked ? "#f6f6f7" : "#fff",
              cursor: locked ? "not-allowed" : "pointer",
            }}
          >
            {freqOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </InlineStack>
      </BlockStack>
    </Box>
  );
}

export default function Dashboard() {
  const {
    shop,
    latestAnalysis,
    recentAnalyses,
    watchedProducts,
    latestSeoScan,
    automationAccess,
    shopDomain,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const isPaid = shop.plan === "PRO" || shop.plan === "GROWTH";
  const hasAutomationAddon = "allowed" in automationAccess && automationAccess.allowed;
  const autoLocked = !isPaid || !hasAutomationAddon;

  const lockReason = !isPaid
    ? "Plan Pro ou Growth requis"
    : !hasAutomationAddon
    ? "Addon Automation+ requis (+5$/mois)"
    : undefined;

  const FREQ_FAST = [
    { value: "6h", label: "Toutes les 6h" },
    { value: "12h", label: "Toutes les 12h" },
    { value: "daily", label: "1x par jour" },
    { value: "48h", label: "Toutes les 48h" },
  ];
  const FREQ_MEDIUM = [
    { value: "daily", label: "Quotidien" },
    { value: "3days", label: "Tous les 3 jours" },
    { value: "weekly", label: "Hebdomadaire" },
    { value: "biweekly", label: "2x par mois" },
    { value: "monthly", label: "Mensuel" },
  ];
  const FREQ_SLOW = [
    { value: "weekly", label: "Hebdomadaire" },
    { value: "biweekly", label: "2x par mois" },
    { value: "monthly", label: "Mensuel" },
    { value: "quarterly", label: "Trimestriel" },
  ];

  return (
    <Page title="ShopPulseAi" subtitle={`${shop.name || shop.domain}`}>
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

        {/* Modules premium */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h3">Modules premium</Text>
              {shop.plan === "FREE" ? (
                <Badge tone="attention">Réservé aux plans payants</Badge>
              ) : (
                <Badge tone="success">Actif</Badge>
              )}
            </InlineStack>
            <InlineGrid columns={2} gap="300">
              <Box padding="300" borderWidth="025" borderColor="border" borderRadius="200">
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h4">SEO Optimizer</Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Scan SEO complet, priorisation des issues et suggestions IA.
                  </Text>
                  {latestSeoScan && (
                    <Text variant="bodySm" as="p" tone="subdued">
                      Dernier scan : {new Date(latestSeoScan.createdAt).toLocaleDateString("fr-FR")} — {latestSeoScan.status}
                    </Text>
                  )}
                  <InlineStack align="end">
                    {shop.plan === "FREE" ? (
                      <Button variant="primary" onClick={() => navigate("/app/billing")}>Débloquer</Button>
                    ) : (
                      <Button onClick={() => navigate("/app/seo")}>Ouvrir SEO</Button>
                    )}
                  </InlineStack>
                </BlockStack>
              </Box>
              <Box padding="300" borderWidth="025" borderColor="border" borderRadius="200">
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h4">Veille concurrentielle</Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Surveillance des prix, analyse forces/faiblesses, alertes et recommandations.
                  </Text>
                  {watchedProducts.length > 0 && (
                    <Text variant="bodySm" as="p" tone="subdued">
                      {watchedProducts.length} produit(s) sous surveillance
                    </Text>
                  )}
                  <InlineStack align="end">
                    {shop.plan === "FREE" ? (
                      <Button variant="primary" onClick={() => navigate("/app/billing")}>Débloquer</Button>
                    ) : (
                      <Button onClick={() => navigate("/app/competitive")}>Ouvrir Watcher</Button>
                    )}
                  </InlineStack>
                </BlockStack>
              </Box>
            </InlineGrid>
          </BlockStack>
        </Card>

        {/* ─── Centre d'automatisation ──────────────────────────────────────── */}
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingLg" as="h2">Centre d'automatisation</Text>
                <InlineStack gap="200">
                  {hasAutomationAddon && <Badge tone="success">Automation+ actif</Badge>}
                  {isPaid && !hasAutomationAddon && (
                    <Button variant="primary" onClick={() => navigate("/app/billing")}>
                      Activer Automation+ (+5$/mois)
                    </Button>
                  )}
                </InlineStack>
              </InlineStack>
              <Text variant="bodySm" as="p" tone="subdued">
                Automatisez les tâches récurrentes de votre boutique. Chaque module peut être activé/désactivé individuellement avec sa propre fréquence.
              </Text>
            </BlockStack>

            {/* Pré-requis explicite */}
            {!isPaid && (
              <Banner tone="warning">
                <BlockStack gap="100">
                  <Text as="p" fontWeight="semibold">Plan payant requis</Text>
                  <Text as="p" variant="bodySm">
                    L'automatisation nécessite un abonnement Pro (19$/mois) ou Growth (49$/mois), plus l'addon Automation+ (+5$/mois).
                    Souscrivez un plan payant pour débloquer ces fonctionnalités.
                  </Text>
                  <InlineStack>
                    <Button variant="primary" onClick={() => navigate("/app/billing")}>
                      Voir les plans
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Banner>
            )}
            {isPaid && !hasAutomationAddon && (
              <Banner tone="info">
                <BlockStack gap="100">
                  <Text as="p" fontWeight="semibold">Addon Automation+ requis</Text>
                  <Text as="p" variant="bodySm">
                    Vous êtes sur le plan {shop.plan}. Pour activer l'automatisation, ajoutez l'option Automation+ à 5$/mois supplémentaires.
                    Vos réglages ci-dessous seront sauvegardés et s'activeront dès l'activation de l'addon.
                  </Text>
                  <InlineStack>
                    <Button variant="primary" onClick={() => navigate("/app/billing")}>
                      Activer Automation+ (+5$/mois)
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Banner>
            )}

            {actionData && "saved" in actionData && actionData.saved && (
              <Banner tone="success">
                <Text as="p">Réglages d'automatisation enregistrés avec succès.</Text>
              </Banner>
            )}

            <form
              method="post"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                fd.set("intent", "save_automation");
                submit(fd, { method: "post" });
              }}
            >
              <input type="hidden" name="intent" value="save_automation" />
              <BlockStack gap="300">
                {/* Section : Veille & Prix */}
                <Text variant="headingSm" as="h4">Veille & Prix</Text>
                <InlineGrid columns={2} gap="300">
                  <AutoCard
                    icon="📊"
                    label="Vérification prix concurrents"
                    description={`Scrape automatiquement les prix des ${watchedProducts.length} concurrent(s) enregistré(s) et met à jour les écarts.`}
                    enabledName="autoCompetitiveEnabled"
                    enabledValue={shop.autoCompetitiveEnabled}
                    freqName="autoCompetitiveFrequency"
                    freqValue={shop.autoCompetitiveFrequency}
                    freqOptions={FREQ_FAST}
                    locked={autoLocked}
                    lockReason={lockReason}
                  />
                  <AutoCard
                    icon="🔔"
                    label="Alertes de variation de prix"
                    description="Déclenche une alerte lorsqu'un concurrent modifie son prix au-delà du seuil défini."
                    enabledName="autoAlertsEnabled"
                    enabledValue={shop.autoAlertsEnabled}
                    freqName="autoAlertThresholdPct"
                    freqValue={String(shop.autoAlertThresholdPct)}
                    freqOptions={[
                      { value: "3", label: "Seuil 3%" },
                      { value: "5", label: "Seuil 5%" },
                      { value: "10", label: "Seuil 10%" },
                      { value: "15", label: "Seuil 15%" },
                      { value: "20", label: "Seuil 20%" },
                    ]}
                    locked={autoLocked}
                    lockReason={lockReason}
                  />
                </InlineGrid>

                <Divider />

                {/* Section : SEO */}
                <Text variant="headingSm" as="h4">SEO</Text>
                <InlineGrid columns={2} gap="300">
                  <AutoCard
                    icon="🔍"
                    label="Re-scan SEO complet"
                    description="Relance automatiquement un scan SEO complet de votre boutique à la fréquence choisie."
                    enabledName="autoSeoEnabled"
                    enabledValue={shop.autoSeoEnabled}
                    freqName="autoSeoFrequency"
                    freqValue={shop.autoSeoFrequency}
                    freqOptions={FREQ_SLOW}
                    locked={autoLocked}
                    lockReason={lockReason}
                  />
                  <AutoCard
                    icon="🛠"
                    label="Correction SEO automatique"
                    description="Applique automatiquement les corrections SEO recommandées (meta titles, descriptions, alt images) selon la fréquence choisie."
                    enabledName="autoSeoFixEnabled"
                    enabledValue={shop.autoSeoFixEnabled}
                    freqName="autoSeoFixFrequency"
                    freqValue={shop.autoSeoFixFrequency}
                    freqOptions={FREQ_MEDIUM}
                    locked={autoLocked}
                    lockReason={lockReason}
                  />
                </InlineGrid>

                <Divider />

                {/* Section : Analyse & Score */}
                <Text variant="headingSm" as="h4">Analyse & Score</Text>
                <InlineGrid columns={2} gap="300">
                  <AutoCard
                    icon="📈"
                    label="Relance Store Score"
                    description="Recalcule automatiquement votre Store Score global (SEO, Vitesse, Produits, Conversion, UX, Trust, Prix)."
                    enabledName="autoAnalysisEnabled"
                    enabledValue={shop.autoAnalysisEnabled}
                    freqName="autoAnalysisFrequency"
                    freqValue={shop.autoAnalysisFrequency}
                    freqOptions={FREQ_SLOW}
                    locked={autoLocked}
                    lockReason={lockReason}
                  />
                  <AutoCard
                    icon="🎨"
                    label="Surveillance changement de thème"
                    description="Détecte automatiquement si un concurrent change de thème Shopify ou de design et vous alerte."
                    enabledName="autoThemeWatchEnabled"
                    enabledValue={shop.autoThemeWatchEnabled}
                    freqName="autoThemeWatchFrequency"
                    freqValue={shop.autoThemeWatchFrequency}
                    freqOptions={FREQ_MEDIUM}
                    locked={autoLocked}
                    lockReason={lockReason}
                  />
                </InlineGrid>

                <Divider />

                {/* Section : Produits & Dropshipping */}
                <Text variant="headingSm" as="h4">Produits & Dropshipping</Text>
                <AutoCard
                  icon="📦"
                  label="Détection de nouveaux produits / dropshipping"
                  description="Surveille les catalogues concurrents et détecte quand de nouveaux produits sont ajoutés ou quand un changement de fournisseur dropshipping est détecté."
                  enabledName="autoProductDropEnabled"
                  enabledValue={shop.autoProductDropEnabled}
                  freqName="autoProductDropFrequency"
                  freqValue={shop.autoProductDropFrequency}
                  freqOptions={FREQ_MEDIUM}
                  locked={autoLocked}
                  lockReason={lockReason}
                />

                <Divider />

                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="bodySm" as="p" tone="subdued">
                    {autoLocked
                      ? "Les réglages seront appliqués dès l'activation de l'addon Automation+."
                      : "Les modifications prennent effet immédiatement."}
                  </Text>
                  <Button submit variant="primary" loading={isSaving}>
                    {isSaving ? "Enregistrement…" : "Enregistrer tous les réglages"}
                  </Button>
                </InlineStack>
              </BlockStack>
            </form>
          </BlockStack>
        </Card>

        {/* Store Score */}
        {!latestAnalysis ? (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400" align="center" inlineAlign="center">
                  <Text variant="headingLg" as="h2">Bienvenue dans ShopPulseAi</Text>
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
                        <Button variant="plain" onClick={() => navigate(`/app/report/${a.id}`)}>
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
