/**
 * app.seo.tsx
 *
 * Dashboard principal du SEO Optimizer.
 * Affiche :
 *  - Le score SEO global de la dernière analyse
 *  - Le nombre d'issues critiques / warnings
 *  - Le bouton pour lancer un nouveau scan
 *  - Le nombre d'optimisations déjà appliquées
 *  - Les issues non corrigées en priorité
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit, useNavigation, useActionData } from "@remix-run/react";
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
  ProgressBar,
  Divider,
  EmptyState,
  InlineGrid,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { runSeoScan } from "../services/seo/seo-scanner.server";
import { batchGenerateSuggestions } from "../services/seo/seo-ai.server";
import { getSeoScanDashboard, applyOptimization } from "../services/seo/seo-optimizer.server";
import { hasPaidModulesAccess } from "../services/billing/plans.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const paidAccess = await hasPaidModulesAccess(session.shop);
  if (!paidAccess.allowed) {
    throw redirect("/app/billing?source=seo");
  }
  const data = await getSeoScanDashboard(session.shop);
  return json(data ?? { latestScan: null, totalOptimizations: 0, plan: "FREE" });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const paidAccess = await hasPaidModulesAccess(session.shop);
  if (!paidAccess.allowed) {
    return redirect("/app/billing?source=seo");
  }
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "auto_fix_all") {
    const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
    if (!shop) return json({ error: "Boutique introuvable" }, { status: 404 });

    const latestScan = await prisma.seoScan.findFirst({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      include: { seoIssues: { where: { isFixed: false } } },
    });

    if (!latestScan || latestScan.seoIssues.length === 0) {
      return json({ autoFixResult: { fixed: 0, failed: 0, message: "Aucune issue à corriger." } });
    }

    const autoFixableTypes = [
      "MISSING_META_TITLE", "META_TITLE_TOO_SHORT", "META_TITLE_TOO_LONG",
      "MISSING_META_DESCRIPTION", "META_DESCRIPTION_TOO_SHORT", "META_DESCRIPTION_TOO_LONG",
      "MISSING_ALT_TEXT",
    ];

    const fixableIssues = latestScan.seoIssues.filter(
      (i) => autoFixableTypes.includes(i.issueType)
    );

    if (fixableIssues.length === 0) {
      return json({ autoFixResult: { fixed: 0, failed: 0, message: "Aucune issue corrigeable automatiquement détectée." } });
    }

    // Générer les suggestions manquantes à la volée
    const suggestionsMap = new Map<string, string>();
    for (const i of fixableIssues) {
      if (i.suggestedValue) suggestionsMap.set(i.id, i.suggestedValue);
    }

    const issuesNeedingSuggestion = fixableIssues.filter((i) => !i.suggestedValue);
    if (issuesNeedingSuggestion.length > 0) {
      console.log(`[auto-fix] Génération de ${issuesNeedingSuggestion.length} suggestion(s) manquante(s)...`);
      const shopName = shop.shopName ?? session.shop;
      const generated = await batchGenerateSuggestions(
        issuesNeedingSuggestion.map((i) => ({
          id: i.id,
          issueType: i.issueType,
          resourceTitle: i.resourceTitle,
          resourceType: i.resourceType,
          currentValue: i.currentValue,
        })),
        shopName,
      );

      for (const [issueId, value] of generated) {
        suggestionsMap.set(issueId, value);
        await prisma.seoIssue.update({
          where: { id: issueId },
          data: { suggestedValue: value, aiGenerated: true },
        }).catch(() => {});
      }
      console.log(`[auto-fix] ${generated.size} suggestion(s) générée(s), total avec suggestions: ${suggestionsMap.size}`);
    }

    let fixed = 0;
    let failed = 0;
    let skipped = 0;

    console.log(`[auto-fix] Début application: ${fixableIssues.length} issues, suggestionsMap size=${suggestionsMap.size}`);
    console.log(`[auto-fix] Types: ${fixableIssues.slice(0, 5).map(i => `${i.issueType}(${i.id.substring(0,8)})`).join(", ")}`);
    console.log(`[auto-fix] MapKeys: ${[...suggestionsMap.keys()].slice(0, 5).map(k => k.substring(0,8)).join(", ")}`);
    if (fixableIssues.length > 0) {
      const sample = fixableIssues[0];
      const fn = sample.issueType.includes("META_TITLE") ? "metaTitle" : sample.issueType.includes("META_DESCRIPTION") ? "metaDescription" : sample.issueType === "MISSING_ALT_TEXT" ? "altText" : null;
      console.log(`[auto-fix] Sample: id=${sample.id}, type=${sample.issueType}, fieldName=${fn}, inMap=${suggestionsMap.has(sample.id)}`);
    }

    for (const issue of fixableIssues) {
      const fieldName =
        issue.issueType.includes("META_TITLE") ? "metaTitle"
        : issue.issueType.includes("META_DESCRIPTION") ? "metaDescription"
        : issue.issueType === "MISSING_ALT_TEXT" ? "altText"
        : null;

      const suggestion = suggestionsMap.get(issue.id);
      if (!fieldName || !suggestion) {
        console.log(`[auto-fix] SKIP: id=${issue.id}, type=${issue.issueType}, fieldName=${fieldName}, hasSuggestion=${!!suggestion}`);
        skipped++;
        continue;
      }

      try {
        console.log(`[auto-fix] Applying ${fieldName} on ${issue.resourceType} ${issue.resourceId}: "${suggestion.substring(0, 50)}..."`);
        const result = await applyOptimization(admin, {
          seoScanId: latestScan.id,
          shopId: shop.id,
          issueId: issue.id,
          issueType: issue.issueType,
          resourceType: issue.resourceType,
          resourceId: issue.resourceId,
          resourceTitle: issue.resourceTitle,
          fieldName,
          oldValue: issue.currentValue,
          newValue: suggestion,
        });
        if (result.success) {
          console.log(`[auto-fix] OK: ${issue.resourceTitle}`);
          fixed++;
        } else {
          console.log(`[auto-fix] ECHEC: ${issue.resourceTitle} - ${result.error}`);
          failed++;
        }
      } catch (err: any) {
        console.log(`[auto-fix] ERREUR: ${issue.resourceTitle} - ${err?.message}`);
        failed++;
      }
    }

    const parts = [`${fixed} correction(s) appliquée(s) sur Shopify`];
    if (failed > 0) parts.push(`${failed} échec(s)`);
    if (skipped > 0) parts.push(`${skipped} sans suggestion`);

    return json({
      autoFixResult: {
        fixed,
        failed,
        skipped,
        total: fixableIssues.length,
        message: parts.join(", ") + ".",
      },
    });
  }

  if (intent === "run_scan") {
    const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
    if (!shop) return json({ error: "Boutique introuvable" }, { status: 404 });

    // Lancement du scan
    const scanResult = await runSeoScan(admin);

    const scan = await prisma.seoScan.create({
      data: {
        shopId: shop.id,
        overallScore: scanResult.overallScore,
        status: "COMPLETED",
        totalIssues: scanResult.totalIssues,
        criticalIssues: scanResult.criticalIssues,
        warningIssues: scanResult.warningIssues,
        metaDetails: scanResult.metaDetails as any,
        headingDetails: scanResult.headingDetails as any,
        altTextDetails: scanResult.altTextDetails as any,
        duplicateDetails: scanResult.duplicateDetails as any,
        seoIssues: {
          create: scanResult.issues.map((issue) => ({
            issueType: issue.issueType as any,
            severity: issue.severity as any,
            category: issue.category,
            resourceType: issue.resourceType,
            resourceId: issue.resourceId,
            resourceTitle: issue.resourceTitle,
            resourceUrl: issue.resourceUrl,
            description: issue.description,
            currentValue: issue.currentValue,
            suggestedValue: issue.suggestedValue,
          })),
        },
      },
      include: { seoIssues: true },
    });

    const aiFixableTypes = [
      "MISSING_META_TITLE", "META_TITLE_TOO_SHORT", "META_TITLE_TOO_LONG",
      "MISSING_META_DESCRIPTION", "META_DESCRIPTION_TOO_SHORT", "META_DESCRIPTION_TOO_LONG",
      "MISSING_ALT_TEXT",
    ];
    const issuesNeedingAI = scan.seoIssues
      .filter((i) => !i.suggestedValue && aiFixableTypes.includes(i.issueType))
      .slice(0, 30);

    if (issuesNeedingAI.length > 0) {
      try {
        const suggestions = await batchGenerateSuggestions(
          issuesNeedingAI.map((i) => ({
            id: i.id,
            issueType: i.issueType,
            resourceTitle: i.resourceTitle,
            resourceType: i.resourceType,
            currentValue: i.currentValue,
          })),
          shop.shopName ?? session.shop
        );

        // Mise à jour des suggestions en base
        await Promise.allSettled(
          Array.from(suggestions.entries()).map(([issueId, value]) =>
            prisma.seoIssue.update({
              where: { id: issueId },
              data: { suggestedValue: value, aiGenerated: true },
            })
          )
        );
      } catch {
        // Non-bloquant : le scan est quand même sauvegardé
      }
    }

    return redirect(`/app/seo/${scan.id}`);
  }

  return json({ error: "Action inconnue" }, { status: 400 });
};

// ── Composant : tuile de statistique ─────────────────────────────────────────
function StatTile({ label, value, tone }: {
  label: string;
  value: string | number;
  tone?: "critical" | "warning" | "success" | "info";
}) {
  return (
    <Box padding="300" borderWidth="025" borderColor="border" borderRadius="200">
      <BlockStack gap="100" inlineAlign="center">
        <Text
          variant="heading2xl"
          as="p"
          fontWeight="bold"
          tone={tone === "critical" ? "critical" : tone === "success" ? "success" : undefined}
        >
          {value}
        </Text>
        <Text variant="bodySm" as="p" tone="subdued" alignment="center">{label}</Text>
      </BlockStack>
    </Box>
  );
}

// ── Composant : badge de sévérité ─────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, { label: string; tone: "critical" | "warning" | "info" | "success" }> = {
    CRITICAL: { label: "Critique", tone: "critical" },
    ERROR: { label: "Erreur", tone: "critical" },
    WARNING: { label: "Avertissement", tone: "warning" },
    INFO: { label: "Info", tone: "info" },
  };
  const c = config[severity] ?? { label: severity, tone: "info" };
  return <Badge tone={c.tone}>{c.label}</Badge>;
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function SeoDashboard() {
  const { latestScan, totalOptimizations, plan } = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const submittingIntent = navigation.formData?.get("intent") as string | null;
  const isScanning = navigation.state === "submitting" && submittingIntent === "run_scan";
  const isAutoFixing = navigation.state === "submitting" && submittingIntent === "auto_fix_all";

  const scoreColor = latestScan
    ? latestScan.overallScore >= 70
      ? "success"
      : latestScan.overallScore >= 40
      ? "warning"
      : "critical"
    : "info";

  return (
    <Page
      title="SEO Optimizer"
      subtitle="Analysez et optimisez automatiquement le SEO de votre boutique"
      primaryAction={{
        content: isScanning ? "Scan en cours..." : "Lancer un scan SEO",
        loading: isScanning,
        onAction: () => submit({ intent: "run_scan" }, { method: "post" }),
      }}
      secondaryActions={
        latestScan
          ? [{ content: "Voir le rapport complet", url: `/app/seo/${latestScan.id}` }]
          : []
      }
    >
      <BlockStack gap="500">
        {/* Bandeau plan */}
        <Banner tone="info">
          <Text as="p">
            Plan <Badge tone="info">{plan}</Badge> —{" "}
            {plan === "FREE"
              ? "Scan limité. Passez au Pro pour optimisations automatiques illimitées."
              : "Scan complet et optimisations automatiques activés."}
          </Text>
          {plan === "FREE" && (
            <Button onClick={() => navigate("/app/billing")}>Passer au Pro</Button>
          )}
        </Banner>

        {!latestScan ? (
          // ── État vide : premier scan ───────────────────────────────────
          <Layout>
            <Layout.Section>
              <Card>
                <EmptyState
                  heading="Lancez votre premier scan SEO"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{
                    content: "Lancer le scan",
                    loading: isScanning,
                    onAction: () => submit({ intent: "run_scan" }, { method: "post" }),
                  }}
                >
                  <p>
                    Analysez l'ensemble de vos produits, pages et collections en
                    quelques secondes. Obtenez un score SEO et des recommandations
                    actionnables générées par l'IA.
                  </p>
                </EmptyState>
              </Card>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h3">Ce qui est analysé</Text>
                  {[
                    { cat: "Meta titles", desc: "Longueur, doublons, mots-clés" },
                    { cat: "Meta descriptions", desc: "Longueur, call-to-action" },
                    { cat: "Balises H1/H2", desc: "Présence, unicité, structure" },
                    { cat: "Images alt text", desc: "Couverture des images" },
                    { cat: "Contenu dupliqué", desc: "Détection cross-ressources" },
                    { cat: "Contenu mince", desc: "Pages avec peu de contenu" },
                  ].map((item) => (
                    <Box key={item.cat} padding="200" borderWidth="025" borderColor="border" borderRadius="100">
                      <BlockStack gap="050">
                        <Text variant="bodySm" as="p" fontWeight="semibold">{item.cat}</Text>
                        <Text variant="bodySm" as="p" tone="subdued">{item.desc}</Text>
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        ) : (
          // ── Dashboard avec données ────────────────────────────────────
          <Layout>
            <Layout.Section>
              <BlockStack gap="400">
                {/* Score SEO global */}
                <Card>
                  <BlockStack gap="300">
                    <Text variant="headingLg" as="h2">Score SEO global</Text>
                    <InlineStack gap="400" blockAlign="center">
                      <Box minInlineSize="80px">
                        <Text
                          variant="heading3xl"
                          as="p"
                          fontWeight="bold"
                          tone={scoreColor === "critical" ? "critical" : scoreColor === "success" ? "success" : undefined}
                        >
                          {Math.round(latestScan.overallScore)}/100
                        </Text>
                      </Box>
                      <Box grow>
                        <ProgressBar
                          progress={latestScan.overallScore}
                          tone={scoreColor as any}
                        />
                      </Box>
                    </InlineStack>

                    <InlineGrid columns={4} gap="300">
                      <StatTile
                        label="Issues totales"
                        value={latestScan.totalIssues}
                        tone="warning"
                      />
                      <StatTile
                        label="Critiques"
                        value={latestScan.criticalIssues}
                        tone={latestScan.criticalIssues > 0 ? "critical" : "success"}
                      />
                      <StatTile
                        label="Warnings"
                        value={latestScan.warningIssues}
                        tone={latestScan.warningIssues > 0 ? "warning" : "success"}
                      />
                      <StatTile
                        label="Corrigées"
                        value={totalOptimizations}
                        tone="success"
                      />
                    </InlineGrid>

                    <Text variant="bodySm" as="p" tone="subdued">
                      Dernier scan :{" "}
                      {new Date(latestScan.createdAt).toLocaleString("fr-FR", {
                        day: "2-digit", month: "long", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </Text>
                  </BlockStack>
                </Card>

                {/* Issues prioritaires */}
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h3">
                        Issues prioritaires ({latestScan.seoIssues.filter((i: any) => !i.isFixed).length})
                      </Text>
                      <Button url={`/app/seo/${latestScan.id}`}>
                        Tout voir
                      </Button>
                    </InlineStack>

                    {latestScan.seoIssues.filter((i: any) => !i.isFixed).slice(0, 8).map((issue: any) => (
                      <Box
                        key={issue.id}
                        padding="300"
                        borderWidth="025"
                        borderColor="border"
                        borderRadius="200"
                      >
                        <InlineStack align="space-between" blockAlign="start">
                          <BlockStack gap="100">
                            <InlineStack gap="200">
                              <SeverityBadge severity={issue.severity} />
                              <Text variant="bodyMd" as="p" fontWeight="semibold">
                                {issue.resourceTitle}
                              </Text>
                            </InlineStack>
                            <Text variant="bodySm" as="p" tone="subdued">
                              {issue.description}
                            </Text>
                            {issue.suggestedValue && (
                              <Box
                                padding="150"
                                background="bg-surface-success"
                                borderRadius="100"
                              >
                                <Text variant="bodySm" as="p" tone="success">
                                  💡 Suggestion IA : {issue.suggestedValue.substring(0, 100)}
                                  {issue.suggestedValue.length > 100 ? "..." : ""}
                                </Text>
                              </Box>
                            )}
                          </BlockStack>
                          <Badge>{issue.resourceType}</Badge>
                        </InlineStack>
                      </Box>
                    ))}

                    {latestScan.seoIssues.filter((i: any) => !i.isFixed).length > 8 && (
                      <Button
                        variant="plain"
                        url={`/app/seo/${latestScan.id}`}
                      >
                        Voir les {latestScan.seoIssues.filter((i: any) => !i.isFixed).length - 8} autres issues →
                      </Button>
                    )}
                  </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>

            <Layout.Section variant="oneThird">
              {/* Répartition par catégorie */}
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">Répartition des issues</Text>
                  {[
                    {
                      label: "Meta titles",
                      count: latestScan.seoIssues.filter((i: any) => i.issueType.includes("META_TITLE")).length,
                      color: "critical",
                    },
                    {
                      label: "Meta descriptions",
                      count: latestScan.seoIssues.filter((i: any) => i.issueType.includes("META_DESCRIPTION")).length,
                      color: "warning",
                    },
                    {
                      label: "Balises H1/H2",
                      count: latestScan.seoIssues.filter((i: any) => i.issueType.includes("H1") || i.issueType.includes("H2")).length,
                      color: "warning",
                    },
                    {
                      label: "Images sans alt",
                      count: latestScan.seoIssues.filter((i: any) => i.issueType === "MISSING_ALT_TEXT").length,
                      color: "info",
                    },
                    {
                      label: "Doublons",
                      count: latestScan.seoIssues.filter((i: any) => i.issueType.includes("DUPLICATE")).length,
                      color: "critical",
                    },
                  ].map((cat) => (
                    <InlineStack key={cat.label} align="space-between" blockAlign="center">
                      <Text variant="bodyMd" as="p">{cat.label}</Text>
                      <Badge tone={cat.count > 0 ? (cat.color as any) : "success"}>
                        {cat.count}
                      </Badge>
                    </InlineStack>
                  ))}
                  <Divider />
                  {actionData?.autoFixResult && (
                    <Banner tone={actionData.autoFixResult.failed > 0 ? "warning" : "success"}>
                      <Text as="p">{actionData.autoFixResult.message}</Text>
                    </Banner>
                  )}
                  <Button
                    variant="primary"
                    loading={isAutoFixing}
                    onClick={() => submit({ intent: "auto_fix_all" }, { method: "post" })}
                  >
                    {isAutoFixing ? "Correction en cours..." : "Corriger automatiquement"}
                  </Button>
                  <Button url={`/app/seo/${latestScan.id}`}>
                    Ouvrir le rapport complet
                  </Button>
                </BlockStack>
              </Card>

              {/* Optimisations appliquées */}
              {totalOptimizations > 0 && (
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h3">Optimisations appliquées</Text>
                    <Text variant="heading2xl" as="p" fontWeight="bold" tone="success">
                      {totalOptimizations}
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Corrections SEO appliquées directement sur votre boutique Shopify.
                    </Text>
                  </BlockStack>
                </Card>
              )}
            </Layout.Section>
          </Layout>
        )}
      </BlockStack>
    </Page>
  );
}
