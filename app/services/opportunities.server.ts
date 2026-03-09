import type { FullAnalysisResult } from "./analyzers";

export interface OpportunityData {
  type: string;
  title: string;
  description: string;
  estimatedImpact: string;
  impactPercent: number;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category: string;
}

export function detectOpportunities(analysis: FullAnalysisResult): OpportunityData[] {
  const opportunities: OpportunityData[] = [];

  if (analysis.products.details.withCompareAtPrice < analysis.products.details.totalProducts * 0.3) {
    opportunities.push({
      type: "MISSING_BUNDLES",
      title: "Créer des bundles de produits",
      description:
        "Aucun bundle détecté. Les bundles permettent d'augmenter le panier moyen en proposant des lots à prix avantageux.",
      estimatedImpact: "Ajouter des bundles peut augmenter le revenu de +18%",
      impactPercent: 18,
      priority: "HIGH",
      category: "Revenue",
    });
  }

  if (analysis.conversion.details.collectionCount < 5) {
    opportunities.push({
      type: "MISSING_UPSELLS",
      title: "Configurer l'upsell et le cross-sell",
      description:
        "Les recommandations de produits et les upsells ne sont pas optimisés. Proposer des produits complémentaires augmente significativement le AOV.",
      estimatedImpact: "L'upsell peut augmenter le panier moyen de +12%",
      impactPercent: 12,
      priority: "HIGH",
      category: "Revenue",
    });
  }

  if (analysis.products.details.avgDescriptionLength < 200) {
    opportunities.push({
      type: "WEAK_DESCRIPTIONS",
      title: "Améliorer les descriptions produits",
      description:
        `Descriptions moyennes de ${analysis.products.details.avgDescriptionLength} caractères. Des descriptions détaillées avec bénéfices et storytelling convertissent 30% mieux.`,
      estimatedImpact: "Des descriptions optimisées augmentent la conversion de +15%",
      impactPercent: 15,
      priority: "HIGH",
      category: "Conversion",
    });
  }

  if (!analysis.trust.details.hasTrustBadges) {
    opportunities.push({
      type: "MISSING_TRUST_BADGES",
      title: "Ajouter des badges de confiance",
      description:
        "Aucun badge de confiance détecté (paiement sécurisé, livraison gratuite, garantie). Ces éléments réduisent l'anxiété d'achat.",
      estimatedImpact: "Les badges de confiance augmentent la conversion de +8%",
      impactPercent: 8,
      priority: "MEDIUM",
      category: "Trust",
    });
  }

  if (!analysis.trust.details.hasReviews) {
    opportunities.push({
      type: "MISSING_REVIEWS",
      title: "Mettre en place un système d'avis clients",
      description:
        "Aucun avis client détecté. 93% des consommateurs lisent les avis avant d'acheter. La preuve sociale est le levier de conversion #1.",
      estimatedImpact: "Les avis clients augmentent la conversion de +20%",
      impactPercent: 20,
      priority: "CRITICAL",
      category: "Trust",
    });
  }

  if (analysis.pricing.details.productsWithCompareAt < analysis.pricing.details.totalProducts * 0.5) {
    opportunities.push({
      type: "PRICING_OPTIMIZATION",
      title: "Optimiser la stratégie de prix",
      description:
        "Le prix barré (compare-at price) n'est pas utilisé sur la majorité des produits. L'ancrage prix est un puissant levier psychologique.",
      estimatedImpact: "L'ancrage prix augmente le taux de conversion de +10%",
      impactPercent: 10,
      priority: "MEDIUM",
      category: "Pricing",
    });
  }

  if (analysis.seo.score < 70) {
    opportunities.push({
      type: "SEO_IMPROVEMENT",
      title: "Corriger les lacunes SEO",
      description:
        `Score SEO: ${analysis.seo.score}/100. Des meta titles et descriptions manquent sur plusieurs produits, réduisant la visibilité organique.`,
      estimatedImpact: "Un bon SEO peut augmenter le trafic organique de +25%",
      impactPercent: 25,
      priority: "HIGH",
      category: "Traffic",
    });
  }

  if (analysis.speed.score < 60) {
    opportunities.push({
      type: "SPEED_OPTIMIZATION",
      title: "Améliorer la vitesse du site",
      description:
        `Score vitesse: ${analysis.speed.score}/100. Chaque seconde de chargement supplémentaire réduit la conversion de 7%.`,
      estimatedImpact: "Améliorer la vitesse peut augmenter la conversion de +14%",
      impactPercent: 14,
      priority: "HIGH",
      category: "Performance",
    });
  }

  if (analysis.ux.score < 70) {
    opportunities.push({
      type: "UX_IMPROVEMENT",
      title: "Améliorer l'expérience utilisateur",
      description:
        "Des pages essentielles (À propos, Contact, FAQ) sont manquantes. Une UX complète rassure et guide le visiteur vers l'achat.",
      estimatedImpact: "Une meilleure UX peut augmenter la conversion de +11%",
      impactPercent: 11,
      priority: "MEDIUM",
      category: "UX",
    });
  }

  return opportunities.sort((a, b) => b.impactPercent - a.impactPercent);
}

export function calculateTotalRevenueImpact(opportunities: OpportunityData[]): number {
  const combined = opportunities.reduce((acc, opp) => {
    return acc * (1 + opp.impactPercent / 100);
  }, 1);
  return Math.round((combined - 1) * 100);
}
