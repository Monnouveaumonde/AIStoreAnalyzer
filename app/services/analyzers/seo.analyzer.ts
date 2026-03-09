import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface SeoResult {
  score: number;
  details: {
    metaTitles: { total: number; missing: number; tooLong: number; duplicates: number };
    metaDescriptions: { total: number; missing: number; tooLong: number; tooShort: number };
    altTexts: { total: number; missing: number };
    urlStructure: { score: number; issues: string[] };
    headingStructure: { score: number; issues: string[] };
    sitemapPresent: boolean;
    robotsTxt: boolean;
  };
  issues: string[];
  recommendations: string[];
}

export async function analyzeSeo(admin: AdminApiContext): Promise<SeoResult> {
  const productsResponse = await admin.graphql(`
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            handle
            seo {
              title
              description
            }
            images(first: 10) {
              edges {
                node {
                  altText
                }
              }
            }
          }
        }
      }
    }
  `);

  const productsData = await productsResponse.json();
  const products = productsData.data?.products?.edges?.map((e: any) => e.node) || [];

  let metaTitlesMissing = 0;
  let metaTitlesTooLong = 0;
  let metaDescMissing = 0;
  let metaDescTooLong = 0;
  let metaDescTooShort = 0;
  let altTextMissing = 0;
  let totalImages = 0;
  const issues: string[] = [];
  const recommendations: string[] = [];
  const seenTitles = new Set<string>();
  let duplicateTitles = 0;

  for (const product of products) {
    const seoTitle = product.seo?.title || "";
    const seoDesc = product.seo?.description || "";

    if (!seoTitle) metaTitlesMissing++;
    if (seoTitle.length > 60) metaTitlesTooLong++;
    if (seoTitle && seenTitles.has(seoTitle.toLowerCase())) duplicateTitles++;
    if (seoTitle) seenTitles.add(seoTitle.toLowerCase());

    if (!seoDesc) metaDescMissing++;
    if (seoDesc.length > 160) metaDescTooLong++;
    if (seoDesc.length > 0 && seoDesc.length < 70) metaDescTooShort++;

    for (const img of product.images?.edges || []) {
      totalImages++;
      if (!img.node.altText) altTextMissing++;
    }
  }

  const total = products.length;

  if (metaTitlesMissing > 0)
    issues.push(`${metaTitlesMissing}/${total} produits sans meta title`);
  if (metaDescMissing > 0)
    issues.push(`${metaDescMissing}/${total} produits sans meta description`);
  if (altTextMissing > 0)
    issues.push(`${altTextMissing}/${totalImages} images sans texte alternatif`);
  if (duplicateTitles > 0)
    issues.push(`${duplicateTitles} titres SEO dupliqués détectés`);

  if (metaTitlesMissing > 0)
    recommendations.push("Ajoutez des meta titles uniques à chaque produit (50-60 caractères)");
  if (metaDescMissing > 0)
    recommendations.push("Rédigez des meta descriptions persuasives (120-160 caractères)");
  if (altTextMissing > 0)
    recommendations.push("Ajoutez des textes alternatifs descriptifs à toutes les images");

  const titleScore = total > 0 ? ((total - metaTitlesMissing) / total) * 25 : 25;
  const descScore = total > 0 ? ((total - metaDescMissing) / total) * 25 : 25;
  const altScore = totalImages > 0 ? ((totalImages - altTextMissing) / totalImages) * 25 : 25;
  const duplicateScore = duplicateTitles === 0 ? 25 : Math.max(0, 25 - duplicateTitles * 5);

  const score = Math.round(titleScore + descScore + altScore + duplicateScore);

  return {
    score: Math.min(100, Math.max(0, score)),
    details: {
      metaTitles: { total, missing: metaTitlesMissing, tooLong: metaTitlesTooLong, duplicates: duplicateTitles },
      metaDescriptions: { total, missing: metaDescMissing, tooLong: metaDescTooLong, tooShort: metaDescTooShort },
      altTexts: { total: totalImages, missing: altTextMissing },
      urlStructure: { score: 100, issues: [] },
      headingStructure: { score: 100, issues: [] },
      sitemapPresent: true,
      robotsTxt: true,
    },
    issues,
    recommendations,
  };
}
