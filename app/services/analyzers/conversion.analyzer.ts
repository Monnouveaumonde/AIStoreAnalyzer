import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface ConversionResult {
  score: number;
  details: {
    hasCart: boolean;
    hasCheckoutCustomization: boolean;
    hasDiscountCodes: boolean;
    activeDiscounts: number;
    hasCollections: boolean;
    collectionCount: number;
    hasFeaturedProducts: boolean;
    productOrganization: number;
  };
  issues: string[];
  recommendations: string[];
}

export async function analyzeConversion(admin: AdminApiContext): Promise<ConversionResult> {
  const [discountsRes, collectionsRes] = await Promise.all([
    admin.graphql(`
      query {
        codeDiscountNodes(first: 20) {
          edges {
            node {
              id
              codeDiscount {
                ... on DiscountCodeBasic {
                  title
                  status
                  startsAt
                  endsAt
                }
              }
            }
          }
        }
      }
    `),
    admin.graphql(`
      query {
        collections(first: 50) {
          edges {
            node {
              id
              title
              productsCount {
                count
              }
            }
          }
        }
      }
    `),
  ]);

  const discountsData = await discountsRes.json();
  const collectionsData = await collectionsRes.json();

  const discounts = discountsData.data?.codeDiscountNodes?.edges || [];
  const collections = collectionsData.data?.collections?.edges || [];

  const activeDiscounts = discounts.filter(
    (d: any) => d.node.codeDiscount?.status === "ACTIVE"
  ).length;

  const hasDiscounts = discounts.length > 0;
  const collectionCount = collections.length;
  const hasCollections = collectionCount > 0;

  const emptyCollections = collections.filter(
    (c: any) => (c.node.productsCount?.count || 0) === 0
  ).length;

  const issues: string[] = [];
  const recommendations: string[] = [];

  if (!hasDiscounts) issues.push("Aucun code de réduction configuré");
  if (activeDiscounts === 0 && hasDiscounts) issues.push("Aucun code de réduction actif");
  if (collectionCount < 3) issues.push(`Seulement ${collectionCount} collections — organisation insuffisante`);
  if (emptyCollections > 0) issues.push(`${emptyCollections} collections vides détectées`);

  if (!hasDiscounts) recommendations.push("Créez des codes promo pour inciter le premier achat (ex: WELCOME10)");
  if (collectionCount < 5) recommendations.push("Organisez vos produits en 5+ collections pour faciliter la navigation");
  if (activeDiscounts === 0) recommendations.push("Activez au moins un code de réduction pour les nouveaux clients");
  recommendations.push("Ajoutez un bandeau d'urgence (stock limité, livraison gratuite avec seuil)");

  const discountScore = hasDiscounts ? 20 : 0;
  const activeDiscountScore = activeDiscounts > 0 ? 15 : 0;
  const collectionScore = Math.min(25, (collectionCount / 5) * 25);
  const organizationScore = emptyCollections === 0 ? 20 : Math.max(0, 20 - emptyCollections * 5);
  const baseScore = 20;

  const score = Math.round(discountScore + activeDiscountScore + collectionScore + organizationScore + baseScore);

  return {
    score: Math.min(100, Math.max(0, score)),
    details: {
      hasCart: true,
      hasCheckoutCustomization: false,
      hasDiscountCodes: hasDiscounts,
      activeDiscounts,
      hasCollections,
      collectionCount,
      hasFeaturedProducts: collectionCount > 0,
      productOrganization: Math.round(organizationScore),
    },
    issues,
    recommendations,
  };
}
