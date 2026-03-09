/**
 * price-scraper.server.ts
 *
 * Service de récupération des prix concurrents.
 * Utilise fetch natif pour lire les balises JSON-LD (schema.org/Product)
 * et les meta tags Open Graph — sans librairie externe non approuvée.
 *
 * Shopify-compliant : uniquement fetch() standard, pas de puppeteer en prod.
 */

export interface ScrapedProduct {
  price: number | null;
  currency: string;
  originalPrice: number | null;  // Prix avant réduction
  hasPromotion: boolean;
  promotionLabel: string | null;
  title: string | null;
  availability: string | null;
  error: string | null;
}

/**
 * Tente d'extraire le prix d'un produit concurrent depuis son URL.
 * Stratégie en 3 couches :
 *  1. JSON-LD schema.org/Product (source la plus fiable)
 *  2. Meta tags OG / Shopify product meta
 *  3. Patterns de texte courants (fallback)
 */
export async function scrapeProductPrice(url: string): Promise<ScrapedProduct> {
  const result: ScrapedProduct = {
    price: null,
    currency: "EUR",
    originalPrice: null,
    hasPromotion: false,
    promotionLabel: null,
    title: null,
    availability: null,
    error: null,
  };

  try {
    const response = await fetch(url, {
      headers: {
        // User-agent neutre pour ne pas être bloqué
        "User-Agent":
          "Mozilla/5.0 (compatible; PriceBot/1.0; +https://ai-store-analyzer.com/bot)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(8000), // 8 secondes max
    });

    if (!response.ok) {
      result.error = `HTTP ${response.status}`;
      return result;
    }

    const html = await response.text();

    // ── Couche 1 : JSON-LD schema.org ──────────────────────────────────────
    const jsonLdMatches = html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    );

    for (const match of jsonLdMatches) {
      try {
        const jsonData = JSON.parse(match[1]);
        const products = Array.isArray(jsonData)
          ? jsonData
          : jsonData["@graph"] ?? [jsonData];

        for (const item of products) {
          if (item["@type"] === "Product" || item["@type"] === "Offer") {
            const offers = item.offers
              ? Array.isArray(item.offers)
                ? item.offers
                : [item.offers]
              : item["@type"] === "Offer"
              ? [item]
              : [];

            for (const offer of offers) {
              const price = parseFloat(offer.price ?? offer.lowPrice ?? "0");
              if (price > 0) {
                result.price = price;
                result.currency = offer.priceCurrency ?? "EUR";
                result.availability = offer.availability ?? null;
              }
            }

            if (item.name) result.title = item.name;

            // Détection promotion via highPrice / lowPrice
            if (item.offers?.highPrice && item.offers?.lowPrice) {
              const high = parseFloat(item.offers.highPrice);
              const low = parseFloat(item.offers.lowPrice);
              if (high > low && low > 0) {
                result.originalPrice = high;
                result.hasPromotion = true;
                const pct = Math.round(((high - low) / high) * 100);
                result.promotionLabel = `-${pct}%`;
              }
            }

            if (result.price) break;
          }
        }
        if (result.price) break;
      } catch {
        // JSON mal formé — on continue avec la couche suivante
      }
    }

    // ── Couche 2 : Balises meta Shopify / OG ───────────────────────────────
    if (!result.price) {
      // Shopify expose souvent ces meta tags
      const shopifyPriceMatch = html.match(
        /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([0-9.,]+)["']/i
      );
      if (shopifyPriceMatch) {
        result.price = parseFloat(shopifyPriceMatch[1].replace(",", "."));
      }

      const currencyMatch = html.match(
        /<meta[^>]+property=["']product:price:currency["'][^>]+content=["']([A-Z]{3})["']/i
      );
      if (currencyMatch) result.currency = currencyMatch[1];

      // Titre OG
      const ogTitleMatch = html.match(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
      );
      if (ogTitleMatch && !result.title) result.title = ogTitleMatch[1];
    }

    // ── Couche 3 : Patterns textuels courants ──────────────────────────────
    if (!result.price) {
      // Pattern : "39,99 €" ou "€39.99" ou "$49.00"
      const pricePatterns = [
        /data-price=["']([0-9]+(?:[.,][0-9]{1,2})?)["']/i,
        /class=["'][^"']*price[^"']*["'][^>]*>\s*[€$£]?\s*([0-9]+[.,][0-9]{2})/i,
        /"price":\s*"?([0-9]+(?:[.,][0-9]{1,2})?)"?/i,
      ];

      for (const pattern of pricePatterns) {
        const match = html.match(pattern);
        if (match) {
          const raw = match[1].replace(",", ".");
          result.price = parseFloat(raw);
          if (result.price > 0) break;
        }
      }
    }

    // Détection promotions textuelles
    if (!result.hasPromotion) {
      const promoKeywords = [
        /sale|solde|promo|discount|réduction|offre|deal|flash/i,
      ];
      for (const kw of promoKeywords) {
        if (kw.test(html.slice(0, 50000))) {
          result.hasPromotion = true;
          result.promotionLabel = "Promotion détectée";
          break;
        }
      }
    }

    if (!result.price) {
      result.error = "Prix non détecté — vérifiez l'URL";
    }
  } catch (err: any) {
    result.error = err.message ?? "Erreur de connexion";
  }

  return result;
}
