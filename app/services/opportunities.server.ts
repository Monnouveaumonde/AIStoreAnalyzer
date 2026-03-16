import type { FullAnalysisResult } from "./analyzers";

export interface OpportunityData {
  type: string;
  title: string;
  description: string;
  estimatedImpact: string;
  impactLevel: "critical" | "high" | "medium" | "low";
  impactPercent: number;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category: string;
  selfActionUrl: string;
  selfActionLabel: string;
  aiActionType: string | null;
  aiActionLabel: string;
}

export function detectOpportunities(analysis: FullAnalysisResult): OpportunityData[] {
  const opportunities: OpportunityData[] = [];

  if (analysis.products.details.withCompareAtPrice < analysis.products.details.totalProducts * 0.3) {
    opportunities.push({
      type: "MISSING_BUNDLES",
      title: "Créer des bundles de produits",
      description:
        "Aucun bundle détecté. Les bundles peuvent contribuer à augmenter le panier moyen en proposant des lots à prix avantageux.",
      estimatedImpact: "Les bundles sont un levier reconnu pour améliorer le panier moyen",
      impactLevel: "high",
      impactPercent: 18,
      priority: "HIGH",
      category: "Revenue",
      selfActionUrl: "/admin/products",
      selfActionLabel: "Gérer mes produits",
      aiActionType: null,
      aiActionLabel: "Les bundles doivent être créés manuellement dans Shopify",
    });
  }

  if (analysis.conversion.details.collectionCount < 5) {
    opportunities.push({
      type: "MISSING_UPSELLS",
      title: "Configurer l'upsell et le cross-sell",
      description:
        "Les recommandations de produits et les upsells ne sont pas encore optimisés. Proposer des produits complémentaires peut contribuer à améliorer le panier moyen.",
      estimatedImpact: "L'upsell est une pratique courante pour améliorer la valeur des commandes",
      impactLevel: "high",
      impactPercent: 12,
      priority: "HIGH",
      category: "Revenue",
      selfActionUrl: "/admin/collections",
      selfActionLabel: "Gérer mes collections",
      aiActionType: null,
      aiActionLabel: "L'upsell et le cross-sell doivent être configurés manuellement",
    });
  }

  if (analysis.products.details.avgDescriptionLength < 200) {
    opportunities.push({
      type: "WEAK_DESCRIPTIONS",
      title: "Améliorer les descriptions produits",
      description:
        `Descriptions moyennes de ${analysis.products.details.avgDescriptionLength} caractères. Des descriptions détaillées avec bénéfices et storytelling tendent à mieux convertir.`,
      estimatedImpact: "Des descriptions riches aident les visiteurs à prendre une décision d'achat",
      impactLevel: "high",
      impactPercent: 15,
      priority: "HIGH",
      category: "Conversion",
      selfActionUrl: "/admin/products",
      selfActionLabel: "Modifier mes produits",
      aiActionType: "AI_DESCRIPTIONS",
      aiActionLabel: "Générer les descriptions par IA",
    });
  }

  if (!analysis.trust.details.hasTrustBadges) {
    opportunities.push({
      type: "MISSING_TRUST_BADGES",
      title: "Ajouter des badges de confiance",
      description:
        "Aucun badge de confiance détecté (paiement sécurisé, livraison gratuite, garantie). Ces éléments contribuent à réduire l'anxiété d'achat.",
      estimatedImpact: "Les badges de confiance rassurent les visiteurs et facilitent la conversion",
      impactLevel: "medium",
      impactPercent: 8,
      priority: "MEDIUM",
      category: "Trust",
      selfActionUrl: "/admin/themes",
      selfActionLabel: "Personnaliser mon thème",
      aiActionType: "AI_TRUST_PAGE",
      aiActionLabel: "Créer une page Trust par IA",
    });
  }

  if (!analysis.trust.details.hasReviews) {
    opportunities.push({
      type: "MISSING_REVIEWS",
      title: "Mettre en place un système d'avis clients",
      description:
        "Aucun avis client détecté. La preuve sociale est considérée comme un facteur clé dans la décision d'achat en ligne.",
      estimatedImpact: "Les avis clients renforcent la confiance et peuvent améliorer la conversion",
      impactLevel: "critical",
      impactPercent: 20,
      priority: "CRITICAL",
      category: "Trust",
      selfActionUrl: "https://apps.shopify.com/search?q=reviews",
      selfActionLabel: "Trouver une app d'avis",
      aiActionType: null,
      aiActionLabel: "Installez une app d'avis (Judge.me, Loox) depuis l'App Store",
    });
  }

  if (analysis.pricing.details.productsWithCompareAt < analysis.pricing.details.totalProducts * 0.5) {
    opportunities.push({
      type: "PRICING_OPTIMIZATION",
      title: "Optimiser la stratégie de prix",
      description:
        "Le prix barré (compare-at price) n'est pas utilisé sur la majorité des produits. L'ancrage prix est un levier psychologique reconnu.",
      estimatedImpact: "L'affichage du prix barré aide les visiteurs à percevoir la valeur de l'offre",
      impactLevel: "medium",
      impactPercent: 10,
      priority: "MEDIUM",
      category: "Pricing",
      selfActionUrl: "/admin/products",
      selfActionLabel: "Modifier les prix",
      aiActionType: "AI_COMPARE_PRICES",
      aiActionLabel: "Ajouter les prix barrés par IA",
    });
  }

  if (analysis.seo.score < 70) {
    opportunities.push({
      type: "SEO_IMPROVEMENT",
      title: "Corriger les lacunes SEO",
      description:
        `Score SEO : ${analysis.seo.score}/100. Des meta titles et descriptions manquent sur plusieurs produits, ce qui peut réduire la visibilité organique.`,
      estimatedImpact: "Un SEO complet aide à améliorer le référencement naturel de votre boutique",
      impactLevel: "high",
      impactPercent: 25,
      priority: "HIGH",
      category: "Traffic",
      selfActionUrl: "/app/seo",
      selfActionLabel: "Ouvrir SEO Optimizer",
      aiActionType: "AI_SEO_FIX",
      aiActionLabel: "Corriger le SEO par IA",
    });
  }

  if (analysis.speed.score < 60) {
    opportunities.push({
      type: "SPEED_OPTIMIZATION",
      title: "Améliorer la vitesse du site",
      description:
        `Score vitesse : ${analysis.speed.score}/100. Un temps de chargement élevé peut décourager les visiteurs et nuire à la conversion.`,
      estimatedImpact: "Un site rapide offre une meilleure expérience et favorise la conversion",
      impactLevel: "high",
      impactPercent: 14,
      priority: "HIGH",
      category: "Performance",
      selfActionUrl: "/admin/themes",
      selfActionLabel: "Optimiser mon thème",
      aiActionType: null,
      aiActionLabel: "La vitesse dépend du thème et de l'hébergement Shopify",
    });
  }

  if (analysis.ux.score < 70) {
    opportunities.push({
      type: "UX_IMPROVEMENT",
      title: "Améliorer l'expérience utilisateur",
      description:
        "Des pages essentielles (À propos, Contact, FAQ) sont manquantes. Une UX complète rassure et guide le visiteur dans son parcours d'achat.",
      estimatedImpact: "Des pages complètes renforcent la crédibilité de votre boutique",
      impactLevel: "medium",
      impactPercent: 11,
      priority: "MEDIUM",
      category: "UX",
      selfActionUrl: "/admin/pages",
      selfActionLabel: "Gérer mes pages",
      aiActionType: "AI_CREATE_PAGES",
      aiActionLabel: "Créer les pages manquantes par IA",
    });
  }

  return opportunities.sort((a, b) => b.impactPercent - a.impactPercent);
}

export function calculateTotalRevenueImpact(opportunities: OpportunityData[]): number {
  return opportunities.length;
}
