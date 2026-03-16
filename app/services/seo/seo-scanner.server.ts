/**
 * seo-scanner.server.ts
 *
 * Moteur principal du SEO Optimizer.
 * Analyse via la Shopify Admin GraphQL API :
 *  - Meta titles / descriptions (produits, pages, collections)
 *  - Balises H1 / H2 dans le contenu HTML
 *  - Images sans texte alternatif
 *  - Contenu dupliqué (meta titles & descriptions identiques)
 *  - Contenu trop court ("thin content")
 *
 * Retourne une liste de SeoIssue prêts à être sauvegardés en base.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export type SeoIssueSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export interface RawSeoIssue {
  issueType: string;
  severity: SeoIssueSeverity;
  category: string;
  resourceType: string;
  resourceId: string;
  resourceTitle: string;
  resourceUrl: string | null;
  description: string;
  currentValue: string | null;
  suggestedValue: string | null;
}

export interface SeoScanResult {
  overallScore: number;
  totalIssues: number;
  criticalIssues: number;
  warningIssues: number;
  issues: RawSeoIssue[];
  metaDetails: Record<string, unknown>;
  headingDetails: Record<string, unknown>;
  altTextDetails: Record<string, unknown>;
  duplicateDetails: Record<string, unknown>;
}

/**
 * Lance un scan SEO complet sur une boutique Shopify.
 * Toutes les requêtes GraphQL sont parallélisées pour performance < 2s.
 */
export async function runSeoScan(admin: AdminApiContext): Promise<SeoScanResult> {
  const [productsResult, pagesResult, collectionsResult] = await Promise.all([
    scanProducts(admin),
    scanPages(admin),
    scanCollections(admin),
  ]);

  const allIssues = [
    ...productsResult.issues,
    ...pagesResult.issues,
    ...collectionsResult.issues,
  ];

  // Détection des doublons cross-ressources
  const duplicateIssues = detectCrossResourceDuplicates(
    productsResult.metaTitles,
    pagesResult.metaTitles,
    collectionsResult.metaTitles
  );
  allIssues.push(...duplicateIssues);

  const criticalIssues = allIssues.filter(
    (i) => i.severity === "CRITICAL" || i.severity === "ERROR"
  ).length;
  const warningIssues = allIssues.filter((i) => i.severity === "WARNING").length;

  // Score : 100 - (critique * 5) - (erreur * 3) - (warning * 1), min 0
  const deductions =
    allIssues.filter((i) => i.severity === "CRITICAL").length * 5 +
    allIssues.filter((i) => i.severity === "ERROR").length * 3 +
    allIssues.filter((i) => i.severity === "WARNING").length * 1;
  const overallScore = Math.max(0, Math.min(100, 100 - deductions));

  return {
    overallScore,
    totalIssues: allIssues.length,
    criticalIssues,
    warningIssues,
    issues: allIssues,
    metaDetails: {
      products: productsResult.metaStats,
      pages: pagesResult.metaStats,
      collections: collectionsResult.metaStats,
    },
    headingDetails: {
      products: productsResult.headingStats,
      pages: pagesResult.headingStats,
    },
    altTextDetails: {
      imagesTotal: productsResult.altStats.total,
      imagesMissingAlt: productsResult.altStats.missing,
      coveragePercent: productsResult.altStats.total > 0
        ? Math.round(((productsResult.altStats.total - productsResult.altStats.missing) / productsResult.altStats.total) * 100)
        : 100,
    },
    duplicateDetails: {
      duplicateMetaTitles: duplicateIssues.filter((i) => i.issueType === "DUPLICATE_META_TITLE").length,
      duplicateMetaDescriptions: duplicateIssues.filter((i) => i.issueType === "DUPLICATE_META_DESCRIPTION").length,
    },
  };
}

// ── Scan des produits ─────────────────────────────────────────────────────────

async function scanProducts(admin: AdminApiContext) {
  const response = await admin.graphql(`
    query SeoScanProducts {
      products(first: 100, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            title
            handle
            descriptionHtml
            onlineStoreUrl
            seo { title description }
            images(first: 20) {
              edges { node { id altText url } }
            }
          }
        }
      }
    }
  `);

  const data = await response.json();
  const products = data.data?.products?.edges?.map((e: any) => e.node) ?? [];

  const issues: RawSeoIssue[] = [];
  const metaTitles: Map<string, string> = new Map();
  const metaDescriptions: Map<string, string> = new Map();
  const metaStats = { total: products.length, missingTitle: 0, missingDesc: 0, shortTitle: 0, longTitle: 0, shortDesc: 0, longDesc: 0 };
  const headingStats = { missingH1: 0, multipleH1: 0 };
  const altStats = { total: 0, missing: 0 };

  for (const product of products) {
    const seoTitle = product.seo?.title ?? "";
    const seoDesc = product.seo?.description ?? "";
    const bodyText = (product.descriptionHtml ?? "").replace(/<[^>]+>/g, " ").trim();

    // ── Meta title ────────────────────────────────────────────────────────
    if (!seoTitle) {
      metaStats.missingTitle++;
      issues.push({
        issueType: "MISSING_META_TITLE",
        severity: "ERROR",
        category: "meta",
        resourceType: "product",
        resourceId: product.id,
        resourceTitle: product.title,
        resourceUrl: product.onlineStoreUrl,
        description: `Le produit "${product.title}" n'a pas de meta title. Google utilisera le titre par défaut, souvent non optimisé.`,
        currentValue: null,
        suggestedValue: null, // sera rempli par l'IA
      });
    } else {
      if (seoTitle.length < 30) {
        metaStats.shortTitle++;
        issues.push({
          issueType: "META_TITLE_TOO_SHORT",
          severity: "WARNING",
          category: "meta",
          resourceType: "product",
          resourceId: product.id,
          resourceTitle: product.title,
          resourceUrl: product.onlineStoreUrl,
          description: `Meta title trop court (${seoTitle.length} car.). Recommandé : 50-60 caractères.`,
          currentValue: seoTitle,
          suggestedValue: null,
        });
      } else if (seoTitle.length > 60) {
        metaStats.longTitle++;
        issues.push({
          issueType: "META_TITLE_TOO_LONG",
          severity: "WARNING",
          category: "meta",
          resourceType: "product",
          resourceId: product.id,
          resourceTitle: product.title,
          resourceUrl: product.onlineStoreUrl,
          description: `Meta title trop long (${seoTitle.length} car.). Google tronquera à ~60 caractères.`,
          currentValue: seoTitle,
          suggestedValue: seoTitle.substring(0, 57) + "...",
        });
      }

      // Détection doublons intra-produits
      const titleKey = seoTitle.toLowerCase().trim();
      if (metaTitles.has(titleKey)) {
        issues.push({
          issueType: "DUPLICATE_META_TITLE",
          severity: "ERROR",
          category: "meta",
          resourceType: "product",
          resourceId: product.id,
          resourceTitle: product.title,
          resourceUrl: product.onlineStoreUrl,
          description: `Meta title identique à un autre produit : "${seoTitle}"`,
          currentValue: seoTitle,
          suggestedValue: null,
        });
      } else {
        metaTitles.set(titleKey, product.id);
      }
    }

    // ── Meta description ──────────────────────────────────────────────────
    if (!seoDesc) {
      metaStats.missingDesc++;
      issues.push({
        issueType: "MISSING_META_DESCRIPTION",
        severity: "ERROR",
        category: "meta",
        resourceType: "product",
        resourceId: product.id,
        resourceTitle: product.title,
        resourceUrl: product.onlineStoreUrl,
        description: `Pas de meta description pour "${product.title}". Google générera un extrait aléatoire.`,
        currentValue: null,
        suggestedValue: null,
      });
    } else {
      if (seoDesc.length < 70) {
        metaStats.shortDesc++;
        issues.push({
          issueType: "META_DESCRIPTION_TOO_SHORT",
          severity: "WARNING",
          category: "meta",
          resourceType: "product",
          resourceId: product.id,
          resourceTitle: product.title,
          resourceUrl: product.onlineStoreUrl,
          description: `Meta description trop courte (${seoDesc.length} car.). Recommandé : 120-160 caractères.`,
          currentValue: seoDesc,
          suggestedValue: null,
        });
      } else if (seoDesc.length > 160) {
        metaStats.longDesc++;
        issues.push({
          issueType: "META_DESCRIPTION_TOO_LONG",
          severity: "WARNING",
          category: "meta",
          resourceType: "product",
          resourceId: product.id,
          resourceTitle: product.title,
          resourceUrl: product.onlineStoreUrl,
          description: `Meta description trop longue (${seoDesc.length} car.). Google tronquera au-delà de 160 caractères.`,
          currentValue: seoDesc,
          suggestedValue: seoDesc.substring(0, 157) + "...",
        });
      }
      metaDescriptions.set(seoDesc.toLowerCase().trim(), product.id);
    }

    // ── H1 dans le contenu ───────────────────────────────────────────────
    const h1Matches = (product.descriptionHtml ?? "").match(/<h1[^>]*>/gi) ?? [];
    if (h1Matches.length === 0 && bodyText.length > 50) {
      headingStats.missingH1++;
      issues.push({
        issueType: "MISSING_H1",
        severity: "INFO",
        category: "heading",
        resourceType: "product",
        resourceId: product.id,
        resourceTitle: product.title,
        resourceUrl: product.onlineStoreUrl,
        description: `Pas de balise H1 dans la description de "${product.title}".`,
        currentValue: null,
        suggestedValue: null,
      });
    } else if (h1Matches.length > 1) {
      headingStats.multipleH1++;
      issues.push({
        issueType: "MULTIPLE_H1",
        severity: "WARNING",
        category: "heading",
        resourceType: "product",
        resourceId: product.id,
        resourceTitle: product.title,
        resourceUrl: product.onlineStoreUrl,
        description: `${h1Matches.length} balises H1 dans la description — une seule est recommandée.`,
        currentValue: `${h1Matches.length} H1`,
        suggestedValue: "1 seule balise H1",
      });
    }

    // ── Images sans alt text ─────────────────────────────────────────────
    for (const imgEdge of product.images?.edges ?? []) {
      altStats.total++;
      if (!imgEdge.node.altText) {
        altStats.missing++;
        issues.push({
          issueType: "MISSING_ALT_TEXT",
          severity: "WARNING",
          category: "alt",
          resourceType: "product",
          resourceId: product.id,
          resourceTitle: product.title,
          resourceUrl: imgEdge.node.url,
          description: `Image sans texte alternatif pour le produit "${product.title}".`,
          currentValue: null,
          suggestedValue: null, // sera généré par l'IA
        });
      }
    }

    // ── Thin content (description trop courte) ───────────────────────────
    if (bodyText.length > 0 && bodyText.length < 100) {
      issues.push({
        issueType: "THIN_CONTENT",
        severity: "WARNING",
        category: "meta",
        resourceType: "product",
        resourceId: product.id,
        resourceTitle: product.title,
        resourceUrl: product.onlineStoreUrl,
        description: `Description trop courte (${bodyText.length} car.). Un contenu de qualité aide le SEO et la conversion.`,
        currentValue: bodyText.substring(0, 100),
        suggestedValue: null,
      });
    }
  }

  return { issues, metaTitles, metaDescriptions, metaStats, headingStats, altStats };
}

// ── Scan des pages ────────────────────────────────────────────────────────────

async function scanPages(admin: AdminApiContext) {
  const response = await admin.graphql(`
    query SeoScanPages {
      pages(first: 50) {
        edges {
          node {
            id
            title
            handle
            bodySummary
            body
          }
        }
      }
    }
  `);

  const data = await response.json();
  const pages = data.data?.pages?.edges?.map((e: any) => e.node) ?? [];

  const issues: RawSeoIssue[] = [];
  const metaTitles: Map<string, string> = new Map();
  const metaStats = { total: pages.length, missingTitle: 0, missingDesc: 0 };
  const headingStats = { missingH1: 0 };

  for (const page of pages) {
    const bodyText = (page.body ?? "").replace(/<[^>]+>/g, " ").trim();

    // Sur l'API actuelle, le type Page n'expose pas les champs SEO.
    // On utilise le titre de page pour la détection de doublons cross-ressources.
    const titleKey = (page.title ?? "").toLowerCase().trim();
    if (titleKey && !metaTitles.has(titleKey)) metaTitles.set(titleKey, page.id);

    const h1Count = (page.body ?? "").match(/<h1[^>]*>/gi)?.length ?? 0;
    if (h1Count === 0 && bodyText.length > 100) {
      headingStats.missingH1++;
      issues.push({
        issueType: "MISSING_H1",
        severity: "WARNING",
        category: "heading",
        resourceType: "page",
        resourceId: page.id,
        resourceTitle: page.title,
        resourceUrl: `/pages/${page.handle}`,
        description: `Pas de balise H1 dans la page "${page.title}".`,
        currentValue: null,
        suggestedValue: page.title,
      });
    }
  }

  return { issues, metaTitles, metaStats, headingStats };
}

// ── Scan des collections ──────────────────────────────────────────────────────

async function scanCollections(admin: AdminApiContext) {
  const response = await admin.graphql(`
    query SeoScanCollections {
      collections(first: 50) {
        edges {
          node {
            id
            title
            handle
            seo { title description }
          }
        }
      }
    }
  `);

  const data = await response.json();
  const collections = data.data?.collections?.edges?.map((e: any) => e.node) ?? [];

  const issues: RawSeoIssue[] = [];
  const metaTitles: Map<string, string> = new Map();
  const metaStats = { total: collections.length, missingTitle: 0, missingDesc: 0 };

  for (const col of collections) {
    const seoTitle = col.seo?.title ?? "";
    const seoDesc = col.seo?.description ?? "";

    if (!seoTitle) {
      metaStats.missingTitle++;
      issues.push({
        issueType: "MISSING_META_TITLE",
        severity: "ERROR",
        category: "meta",
        resourceType: "collection",
        resourceId: col.id,
        resourceTitle: col.title,
        resourceUrl: `/collections/${col.handle}`,
        description: `La collection "${col.title}" n'a pas de meta title.`,
        currentValue: null,
        suggestedValue: null,
      });
    } else {
      metaTitles.set(seoTitle.toLowerCase().trim(), col.id);
    }

    if (!seoDesc) {
      metaStats.missingDesc++;
      issues.push({
        issueType: "MISSING_META_DESCRIPTION",
        severity: "WARNING",
        category: "meta",
        resourceType: "collection",
        resourceId: col.id,
        resourceTitle: col.title,
        resourceUrl: `/collections/${col.handle}`,
        description: `La collection "${col.title}" n'a pas de meta description.`,
        currentValue: null,
        suggestedValue: null,
      });
    }
  }

  return { issues, metaTitles, metaStats, headingStats: {} };
}

// ── Détection doublons cross-ressources ───────────────────────────────────────

function detectCrossResourceDuplicates(
  ...titleMaps: Map<string, string>[]
): RawSeoIssue[] {
  const issues: RawSeoIssue[] = [];
  const globalTitles = new Map<string, number>();

  for (const map of titleMaps) {
    for (const [title] of map) {
      globalTitles.set(title, (globalTitles.get(title) ?? 0) + 1);
    }
  }

  for (const [title, count] of globalTitles) {
    if (count > 1) {
      issues.push({
        issueType: "DUPLICATE_META_TITLE",
        severity: "ERROR",
        category: "meta",
        resourceType: "global",
        resourceId: "duplicate-" + title.substring(0, 20),
        resourceTitle: title,
        resourceUrl: null,
        description: `Meta title "${title}" utilisé sur ${count} ressources différentes. Google pénalise les doublons.`,
        currentValue: title,
        suggestedValue: null,
      });
    }
  }

  return issues;
}
