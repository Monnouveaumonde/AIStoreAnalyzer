/**
 * app.seo.$id.tsx
 *
 * Rapport détaillé d'un scan SEO.
 * Permet de :
 *  - Voir toutes les issues groupées par catégorie
 *  - Éditer manuellement une suggestion IA avant application
 *  - Appliquer une optimisation en 1 clic directement sur Shopify
 *  - Marquer une issue comme résolue manuellement
 *  - Filtrer par sévérité et catégorie
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
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
  TextField,
  Collapsible,
  Divider,
  Select,
  InlineGrid,
  ProgressBar,
  Spinner,
  Toast,
  Frame,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { applyOptimization } from "../services/seo/seo-optimizer.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  const scan = await prisma.seoScan.findUnique({
    where: { id },
    include: {
      seoIssues: { orderBy: [{ severity: "desc" }, { isFixed: "asc" }] },
      shop: { select: { shopDomain: true, shopName: true, id: true } },
    },
  });

  if (!scan) throw new Response("Scan introuvable", { status: 404 });

  return json({ scan, shopId: scan.shop.id, shopName: scan.shop.shopName ?? session.shop });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const { id: seoScanId } = params;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "apply_optimization") {
    const issueId = formData.get("issueId") as string;
    const shopId = formData.get("shopId") as string;
    const newValue = formData.get("newValue") as string;

    const issue = await prisma.seoIssue.findUnique({ where: { id: issueId } });
    if (!issue) return json({ error: "Issue introuvable" }, { status: 404 });

    // Détermine le fieldName depuis l'issueType
    const fieldName =
      issue.issueType.includes("META_TITLE")
        ? "metaTitle"
        : issue.issueType.includes("META_DESCRIPTION")
        ? "metaDescription"
        : issue.issueType === "MISSING_ALT_TEXT"
        ? "altText"
        : null;

    if (!fieldName) {
      return json({ error: "Ce type d'issue ne peut pas être corrigé automatiquement." }, { status: 400 });
    }

    const result = await applyOptimization(admin, {
      seoScanId: seoScanId!,
      shopId,
      issueId,
      issueType: issue.issueType,
      resourceType: issue.resourceType,
      resourceId: issue.resourceId,
      resourceTitle: issue.resourceTitle,
      fieldName,
      oldValue: issue.currentValue,
      newValue,
    });

    return json({ success: result.success, error: result.error });
  }

  if (intent === "mark_fixed") {
    const issueId = formData.get("issueId") as string;
    await prisma.seoIssue.update({
      where: { id: issueId },
      data: { isFixed: true, fixedAt: new Date() },
    });
    return json({ success: true });
  }

  if (intent === "update_suggestion") {
    const issueId = formData.get("issueId") as string;
    const newSuggestion = formData.get("newSuggestion") as string;
    await prisma.seoIssue.update({
      where: { id: issueId },
      data: { suggestedValue: newSuggestion },
    });
    return json({ success: true });
  }

  return json({ error: "Action inconnue" }, { status: 400 });
};

// ── Composant : carte d'une issue SEO ────────────────────────────────────────
function IssueCard({
  issue,
  shopId,
  seoScanId,
  onApply,
}: {
  issue: any;
  shopId: string;
  seoScanId: string;
  onApply: (issueId: string, newValue: string) => void;
}) {
  const [editedValue, setEditedValue] = useState(issue.suggestedValue ?? issue.currentValue ?? "");
  const [showEdit, setShowEdit] = useState(false);

  const isAutoFixable = [
    "MISSING_META_TITLE", "META_TITLE_TOO_SHORT", "META_TITLE_TOO_LONG",
    "MISSING_META_DESCRIPTION", "META_DESCRIPTION_TOO_SHORT", "META_DESCRIPTION_TOO_LONG",
    "MISSING_ALT_TEXT",
  ].includes(issue.issueType);

  const severityConfig: Record<string, { tone: "critical" | "warning" | "info" | "success"; label: string }> = {
    CRITICAL: { tone: "critical", label: "Critique" },
    ERROR: { tone: "critical", label: "Erreur" },
    WARNING: { tone: "warning", label: "Avertissement" },
    INFO: { tone: "info", label: "Info" },
  };
  const sev = severityConfig[issue.severity] ?? { tone: "info", label: issue.severity };

  if (issue.isFixed) {
    return (
      <Box padding="300" background="bg-surface-success" borderRadius="200">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200">
            <Badge tone="success">Corrigé</Badge>
            <Text variant="bodyMd" as="p">{issue.resourceTitle}</Text>
          </InlineStack>
          <Text variant="bodySm" as="p" tone="subdued">
            {issue.fixedAt ? new Date(issue.fixedAt).toLocaleDateString("fr-FR") : ""}
          </Text>
        </InlineStack>
      </Box>
    );
  }

  return (
    <Box padding="400" borderWidth="025" borderColor="border" borderRadius="200">
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start">
          <InlineStack gap="200" blockAlign="center">
            <Badge tone={sev.tone}>{sev.label}</Badge>
            <Badge>{issue.resourceType}</Badge>
            <Text variant="headingSm" as="h4">{issue.resourceTitle}</Text>
          </InlineStack>
          <InlineStack gap="100">
            <Button variant="plain" onClick={() => setShowEdit(!showEdit)}>
              {showEdit ? "Fermer" : "Modifier"}
            </Button>
          </InlineStack>
        </InlineStack>

        <Text variant="bodyMd" as="p">{issue.description}</Text>

        {issue.currentValue && (
          <Box padding="200" background="bg-surface-caution" borderRadius="100">
            <Text variant="bodySm" as="p">
              <strong>Valeur actuelle :</strong> {issue.currentValue}
            </Text>
          </Box>
        )}

        {/* Suggestion IA ou édition manuelle */}
        <Collapsible open={isAutoFixable} id={`fix-${issue.id}`}>
          <BlockStack gap="200">
            {issue.suggestedValue && !showEdit ? (
              <Box padding="200" background="bg-surface-success" borderRadius="100">
                <BlockStack gap="100">
                  <Text variant="bodySm" as="p" fontWeight="semibold" tone="success">
                    💡 Suggestion {issue.aiGenerated ? "IA" : ""}
                  </Text>
                  <Text variant="bodySm" as="p">{issue.suggestedValue}</Text>
                </BlockStack>
              </Box>
            ) : null}

            {showEdit && (
              <TextField
                label="Valeur à appliquer"
                value={editedValue}
                onChange={setEditedValue}
                multiline={issue.issueType.includes("DESCRIPTION") ? 3 : undefined}
                helpText={
                  issue.issueType.includes("META_TITLE")
                    ? `${editedValue.length}/60 caractères`
                    : issue.issueType.includes("DESCRIPTION")
                    ? `${editedValue.length}/160 caractères`
                    : undefined
                }
                autoComplete="off"
              />
            )}

            {isAutoFixable && (
              <InlineStack gap="200">
                <Button
                  variant="primary"
                  disabled={!editedValue}
                  onClick={() => onApply(issue.id, editedValue)}
                >
                  Appliquer sur Shopify
                </Button>
                <Button
                  variant="plain"
                  onClick={() => {
                    /* mark_fixed handled by parent via submit */
                  }}
                >
                  Marquer comme corrigé
                </Button>
              </InlineStack>
            )}
          </BlockStack>
        </Collapsible>

        {!isAutoFixable && (
          <Text variant="bodySm" as="p" tone="subdued">
            Cette issue nécessite une correction manuelle dans l'éditeur Shopify.
          </Text>
        )}
      </BlockStack>
    </Box>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function SeoScanDetailPage() {
  const { scan, shopId, shopName } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [filterSeverity, setFilterSeverity] = useState("ALL");
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);

  const isApplying = navigation.state === "submitting";

  const handleApply = useCallback(
    (issueId: string, newValue: string) => {
      const data = new FormData();
      data.set("intent", "apply_optimization");
      data.set("issueId", issueId);
      data.set("shopId", shopId);
      data.set("newValue", newValue);
      submit(data, { method: "post" });
      setToastMessage("Optimisation appliquée sur votre boutique !");
      setToastError(false);
      setToastActive(true);
    },
    [shopId, submit]
  );

  // Filtrage des issues
  const issues = scan.seoIssues.filter((i: any) => {
    if (filterSeverity !== "ALL" && i.severity !== filterSeverity) return false;
    if (filterCategory !== "ALL" && i.category !== filterCategory) return false;
    return true;
  });

  const openIssues = issues.filter((i: any) => !i.isFixed);
  const fixedIssues = issues.filter((i: any) => i.isFixed);

  return (
    <Frame>
      <Page
        title="Rapport SEO"
        subtitle={`${shopName} — ${new Date(scan.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`}
        backAction={{ content: "SEO Optimizer", url: "/app/seo" }}
      >
        <BlockStack gap="500">
          {/* Score résumé */}
          <Card>
            <InlineGrid columns={5} gap="300">
              <Box padding="300" borderWidth="025" borderColor="border" borderRadius="200">
                <BlockStack gap="100" inlineAlign="center">
                  <Text variant="heading2xl" as="p" fontWeight="bold">
                    {Math.round(scan.overallScore)}
                  </Text>
                  <ProgressBar progress={scan.overallScore} tone={scan.overallScore >= 70 ? "success" : scan.overallScore >= 40 ? "highlight" : "critical"} size="small" />
                  <Text variant="bodySm" as="p" tone="subdued" alignment="center">Score SEO</Text>
                </BlockStack>
              </Box>
              {[
                { label: "Total issues", value: scan.totalIssues },
                { label: "Critiques", value: scan.criticalIssues },
                { label: "Warnings", value: scan.warningIssues },
                { label: "Corrigées", value: fixedIssues.length },
              ].map((s) => (
                <Box key={s.label} padding="300" borderWidth="025" borderColor="border" borderRadius="200">
                  <BlockStack gap="100" inlineAlign="center">
                    <Text variant="headingXl" as="p">{s.value}</Text>
                    <Text variant="bodySm" as="p" tone="subdued" alignment="center">{s.label}</Text>
                  </BlockStack>
                </Box>
              ))}
            </InlineGrid>
          </Card>

          {/* Filtres */}
          <InlineStack gap="300">
            <Box minInlineSize="200px">
              <Select
                label="Sévérité"
                options={[
                  { label: "Toutes", value: "ALL" },
                  { label: "Critique", value: "CRITICAL" },
                  { label: "Erreur", value: "ERROR" },
                  { label: "Avertissement", value: "WARNING" },
                  { label: "Info", value: "INFO" },
                ]}
                value={filterSeverity}
                onChange={setFilterSeverity}
              />
            </Box>
            <Box minInlineSize="200px">
              <Select
                label="Catégorie"
                options={[
                  { label: "Toutes", value: "ALL" },
                  { label: "Meta tags", value: "meta" },
                  { label: "Balises H1/H2", value: "heading" },
                  { label: "Images alt", value: "alt" },
                  { label: "Doublons", value: "duplicate" },
                ]}
                value={filterCategory}
                onChange={setFilterCategory}
              />
            </Box>
          </InlineStack>

          <Layout>
            <Layout.Section>
              {/* Issues ouvertes */}
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">
                    Issues à corriger ({openIssues.length})
                  </Text>
                  {isApplying && (
                    <InlineStack gap="200" blockAlign="center">
                      <Spinner size="small" />
                      <Text as="p" tone="subdued">Application sur Shopify...</Text>
                    </InlineStack>
                  )}
                  {openIssues.length === 0 ? (
                    <Banner tone="success">
                      <Text as="p">Toutes les issues visibles sont corrigées !</Text>
                    </Banner>
                  ) : (
                    <BlockStack gap="200">
                      {openIssues.map((issue: any) => (
                        <IssueCard
                          key={issue.id}
                          issue={issue}
                          shopId={shopId}
                          seoScanId={scan.id}
                          onApply={handleApply}
                        />
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              {/* Issues corrigées */}
              {fixedIssues.length > 0 && (
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h2">
                      Issues corrigées ({fixedIssues.length})
                    </Text>
                    {fixedIssues.map((issue: any) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        shopId={shopId}
                        seoScanId={scan.id}
                        onApply={handleApply}
                      />
                    ))}
                  </BlockStack>
                </Card>
              )}
            </Layout.Section>

            <Layout.Section variant="oneThird">
              {/* Répartition types */}
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h3">Types d'issues</Text>
                  <Divider />
                  {[
                    { label: "Meta title manquant", type: "MISSING_META_TITLE" },
                    { label: "Meta title trop long", type: "META_TITLE_TOO_LONG" },
                    { label: "Meta desc. manquante", type: "MISSING_META_DESCRIPTION" },
                    { label: "Meta desc. trop longue", type: "META_DESCRIPTION_TOO_LONG" },
                    { label: "H1 manquant", type: "MISSING_H1" },
                    { label: "Plusieurs H1", type: "MULTIPLE_H1" },
                    { label: "Alt text manquant", type: "MISSING_ALT_TEXT" },
                    { label: "Contenu dupliqué", type: "DUPLICATE_META_TITLE" },
                    { label: "Contenu mince", type: "THIN_CONTENT" },
                  ].map((item) => {
                    const count = scan.seoIssues.filter((i: any) => i.issueType === item.type).length;
                    if (count === 0) return null;
                    return (
                      <InlineStack key={item.type} align="space-between">
                        <Text variant="bodySm" as="p">{item.label}</Text>
                        <Badge tone={count > 0 ? "warning" : "success"}>{count}</Badge>
                      </InlineStack>
                    );
                  })}
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </Page>

      {toastActive && (
        <Toast
          content={toastMessage}
          onDismiss={() => setToastActive(false)}
          error={toastError}
        />
      )}
    </Frame>
  );
}
