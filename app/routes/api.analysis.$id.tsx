/**
 * Route API publique pour récupérer un rapport d'analyse au format JSON.
 * Accessible via GET /api/analysis/:id
 * Utilisé pour les intégrations tierces et le partage viral.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { checkRateLimit, RATE_LIMITS } from "../lib/rate-limit.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { id } = params;

  // Rate limiting : 60 requêtes/minute par IP
  if (checkRateLimit(request, RATE_LIMITS.PUBLIC_API)) {
    return json(
      { error: "Trop de requêtes. Réessayez dans une minute." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const origin = request.headers.get("Origin");
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET",
    "Cache-Control": "public, max-age=300",
  });

  const analysis = await prisma.analysis.findUnique({
    where: { id },
    include: {
      opportunities: { orderBy: { impactPercent: "desc" } },
      shop: { select: { shopName: true, shopDomain: true } },
    },
  });

  if (!analysis || !analysis.isPublic) {
    return json({ error: "Rapport introuvable" }, { status: 404, headers });
  }

  const totalImpact = analysis.opportunities.reduce(
    (acc, o) => acc * (1 + o.impactPercent / 100),
    1
  );

  return json(
    {
      id: analysis.id,
      shareSlug: analysis.shareSlug,
      shop: {
        name: analysis.shop.shopName || analysis.shop.shopDomain,
        domain: analysis.shop.shopDomain,
      },
      scores: {
        overall: Math.round(analysis.overallScore),
        seo: Math.round(analysis.seoScore),
        speed: Math.round(analysis.speedScore),
        products: Math.round(analysis.productScore),
        conversion: Math.round(analysis.conversionScore),
        ux: Math.round(analysis.uxScore),
        trust: Math.round(analysis.trustScore),
        pricing: Math.round(analysis.pricingScore),
      },
      opportunities: analysis.opportunities.map((o) => ({
        title: o.title,
        description: o.description,
        estimatedImpact: o.estimatedImpact,
        impactPercent: o.impactPercent,
        priority: o.priority,
        category: o.category,
      })),
      totalRevenueImpact: Math.round((totalImpact - 1) * 100),
      createdAt: analysis.createdAt,
    },
    { headers }
  );
};
