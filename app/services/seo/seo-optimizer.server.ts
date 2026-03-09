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
 * Mutation GraphQL pour mettre à jour le SEO d'un produit, page ou collection.
 */
async function applySeoMutation(
  admin: AdminApiContext,
  resourceType: string,
  resourceId: string,
  seo: { metaTitle?: string; metaDescription?: string }
): Promise<boolean> {
  // Détermine la bonne mutation selon le type de ressource
  let mutation: string;
  let variables: Record<string, unknown>;

  if (resourceType === "product") {
    mutation = `
      mutation UpdateProductSeo($id: ID!, $input: ProductInput!) {
        productUpdate(input: { id: $id, seo: $input }) {
          product { id seo { title description } }
          userErrors { field message }
        }
      }
    `;
    variables = {
      id: resourceId,
      input: {
        title: seo.metaTitle,
        description: seo.metaDescription,
      },
    };
  } else if (resourceType === "page") {
    mutation = `
      mutation UpdatePageSeo($id: ID!, $seo: SEOInput!) {
        pageUpdate(id: $id, page: { seo: $seo }) {
          page { id seo { title description } }
          userErrors { field message }
        }
      }
    `;
    variables = {
      id: resourceId,
      seo: {
        title: seo.metaTitle,
        description: seo.metaDescription,
      },
    };
  } else if (resourceType === "collection") {
    mutation = `
      mutation UpdateCollectionSeo($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id seo { title description } }
          userErrors { field message }
        }
      }
    `;
    variables = {
      input: {
        id: resourceId,
        seo: {
          title: seo.metaTitle,
          description: seo.metaDescription,
        },
      },
    };
  } else {
    return false;
  }

  const response = await admin.graphql(mutation, { variables });
  const data = await response.json();

  // Vérifie les userErrors retournés par Shopify
  const mutationName = resourceType === "product"
    ? "productUpdate"
    : resourceType === "page"
    ? "pageUpdate"
    : "collectionUpdate";

  const result = data.data?.[mutationName];
  if (result?.userErrors?.length > 0) {
    console.error("SEO mutation errors:", result.userErrors);
    return false;
  }

  return !!result?.[resourceType];
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

  return {
    latestScan,
    totalOptimizations,
    plan: shop.plan,
  };
}
