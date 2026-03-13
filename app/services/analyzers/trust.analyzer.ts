import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface TrustResult {
  score: number;
  details: {
    hasPrivacyPolicy: boolean;
    hasTermsOfService: boolean;
    hasRefundPolicy: boolean;
    hasShippingPolicy: boolean;
    hasContactInfo: boolean;
    hasSecureCheckout: boolean;
    hasSocialProof: boolean;
    hasTrustBadges: boolean;
    hasReviews: boolean;
    reviewAppDetected: string | null;
  };
  issues: string[];
  recommendations: string[];
}

export async function analyzeTrust(admin: AdminApiContext): Promise<TrustResult> {
  const [shopRes, pagesRes] = await Promise.all([
    admin.graphql(`
      query {
        shop {
          name
          email
          primaryDomain { host }
        }
      }
    `),
    admin.graphql(`
      query {
        pages(first: 50) {
          edges {
            node {
              title
              handle
              bodySummary
            }
          }
        }
      }
    `),
  ]);

  const shopData = await shopRes.json();
  const pagesData = await pagesRes.json();

  const shop = shopData.data?.shop;
  const pages = pagesData.data?.pages?.edges?.map((e: any) => e.node) || [];

  const normalizedPages = pages.map((p: any) => {
    const title = (p?.title || "").toLowerCase();
    const handle = (p?.handle || "").toLowerCase();
    const summary = (p?.bodySummary || "").toLowerCase();
    return `${title} ${handle} ${summary}`;
  });

  const hasPageMatching = (patterns: string[]) =>
    normalizedPages.some((text: string) => patterns.some((pattern) => text.includes(pattern)));

  const hasPrivacy = hasPageMatching([
    "privacy",
    "confidentialite",
    "confidentialité",
    "politique de confidentialité",
    "rgpd",
    "gdpr",
  ]);
  const hasTerms = hasPageMatching([
    "terms",
    "conditions",
    "conditions générales",
    "conditions generales",
    "terms of service",
    "cgv",
  ]);
  const hasRefund = hasPageMatching([
    "refund",
    "retour",
    "retours",
    "remboursement",
    "returns",
  ]);
  const hasShipping = hasPageMatching([
    "shipping",
    "livraison",
    "expédition",
    "expedition",
    "delivery",
  ]);
  const hasContact = !!shop?.email;

  const pageContent = pages.map((p: any) => (p.bodySummary || "").toLowerCase()).join(" ");
  const hasTrustBadges = pageContent.includes("secure") || pageContent.includes("guarantee") ||
                         pageContent.includes("certified") || pageContent.includes("sécurisé");
  const hasReviewsMention = pageContent.includes("review") || pageContent.includes("avis") ||
                            pageContent.includes("testimonial") || pageContent.includes("témoignage");

  const issues: string[] = [];
  const recommendations: string[] = [];

  if (!hasPrivacy) issues.push("Politique de confidentialité manquante — obligatoire RGPD");
  if (!hasTerms) issues.push("Conditions générales de vente manquantes");
  if (!hasRefund) issues.push("Politique de retour/remboursement manquante — frein majeur à l'achat");
  if (!hasShipping) issues.push("Politique de livraison manquante");
  if (!hasTrustBadges) issues.push("Aucun badge de confiance détecté sur les pages");
  if (!hasReviewsMention) issues.push("Pas d'avis clients détecté — réduit fortement la conversion");

  if (!hasPrivacy) recommendations.push("Ajoutez une politique de confidentialité conforme RGPD");
  if (!hasRefund) recommendations.push("Publiez une politique de retour claire et visible (30 jours recommandé)");
  if (!hasTrustBadges) recommendations.push("Ajoutez des badges de confiance (paiement sécurisé, livraison gratuite, garantie)");
  if (!hasReviewsMention) recommendations.push("Installez une app d'avis clients (Judge.me, Loox) pour la preuve sociale");
  if (!hasShipping) recommendations.push("Créez une page de politique de livraison avec délais et tarifs");

  const privacyScore = hasPrivacy ? 15 : 0;
  const termsScore = hasTerms ? 10 : 0;
  const refundScore = hasRefund ? 20 : 0;
  const shippingScore = hasShipping ? 15 : 0;
  const contactScore = hasContact ? 10 : 0;
  const trustBadgesScore = hasTrustBadges ? 15 : 0;
  const reviewsScore = hasReviewsMention ? 15 : 0;

  const score = Math.round(
    privacyScore + termsScore + refundScore + shippingScore +
    contactScore + trustBadgesScore + reviewsScore
  );

  return {
    score: Math.min(100, Math.max(0, score)),
    details: {
      hasPrivacyPolicy: hasPrivacy,
      hasTermsOfService: hasTerms,
      hasRefundPolicy: hasRefund,
      hasShippingPolicy: hasShipping,
      hasContactInfo: hasContact,
      hasSecureCheckout: true,
      hasSocialProof: hasReviewsMention,
      hasTrustBadges,
      hasReviews: hasReviewsMention,
      reviewAppDetected: null,
    },
    issues,
    recommendations,
  };
}
