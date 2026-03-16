import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
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
  Banner,
  Spinner,
} from "@shopify/polaris";
import { useState, useCallback, Fragment } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { hasFeatureAccess } from "../services/billing/plans.server";

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
  const { session } = await authenticate.admin(request);
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

  const automationAccess = await hasFeatureAccess(session.shop, "competitive_automation_plus");

  return json({
    analysis,
    totalRevenueImpact: Math.round((totalImpact - 1) * 100),
    appUrl: process.env.SHOPIFY_APP_URL || "",
    hasAutomation: automationAccess.allowed,
    shopDomain: session.shop,
  });
};

// ── Action : IA corrige automatiquement une opportunité ─────────────────────
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent !== "ai_fix_opportunity") {
    return json({ error: "Action inconnue" }, { status: 400 });
  }

  const automationAccess = await hasFeatureAccess(session.shop, "competitive_automation_plus");
  if (!automationAccess.allowed) {
    return json({ error: automationAccess.reason, needsUpgrade: true }, { status: 403 });
  }

  const aiActionType = formData.get("aiActionType") as string;
  const analysisId = params.id;

  try {
    switch (aiActionType) {
      case "AI_DESCRIPTIONS": {
        const productsResp = await admin.graphql(`
          query {
            products(first: 50) {
              edges {
                node {
                  id
                  title
                  descriptionHtml
                }
              }
            }
          }
        `);
        const productsData = await productsResp.json();
        const products = productsData.data?.products?.edges?.map((e: any) => e.node) || [];
        const emptyProducts = products.filter((p: any) => !p.descriptionHtml || p.descriptionHtml.trim().length < 50);

        if (emptyProducts.length === 0) {
          return json({ success: true, message: "Tous les produits ont déjà une description." });
        }

        let fixed = 0;
        let failed = 0;
        for (const product of emptyProducts.slice(0, 20)) {
          try {
            const description = await generateProductDescription(product.title);
            await admin.graphql(`
              mutation productUpdate($input: ProductInput!) {
                productUpdate(input: $input) {
                  product { id }
                  userErrors { field message }
                }
              }
            `, { variables: { input: { id: product.id, descriptionHtml: description } } });
            fixed++;
            if (fixed % 4 === 0) await new Promise(r => setTimeout(r, 500));
          } catch {
            failed++;
          }
        }
        return json({ success: true, message: `${fixed} description(s) générée(s) par IA.${failed > 0 ? ` ${failed} échec(s).` : ""}` });
      }

      case "AI_SEO_FIX": {
        return json({ success: true, message: "Redirection vers SEO Optimizer...", redirect: "/app/seo" });
      }

      case "AI_COMPARE_PRICES": {
        const productsResp = await admin.graphql(`
          query {
            products(first: 50) {
              edges {
                node {
                  id
                  title
                  variants(first: 1) {
                    edges {
                      node {
                        id
                        price
                        compareAtPrice
                      }
                    }
                  }
                }
              }
            }
          }
        `);
        const productsData = await productsResp.json();
        const products = productsData.data?.products?.edges?.map((e: any) => e.node) || [];
        const needsPricing = products.filter((p: any) => {
          const v = p.variants?.edges?.[0]?.node;
          return v && (!v.compareAtPrice || parseFloat(v.compareAtPrice) === 0);
        });

        if (needsPricing.length === 0) {
          return json({ success: true, message: "Tous les produits ont déjà un prix barré." });
        }

        let fixed = 0;
        let failed = 0;
        for (const product of needsPricing.slice(0, 30)) {
          const variant = product.variants?.edges?.[0]?.node;
          if (!variant) continue;
          const currentPrice = parseFloat(variant.price);
          const comparePrice = (currentPrice * 1.15).toFixed(2);
          try {
            await admin.graphql(`
              mutation productVariantUpdate($input: ProductVariantInput!) {
                productVariantUpdate(input: $input) {
                  productVariant { id }
                  userErrors { field message }
                }
              }
            `, { variables: { input: { id: variant.id, compareAtPrice: comparePrice } } });
            fixed++;
            if (fixed % 4 === 0) await new Promise(r => setTimeout(r, 500));
          } catch {
            failed++;
          }
        }
        return json({ success: true, message: `${fixed} prix barré(s) ajouté(s) (+15%).${failed > 0 ? ` ${failed} échec(s).` : ""}` });
      }

      case "AI_TRUST_PAGE": {
        const shopData = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
        const shopName = shopData?.shopName || session.shop.replace(".myshopify.com", "");
        const trustHtml = buildTrustPageHtml(shopName);
        const resp = await admin.graphql(`
          mutation pageCreate($page: PageCreateInput!) {
            pageCreate(page: $page) {
              page { id title }
              userErrors { field message }
            }
          }
        `, { variables: { page: { title: "Confiance & Garanties", body: trustHtml, isPublished: true } } });
        const result = await resp.json();
        const errors = result.data?.pageCreate?.userErrors;
        if (errors?.length > 0) {
          return json({ error: errors[0].message }, { status: 400 });
        }
        return json({ success: true, message: "Page \"Confiance & Garanties\" créée avec succès !" });
      }

      case "AI_CREATE_PAGES": {
        const shopData = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
        const shopName = shopData?.shopName || session.shop.replace(".myshopify.com", "");
        const analysisRecord = await prisma.analysis.findUnique({ where: { id: analysisId }, select: { uxDetails: true } });
        const uxDetails = analysisRecord?.uxDetails as any;

        const pagesToCreate: { title: string; body: string }[] = [];
        if (!uxDetails?.hasAboutPage) {
          pagesToCreate.push({ title: "À propos", body: buildAboutPageHtml(shopName) });
        }
        if (!uxDetails?.hasFaqPage) {
          pagesToCreate.push({ title: "FAQ", body: buildFaqPageHtml(shopName) });
        }

        if (pagesToCreate.length === 0) {
          return json({ success: true, message: "Les pages essentielles existent déjà." });
        }

        let created = 0;
        let failed = 0;
        for (const page of pagesToCreate) {
          try {
            await admin.graphql(`
              mutation pageCreate($page: PageCreateInput!) {
                pageCreate(page: $page) {
                  page { id }
                  userErrors { field message }
                }
              }
            `, { variables: { page: { title: page.title, body: page.body, isPublished: true } } });
            created++;
          } catch {
            failed++;
          }
        }
        return json({ success: true, message: `${created} page(s) créée(s) (${pagesToCreate.map(p => p.title).join(", ")}).${failed > 0 ? ` ${failed} échec(s).` : ""}` });
      }

      default:
        return json({ error: "Ce type d'action n'est pas automatisable." }, { status: 400 });
    }
  } catch (error) {
    console.error("[ai_fix_opportunity] Error:", error);
    return json({ error: "Une erreur est survenue pendant l'exécution de l'IA." }, { status: 500 });
  }
};

async function generateProductDescription(productTitle: string): Promise<string> {
  const prompt = `Génère une description produit e-commerce en HTML pour "${productTitle}".
La description doit :
- Faire 150-300 mots
- Inclure les bénéfices clients
- Utiliser des balises <p>, <ul>, <li> pour la structure
- Être persuasive et orientée conversion
- Être en français
Retourne UNIQUEMENT le HTML, sans explication.`;

  try {
    const provider = process.env.AI_PROVIDER ?? "openai";
    if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model: "claude-3-5-sonnet-20241022", max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await resp.json();
      return data.content?.[0]?.text ?? buildFallbackDescription(productTitle);
    }

    if (process.env.OPENAI_API_KEY) {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Tu es un copywriter e-commerce expert. Tu génères des descriptions produits persuasives en HTML." },
            { role: "user", content: prompt },
          ],
          max_tokens: 600,
          temperature: 0.6,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await resp.json();
      return data.choices?.[0]?.message?.content ?? buildFallbackDescription(productTitle);
    }
  } catch {
    // fallback
  }
  return buildFallbackDescription(productTitle);
}

function buildFallbackDescription(title: string): string {
  return `<p>Découvrez <strong>${title}</strong>, un produit de qualité conçu pour répondre à vos besoins.</p>
<ul>
<li>Qualité premium garantie</li>
<li>Livraison rapide et soignée</li>
<li>Satisfaction client assurée</li>
</ul>
<p>Commandez dès maintenant et profitez d'une expérience d'achat exceptionnelle.</p>`;
}

function buildTrustPageHtml(shopName: string): string {
  return `<h2>Pourquoi faire confiance à ${shopName} ?</h2>
<h3>Paiement 100% sécurisé</h3>
<p>Toutes vos transactions sont protégées par un cryptage SSL de niveau bancaire. Nous acceptons les principales cartes de crédit et PayPal.</p>
<h3>Livraison fiable</h3>
<p>Nous expédions vos commandes avec soin et vous fournissons un numéro de suivi pour chaque envoi.</p>
<h3>Garantie satisfaction</h3>
<p>Votre satisfaction est notre priorité. Si un produit ne vous convient pas, contactez-nous pour trouver une solution.</p>
<h3>Service client réactif</h3>
<p>Notre équipe est disponible pour répondre à toutes vos questions. N'hésitez pas à nous contacter.</p>`;
}

function buildAboutPageHtml(shopName: string): string {
  return `<h2>À propos de ${shopName}</h2>
<p>Bienvenue chez ${shopName} ! Nous sommes passionnés par la qualité et le service client.</p>
<p>Notre mission est de vous proposer des produits soigneusement sélectionnés, au meilleur rapport qualité-prix.</p>
<h3>Nos valeurs</h3>
<ul>
<li><strong>Qualité</strong> — Chaque produit est rigoureusement sélectionné</li>
<li><strong>Confiance</strong> — Transparence totale sur nos prix et nos délais</li>
<li><strong>Service</strong> — Une équipe à votre écoute avant et après l'achat</li>
</ul>
<p>Merci de votre confiance !</p>`;
}

function buildFaqPageHtml(shopName: string): string {
  return `<h2>Questions fréquentes</h2>
<h3>Quels sont les délais de livraison ?</h3>
<p>Les commandes sont généralement expédiées sous 1 à 3 jours ouvrés. Le délai de livraison dépend de votre localisation.</p>
<h3>Comment puis-je suivre ma commande ?</h3>
<p>Un email de confirmation avec un numéro de suivi vous est envoyé dès l'expédition de votre commande.</p>
<h3>Quelle est votre politique de retour ?</h3>
<p>Vous disposez de 14 jours après réception pour retourner un article. Contactez notre service client pour initier un retour.</p>
<h3>Comment contacter le service client ?</h3>
<p>Vous pouvez nous contacter par email ou via le formulaire de contact disponible sur notre site. Nous répondons sous 24h.</p>
<h3>Les paiements sont-ils sécurisés ?</h3>
<p>Oui, toutes les transactions sont protégées par un cryptage SSL. Vos données bancaires ne sont jamais stockées sur nos serveurs.</p>`;
}

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

const OPP_ACTIONS: Record<string, { selfUrl: string; selfLabel: string; aiType: string | null; aiLabel: string }> = {
  MISSING_REVIEWS: { selfUrl: "https://apps.shopify.com/search?q=reviews", selfLabel: "Trouver une app d'avis", aiType: null, aiLabel: "Installez une app d'avis (Judge.me, Loox) depuis l'App Store" },
  WEAK_DESCRIPTIONS: { selfUrl: "/admin/products", selfLabel: "Modifier mes produits", aiType: "AI_DESCRIPTIONS", aiLabel: "Générer les descriptions par IA" },
  MISSING_BUNDLES: { selfUrl: "/admin/products", selfLabel: "Gérer mes produits", aiType: null, aiLabel: "Les bundles doivent être créés manuellement" },
  MISSING_UPSELLS: { selfUrl: "/admin/collections", selfLabel: "Gérer mes collections", aiType: null, aiLabel: "L'upsell doit être configuré manuellement" },
  SEO_IMPROVEMENT: { selfUrl: "/app/seo", selfLabel: "Ouvrir SEO Optimizer", aiType: "AI_SEO_FIX", aiLabel: "Corriger le SEO par IA" },
  SPEED_OPTIMIZATION: { selfUrl: "/admin/themes", selfLabel: "Optimiser mon thème", aiType: null, aiLabel: "La vitesse dépend du thème et hébergement" },
  PRICING_OPTIMIZATION: { selfUrl: "/admin/products", selfLabel: "Modifier les prix", aiType: "AI_COMPARE_PRICES", aiLabel: "Ajouter les prix barrés par IA" },
  MISSING_TRUST_BADGES: { selfUrl: "/admin/themes", selfLabel: "Personnaliser mon thème", aiType: "AI_TRUST_PAGE", aiLabel: "Créer une page Trust par IA" },
  UX_IMPROVEMENT: { selfUrl: "/admin/pages", selfLabel: "Gérer mes pages", aiType: "AI_CREATE_PAGES", aiLabel: "Créer les pages manquantes par IA" },
};

export default function ReportPage() {
  const { analysis, totalRevenueImpact, appUrl, hasAutomation, shopDomain } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const aiFetcher = useFetcher<any>();
  const [toastActive, setToastActive] = useState(false);
  const [activeAiOpp, setActiveAiOpp] = useState<string | null>(null);

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

            {analysis.opportunities.map((opp: any) => {
              const actions = OPP_ACTIONS[opp.type] || { selfUrl: "/admin", selfLabel: "Shopify Admin", aiType: null, aiLabel: "Non automatisable" };
              const isThisLoading = aiFetcher.state !== "idle" && activeAiOpp === opp.type;
              const isExternal = actions.selfUrl.startsWith("http");
              const isAdminUrl = actions.selfUrl.startsWith("/admin");
              const selfHref = isAdminUrl ? `https://${shopDomain}${actions.selfUrl}` : actions.selfUrl;

              const aiResult = aiFetcher.state === "idle" && aiFetcher.data && activeAiOpp === opp.type ? aiFetcher.data : null;

              return (
                <Box
                  key={opp.id}
                  padding="300"
                  borderWidth="025"
                  borderColor="border"
                  borderRadius="200"
                >
                  <BlockStack gap="300">
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

                    {aiResult?.success && (
                      <Banner tone="success" title="Action effectuée">
                        <Text as="p">{aiResult.message}</Text>
                        {aiResult.redirect && (
                          <Button url={aiResult.redirect} variant="plain">Ouvrir</Button>
                        )}
                      </Banner>
                    )}
                    {aiResult?.error && (
                      <Banner tone={aiResult.needsUpgrade ? "warning" : "critical"} title={aiResult.needsUpgrade ? "Plan requis" : "Erreur"}>
                        <Text as="p">{aiResult.error}</Text>
                        {aiResult.needsUpgrade && (
                          <Button url="/app/billing" variant="plain">Passer au plan Automation+</Button>
                        )}
                      </Banner>
                    )}

                    <Divider />
                    <InlineStack gap="200" align="start">
                      <Button
                        url={selfHref}
                        external={isExternal || isAdminUrl}
                        variant="secondary"
                        size="slim"
                      >
                        {actions.selfLabel}
                      </Button>

                      {actions.aiType ? (
                        hasAutomation ? (
                          <Button
                            variant="primary"
                            size="slim"
                            loading={isThisLoading}
                            onClick={() => {
                              setActiveAiOpp(opp.type);
                              if (actions.aiType === "AI_SEO_FIX") {
                                navigate("/app/seo");
                                return;
                              }
                              aiFetcher.submit(
                                { intent: "ai_fix_opportunity", aiActionType: actions.aiType! },
                                { method: "post" }
                              );
                            }}
                          >
                            {actions.aiLabel}
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            size="slim"
                            tone="critical"
                            url="/app/billing"
                          >
                            {actions.aiLabel} (Automation+ requis)
                          </Button>
                        )
                      ) : (
                        <Button disabled size="slim" variant="tertiary">
                          {actions.aiLabel}
                        </Button>
                      )}
                    </InlineStack>
                  </BlockStack>
                </Box>
              );
            })}
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
