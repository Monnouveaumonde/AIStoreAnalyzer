/**
 * seo-optimizer.server.ts
 *
 * Service d'application des optimisations SEO via la Shopify Admin GraphQL API.
 * Prend une issue résolue et applique la valeur suggérée directement sur la boutique.
 *
 * Chaque fonction retourne { success, error } pour un traitement propre.
 */

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "../../db.server";

export interface OptimizationResult {
  success: boolean;
  error?: string;
  resourceId: string;
  fieldName: string;
  newValue: string;
}

/**
 * Applique une optimisation SEO sur une ressource Shopify.
 * Supporte : metaTitle, metaDescription, altText (product image).
 */
export async function applyOptimization(
  admin: AdminApiContext,
  input: {
    seoScanId: string;
    shopId: string;
    issueId: string;
    issueType: string;
    resourceType: string;
    resourceId: string;         // Shopify GID ex: "gid://shopify/Product/123"
    resourceTitle: string;
    fieldName: string;
    oldValue: string | null;
    newValue: string;
  }
): Promise<OptimizationResult> {
  let success = false;
  let error: string | undefined;

  try {
    if (input.fieldName === "metaTitle" || input.fieldName === "metaDescription") {
      // Mise à jour SEO via mutation updateSeo
      success = await applySeoMutation(admin, input.resourceType, input.resourceId, {
        metaTitle: input.fieldName === "metaTitle" ? input.newValue : undefined,
        metaDescription: input.fieldName === "metaDescription" ? input.newValue : undefined,
      });
    } else if (input.fieldName === "altText") {
      success = await applyAltTextMutation(admin, input.resourceId, input.newValue);
    } else {
      error = `Type d'optimisation non supporté : ${input.fieldName}`;
    }
  } catch (err: any) {
    error = err.message ?? "Erreur inconnue";
    success = false;
  }

  // Log de l'optimisation en base
  await prisma.seoOptimization.create({
    data: {
      seoScanId: input.seoScanId,
      shopId: input.shopId,
      issueType: input.issueType as any,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      resourceTitle: input.resourceTitle,
      fieldName: input.fieldName,
      oldValue: input.oldValue,
      newValue: input.newValue,
      appliedByAi: true,
      shopifyMutationSuccess: success,
    },
  });

  // Marquer l'issue comme résolue si succès
  if (success) {
    await prisma.seoIssue.update({
      where: { id: input.issueId },
      data: { isFixed: true, fixedAt: new Date() },
    }).catch(() => {/* non-bloquant */});
  }

  return { success, error, resourceId: input.resourceId, fieldName: input.fieldName, newValue: input.newValue };
}

/**
 * Lit les valeurs SEO actuelles d'une ressource Shopify pour ne pas les écraser.
 */
async function fetchCurrentSeo(
  admin: AdminApiContext,
  resourceType: string,
  resourceId: string,
): Promise<{ title: string; description: string }> {
  const queryMap: Record<string, string> = {
    product: `query($id: ID!) { product(id: $id) { seo { title description } } }`,
    collection: `query($id: ID!) { collection(id: $id) { seo { title description } } }`,
    page: `query($id: ID!) { page(id: $id) { seo { title description } } }`,
  };
  const query = queryMap[resourceType];
  if (!query) return { title: "", description: "" };

  try {
    const resp = await admin.graphql(query, { variables: { id: resourceId } });
    const data = await resp.json();
    const seo = data.data?.[resourceType]?.seo;
    return { title: seo?.title ?? "", description: seo?.description ?? "" };
  } catch {
    return { title: "", description: "" };
  }
}

/**
 * Mutation GraphQL pour mettre à jour le SEO d'un produit, page ou collection.
 * Lit d'abord les valeurs actuelles pour ne jamais écraser un champ non modifié.
 */
async function applySeoMutation(
  admin: AdminApiContext,
  resourceType: string,
  resourceId: string,
  seo: { metaTitle?: string; metaDescription?: string }
): Promise<boolean> {
  // Lire les valeurs SEO actuelles pour préserver les champs non modifiés
  const current = await fetchCurrentSeo(admin, resourceType, resourceId);

  const seoInput: Record<string, string> = {
    title: seo.metaTitle ?? current.title,
    description: seo.metaDescription ?? current.description,
  };

  let mutation: string;
  let variables: Record<string, unknown>;

  if (resourceType === "product") {
    mutation = `
      mutation UpdateProductSeo($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id seo { title description } }
          userErrors { field message }
        }
      }
    `;
    variables = { input: { id: resourceId, seo: seoInput } };
  } else if (resourceType === "page") {
    mutation = `
      mutation UpdatePageSeo($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) {
          page { id seo { title description } }
          userErrors { field message }
        }
      }
    `;
    variables = { id: resourceId, page: { seo: seoInput } };
  } else if (resourceType === "collection") {
    mutation = `
      mutation UpdateCollectionSeo($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id seo { title description } }
          userErrors { field message }
        }
      }
    `;
    variables = { input: { id: resourceId, seo: seoInput } };
  } else {
    return false;
  }

  const response = await admin.graphql(mutation, { variables });
  const data = await response.json();

  const mutationName = resourceType === "product"
    ? "productUpdate"
    : resourceType === "page"
    ? "pageUpdate"
    : "collectionUpdate";

  const result = data.data?.[mutationName];
  if (result?.userErrors?.length > 0) {
    console.error(`[seo-optimizer] Mutation errors pour ${resourceId}:`, result.userErrors);
    return false;
  }

  const resource = result?.[resourceType];
  const success = !!resource;
  
  return success;
}

/**
 * Mutation pour mettre à jour l'alt text d'une image produit.
 * resourceId ici = GID de l'image (gid://shopify/ProductImage/...)
 */
async function applyAltTextMutation(
  admin: AdminApiContext,
  imageGid: string,
  altText: string
): Promise<boolean> {
  // Extrait le productId depuis le contexte (on a besoin du product GID)
  // L'imageGid est de type "gid://shopify/ProductImage/IMAGE_ID"
  // On doit utiliser productImageUpdate avec le product ID
  // Dans ce contexte on stocke l'URL de l'image, pas le GID — on skip si c'est une URL
  if (!imageGid.includes("gid://")) {
    return false; // URL non-GID, non applicable directement
  }

  // Note : productImageUpdate nécessite l'ID du produit parent
  // Dans notre implémentation, on passe le GID produit via resourceId
  const response = await admin.graphql(`
    mutation UpdateImageAlt($imageId: ID!, $altText: String!) {
      fileUpdate(files: [{ id: $imageId, alt: $altText }]) {
        files { ... on MediaImage { id alt } }
        userErrors { field message }
      }
    }
  `, {
    variables: { imageId: imageGid, altText },
  });

  const data = await response.json();
  const result = data.data?.fileUpdate;

  if (result?.userErrors?.length > 0) {
    console.error("Alt text mutation errors:", result.userErrors);
    return false;
  }

  return (result?.files?.length ?? 0) > 0;
}

/**
 * Applique title + description en une seule mutation pour éviter l'écrasement.
 * Utilise la valeur existante de Shopify pour le champ non modifié.
 */
export async function applyMergedSeoOptimization(
  admin: AdminApiContext,
  input: {
    seoScanId: string;
    shopId: string;
    resourceType: string;
    resourceId: string;
    resourceTitle: string;
    titleIssue?: { issueId: string; issueType: string; oldValue: string | null; newValue: string };
    descIssue?: { issueId: string; issueType: string; oldValue: string | null; newValue: string };
  }
): Promise<{ success: boolean; error?: string }> {
  const seoFields: Record<string, string> = {};
  if (input.titleIssue) seoFields.title = input.titleIssue.newValue;
  if (input.descIssue) seoFields.description = input.descIssue.newValue;

  if (Object.keys(seoFields).length === 0) return { success: false, error: "Aucun champ" };

  const success = await applySeoMutation(admin, input.resourceType, input.resourceId, {
    metaTitle: seoFields.title,
    metaDescription: seoFields.description,
  });

  const issues = [input.titleIssue, input.descIssue].filter(Boolean) as { issueId: string; issueType: string; oldValue: string | null; newValue: string }[];
  for (const issue of issues) {
    await prisma.seoOptimization.create({
      data: {
        seoScanId: input.seoScanId,
        shopId: input.shopId,
        issueType: issue.issueType as any,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        resourceTitle: input.resourceTitle,
        fieldName: issue.issueType.includes("TITLE") ? "metaTitle" : "metaDescription",
        oldValue: issue.oldValue,
        newValue: issue.newValue,
        appliedByAi: true,
        shopifyMutationSuccess: success,
      },
    });
    if (success) {
      await prisma.seoIssue.update({
        where: { id: issue.issueId },
        data: { isFixed: true, fixedAt: new Date() },
      }).catch(() => {});
    }
  }

  return { success, error: success ? undefined : "Mutation échouée" };
}

/**
 * Retourne le résumé SEO pour le dashboard d'une boutique.
 */
export async function getSeoScanDashboard(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return null;

  const [latestScan, totalOptimizations] = await Promise.all([
    prisma.seoScan.findFirst({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      include: {
        seoIssues: {
          where: { isFixed: false },
          orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
          take: 20,
        },
      },
    }),
    prisma.seoOptimization.count({
      where: { shopId: shop.id, shopifyMutationSuccess: true },
    }),
  ]);

  let issueCounts = { metaTitles: 0, metaDescriptions: 0, headings: 0, altText: 0, duplicates: 0 };
  if (latestScan) {
    const unfixedIssues = await prisma.seoIssue.findMany({
      where: { seoScanId: latestScan.id, isFixed: false },
      select: { issueType: true },
    });
    issueCounts = {
      metaTitles: unfixedIssues.filter((i) => i.issueType.includes("META_TITLE")).length,
      metaDescriptions: unfixedIssues.filter((i) => i.issueType.includes("META_DESCRIPTION")).length,
      headings: unfixedIssues.filter((i) => i.issueType.includes("H1") || i.issueType.includes("H2")).length,
      altText: unfixedIssues.filter((i) => i.issueType === "MISSING_ALT_TEXT").length,
      duplicates: unfixedIssues.filter((i) => i.issueType.includes("DUPLICATE")).length,
    };
  }

  return {
    latestScan,
    totalOptimizations,
    plan: shop.plan,
    issueCounts,
  };
}
