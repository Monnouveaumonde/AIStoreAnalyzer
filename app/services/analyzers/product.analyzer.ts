import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface ProductResult {
  score: number;
  details: {
    totalProducts: number;
    withDescriptions: number;
    avgDescriptionLength: number;
    withImages: number;
    avgImagesPerProduct: number;
    withVariants: number;
    withPricing: number;
    withCompareAtPrice: number;
  };
  issues: string[];
  recommendations: string[];
}

export async function analyzeProducts(admin: AdminApiContext): Promise<ProductResult> {
  const response = await admin.graphql(`
    query {
      products(first: 50, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            title
            descriptionHtml
            totalInventory
            priceRangeV2 {
              minVariantPrice { amount }
              maxVariantPrice { amount }
            }
            compareAtPriceRange {
              minVariantCompareAtPrice { amount }
              maxVariantCompareAtPrice { amount }
            }
            images(first: 10) {
              edges { node { id } }
            }
            variants(first: 10) {
              edges { node { id price compareAtPrice } }
            }
            tags
          }
        }
      }
    }
  `);

  const data = await response.json();
  const products = data.data?.products?.edges?.map((e: any) => e.node) || [];

  const total = products.length;
  let withDesc = 0;
  let totalDescLength = 0;
  let withImages = 0;
  let totalImages = 0;
  let withVariants = 0;
  let withCompareAt = 0;
  const issues: string[] = [];
  const recommendations: string[] = [];

  for (const product of products) {
    const descLength = (product.descriptionHtml || "").replace(/<[^>]*>/g, "").length;

    if (descLength > 50) {
      withDesc++;
      totalDescLength += descLength;
    }

    const imageCount = product.images?.edges?.length || 0;
    if (imageCount > 0) {
      withImages++;
      totalImages += imageCount;
    }

    const variantCount = product.variants?.edges?.length || 0;
    if (variantCount > 1) withVariants++;

    const hasCompareAt = product.variants?.edges?.some(
      (v: any) => v.node.compareAtPrice && parseFloat(v.node.compareAtPrice) > 0
    );
    if (hasCompareAt) withCompareAt++;
  }

  const avgDescLength = withDesc > 0 ? Math.round(totalDescLength / withDesc) : 0;
  const avgImages = total > 0 ? Math.round(totalImages / total) : 0;

  const noDescCount = total - withDesc;
  const noImageCount = total - withImages;

  if (noDescCount > 0) issues.push(`${noDescCount}/${total} produits avec une description insuffisante (<50 car.)`);
  if (avgDescLength < 200) issues.push(`Descriptions trop courtes en moyenne (${avgDescLength} car., recommandé: 300+)`);
  if (noImageCount > 0) issues.push(`${noImageCount}/${total} produits sans image`);
  if (avgImages < 3) issues.push(`Moyenne de ${avgImages} images/produit (recommandé: 4+)`);
  if (withCompareAt < total * 0.3) issues.push("Peu de produits utilisent le prix barré (compare-at price)");

  if (noDescCount > 0) recommendations.push("Rédigez des descriptions détaillées (300+ mots) avec bénéfices et cas d'usage");
  if (avgImages < 4) recommendations.push("Ajoutez 4-6 images de haute qualité par produit (angles, lifestyle, détails)");
  if (withCompareAt < total * 0.3) recommendations.push("Utilisez le prix barré pour créer un ancrage psychologique");

  const descScore = total > 0 ? (withDesc / total) * 30 : 30;
  const lengthScore = Math.min(20, (avgDescLength / 300) * 20);
  const imageScore = total > 0 ? (withImages / total) * 25 : 25;
  const imageCountScore = Math.min(15, (avgImages / 4) * 15);
  const priceScore = total > 0 ? (withCompareAt / total) * 10 : 10;

  const score = Math.round(descScore + lengthScore + imageScore + imageCountScore + priceScore);

  return {
    score: Math.min(100, Math.max(0, score)),
    details: {
      totalProducts: total,
      withDescriptions: withDesc,
      avgDescriptionLength: avgDescLength,
      withImages,
      avgImagesPerProduct: avgImages,
      withVariants,
      withPricing: total,
      withCompareAtPrice: withCompareAt,
    },
    issues,
    recommendations,
  };
}
