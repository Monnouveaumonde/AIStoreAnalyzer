import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { analyzeSeo } from "./seo.analyzer";
import { analyzeSpeed } from "./speed.analyzer";
import { analyzeProducts } from "./product.analyzer";
import { analyzeConversion } from "./conversion.analyzer";
import { analyzeUx } from "./ux.analyzer";
import { analyzeTrust } from "./trust.analyzer";
import { analyzePricing } from "./pricing.analyzer";

export interface FullAnalysisResult {
  overallScore: number;
  seo: Awaited<ReturnType<typeof analyzeSeo>>;
  speed: Awaited<ReturnType<typeof analyzeSpeed>>;
  products: Awaited<ReturnType<typeof analyzeProducts>>;
  conversion: Awaited<ReturnType<typeof analyzeConversion>>;
  ux: Awaited<ReturnType<typeof analyzeUx>>;
  trust: Awaited<ReturnType<typeof analyzeTrust>>;
  pricing: Awaited<ReturnType<typeof analyzePricing>>;
}

const WEIGHTS = {
  seo: 0.15,
  speed: 0.15,
  products: 0.20,
  conversion: 0.15,
  ux: 0.10,
  trust: 0.15,
  pricing: 0.10,
};

export async function runFullAnalysis(
  admin: AdminApiContext,
  shopDomain: string
): Promise<FullAnalysisResult> {
  const [seo, speed, products, conversion, ux, trust, pricing] =
    await Promise.all([
      analyzeSeo(admin),
      analyzeSpeed(shopDomain),
      analyzeProducts(admin),
      analyzeConversion(admin),
      analyzeUx(admin),
      analyzeTrust(admin),
      analyzePricing(admin),
    ]);

  const overallScore = Math.round(
    seo.score * WEIGHTS.seo +
    speed.score * WEIGHTS.speed +
    products.score * WEIGHTS.products +
    conversion.score * WEIGHTS.conversion +
    ux.score * WEIGHTS.ux +
    trust.score * WEIGHTS.trust +
    pricing.score * WEIGHTS.pricing
  );

  return {
    overallScore: Math.min(100, Math.max(0, overallScore)),
    seo,
    speed,
    products,
    conversion,
    ux,
    trust,
    pricing,
  };
}

export { analyzeSeo, analyzeSpeed, analyzeProducts, analyzeConversion, analyzeUx, analyzeTrust, analyzePricing };
