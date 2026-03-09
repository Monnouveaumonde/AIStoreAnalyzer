import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface PricingResult {
  score: number;
  details: {
    totalProducts: number;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    priceRange: number;
    productsWithCompareAt: number;
    avgDiscount: number;
    hasFreeShippingThreshold: boolean;
    priceDistribution: { range: string; count: number }[];
  };
  issues: string[];
  recommendations: string[];
}

export async function analyzePricing(admin: AdminApiContext): Promise<PricingResult> {
  const response = await admin.graphql(`
    query {
      products(first: 100) {
        edges {
          node {
            id
            title
            variants(first: 5) {
              edges {
                node {
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

  const data = await response.json();
  const products = data.data?.products?.edges?.map((e: any) => e.node) || [];

  const prices: number[] = [];
  let withCompareAt = 0;
  let totalDiscountPercent = 0;
  let discountCount = 0;

  for (const product of products) {
    for (const variant of product.variants?.edges || []) {
      const price = parseFloat(variant.node.price || "0");
      const compareAt = parseFloat(variant.node.compareAtPrice || "0");

      if (price > 0) prices.push(price);

      if (compareAt > 0 && compareAt > price) {
        withCompareAt++;
        const discount = ((compareAt - price) / compareAt) * 100;
        totalDiscountPercent += discount;
        discountCount++;
      }
    }
  }

  const total = products.length;
  const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const priceRange = maxPrice - minPrice;
  const avgDiscount = discountCount > 0 ? totalDiscountPercent / discountCount : 0;

  const ranges = [
    { range: "0-25$", min: 0, max: 25 },
    { range: "25-50$", min: 25, max: 50 },
    { range: "50-100$", min: 50, max: 100 },
    { range: "100-200$", min: 100, max: 200 },
    { range: "200$+", min: 200, max: Infinity },
  ];

  const priceDistribution = ranges.map(r => ({
    range: r.range,
    count: prices.filter(p => p >= r.min && p < r.max).length,
  }));

  const issues: string[] = [];
  const recommendations: string[] = [];

  if (withCompareAt < total * 0.2)
    issues.push("Moins de 20% des produits ont un prix barré — opportunité manquée");
  if (avgDiscount > 50)
    issues.push(`Réduction moyenne trop élevée (${avgDiscount.toFixed(0)}%) — peut dévaloriser la marque`);
  if (avgDiscount > 0 && avgDiscount < 10)
    issues.push(`Réductions trop faibles (${avgDiscount.toFixed(0)}%) — pas assez incitatives`);
  if (priceRange === 0 && total > 1)
    issues.push("Tous les produits ont le même prix — diversifiez votre offre");

  if (withCompareAt < total * 0.5)
    recommendations.push("Utilisez le prix barré sur 50%+ de vos produits pour l'ancrage prix");
  recommendations.push("Testez des prix psychologiques ($X.99, $X.97) pour optimiser la conversion");
  if (total > 5)
    recommendations.push("Créez des tiers de prix (entrée de gamme, milieu, premium) pour tous les budgets");

  const compareAtScore = Math.min(30, (withCompareAt / Math.max(1, total)) * 60);
  const diversityScore = priceRange > 0 ? 20 : 5;
  const distributionScore = priceDistribution.filter(d => d.count > 0).length * 5;
  const baseScore = 25;

  const score = Math.round(compareAtScore + diversityScore + distributionScore + baseScore);

  return {
    score: Math.min(100, Math.max(0, score)),
    details: {
      totalProducts: total,
      avgPrice: parseFloat(avgPrice.toFixed(2)),
      minPrice: parseFloat(minPrice.toFixed(2)),
      maxPrice: parseFloat(maxPrice.toFixed(2)),
      priceRange: parseFloat(priceRange.toFixed(2)),
      productsWithCompareAt: withCompareAt,
      avgDiscount: parseFloat(avgDiscount.toFixed(1)),
      hasFreeShippingThreshold: false,
      priceDistribution,
    },
    issues,
    recommendations,
  };
}
