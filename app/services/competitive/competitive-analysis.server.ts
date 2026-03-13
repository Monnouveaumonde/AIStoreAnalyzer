import { scrapeProductPrice } from "./price-scraper.server";

type OwnProductSignals = {
  title?: string | null;
  price?: number | null;
  currency?: string | null;
  imageCount?: number | null;
  contentLength?: number | null;
};

export type CompetitiveAnalysis = {
  title: string | null;
  price: number | null;
  currency: string;
  hasPromotion: boolean;
  availability: string | null;
  imageCount: number;
  hasVideo: boolean;
  ctaCount: number;
  trustSignals: string[];
  reviewSignals: string[];
  contentLength: number;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  recommendations: string[];
  diagnostic: string | null;
};

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLikelyPrice(raw: string): number | null {
  const cleaned = raw
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/[^\d.,\s]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned) return null;

  let normalized = cleaned;
  if (normalized.includes(",") && normalized.includes(".")) {
    const lastComma = normalized.lastIndexOf(",");
    const lastDot = normalized.lastIndexOf(".");
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value >= 1000 ? value / 100 : value;
}

async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CompetitiveInsightsBot/1.0; +https://ai-store-analyzer.com/bot)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export async function analyzeCompetitivePage(input: {
  competitorUrl: string;
  own?: OwnProductSignals;
}): Promise<CompetitiveAnalysis> {
  const scraped = await scrapeProductPrice(input.competitorUrl);
  const html = await fetchPageHtml(input.competitorUrl);

  const normalizedHtml = (html ?? "").replace(/&nbsp;|&#160;/gi, " ");
  const plain = stripTags(normalizedHtml).toLowerCase();

  const titleMatch = normalizedHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  const pageTitle = scraped.title ?? titleMatch?.[1]?.trim() ?? null;
  const descriptionMatch = normalizedHtml.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
  );
  const description = descriptionMatch?.[1] ?? null;

  const imageCount =
    normalizedHtml.match(/<img\b[^>]*>/gi)?.length ??
    normalizedHtml.match(/"image"\s*:/gi)?.length ??
    0;
  const hasVideo = /<video\b|youtube\.com|vimeo\.com|product__media-type-video/i.test(
    normalizedHtml
  );
  const ctaCount =
    (normalizedHtml.match(/add to cart|ajouter au panier|buy now|acheter maintenant/gi) ?? [])
      .length +
    (normalizedHtml.match(/<button\b/gi) ?? []).length;

  const trustSignals = [
    "retour gratuit",
    "livraison gratuite",
    "paiement sécurisé",
    "garantie",
    "avis client",
    "satisfait ou remboursé",
  ].filter((s) => plain.includes(s));

  const reviewSignals = [
    /[0-9](?:[.,][0-9])?\s*\/\s*5/.test(plain) ? "Note visible" : null,
    /avis|reviews|ratings|étoiles/.test(plain) ? "Bloc avis présent" : null,
  ].filter(Boolean) as string[];

  const contentLength = (description?.length ?? 0) + plain.length;

  let detectedPrice = scraped.price;
  if (!detectedPrice) {
    const inlinePriceMatch = normalizedHtml.match(
      /([0-9]{1,3}(?:[ .][0-9]{3})*(?:[.,][0-9]{2}))\s?(?:€|eur)\b/i
    );
    if (inlinePriceMatch) {
      detectedPrice = parseLikelyPrice(inlinePriceMatch[1]);
    }
  }

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const opportunities: string[] = [];
  const recommendations: string[] = [];

  if (detectedPrice) strengths.push("Prix concurrent détecté en temps réel.");
  else weaknesses.push("Prix non détecté automatiquement sur la page concurrente.");

  if (imageCount >= 4) strengths.push("Présentation visuelle riche (plusieurs images).");
  else weaknesses.push("Visuels limités ou mal détectés sur la page produit.");

  if (hasVideo) strengths.push("Présence de vidéo produit.");
  else opportunities.push("Ajouter une vidéo produit peut améliorer la conversion.");

  if (trustSignals.length > 0)
    strengths.push(`Signaux de confiance visibles: ${trustSignals.join(", ")}.`);
  else opportunities.push("Renforcer les preuves de confiance (retours, garanties, paiement sécurisé).");

  if (reviewSignals.length > 0) strengths.push("Avis/notation visible pour rassurer l'acheteur.");
  else opportunities.push("Afficher des avis clients peut augmenter la crédibilité.");

  if ((input.own?.contentLength ?? 0) > 0) {
    if (contentLength > (input.own?.contentLength ?? 0)) {
      opportunities.push("Le concurrent semble avoir un contenu plus détaillé que votre fiche.");
      recommendations.push("Enrichir la description produit avec bénéfices, preuves et FAQ.");
    } else {
      strengths.push("Votre contenu paraît au moins aussi dense que celui du concurrent.");
    }
  }

  if (input.own?.price && detectedPrice) {
    const diffPercent = ((detectedPrice - input.own.price) / input.own.price) * 100;
    if (diffPercent < -3) {
      weaknesses.push(`Vous êtes ${Math.abs(diffPercent).toFixed(1)}% plus cher que le concurrent.`);
      recommendations.push("Tester une baisse prix ciblée, bundle, ou bonus pour compenser.");
    } else if (diffPercent > 3) {
      strengths.push(`Vous êtes ${diffPercent.toFixed(1)}% moins cher que le concurrent.`);
      recommendations.push("Maintenir l'avantage prix tout en renforçant la marge avec upsell.");
    } else {
      strengths.push("Positionnement prix proche du concurrent.");
      recommendations.push("Se différencier via visuels, garanties et preuves sociales.");
    }
  }

  if ((input.own?.imageCount ?? 0) > 0) {
    if (imageCount > (input.own?.imageCount ?? 0)) {
      opportunities.push("Le concurrent utilise plus de visuels.");
      recommendations.push("Ajouter des images lifestyle, zoom, et usage réel.");
    } else {
      strengths.push("Votre nombre d'images est compétitif.");
    }
  }

  const diagnostic =
    !detectedPrice && html
      ? "Page chargée mais structure prix non standard (possible rendu JS ou anti-bot)."
      : !html
      ? "Impossible de charger la page concurrente (timeout ou blocage)."
      : null;

  return {
    title: pageTitle,
    price: detectedPrice,
    currency: scraped.currency || "EUR",
    hasPromotion: scraped.hasPromotion,
    availability: scraped.availability,
    imageCount,
    hasVideo,
    ctaCount,
    trustSignals,
    reviewSignals,
    contentLength,
    strengths,
    weaknesses,
    opportunities,
    recommendations,
    diagnostic,
  };
}
