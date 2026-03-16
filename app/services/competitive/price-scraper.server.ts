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

function parseLocalizedPrice(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/[^\d.,\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");

  if (!cleaned) return null;

  // Cas "1 299,90" ou "1.299,90"
  let normalized = cleaned.replace(/\s/g, "");
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
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Tente d'extraire le prix d'un produit concurrent depuis son URL.
 * Stratégie en 3 couches :
 *  1. JSON-LD schema.org/Product (source la plus fiable)
 *  2. Meta tags OG / Shopify product meta
 *  3. Patterns de texte courants (fallback)
 */
const BROWSER_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

function randomUA(): string {
  return BROWSER_USER_AGENTS[Math.floor(Math.random() * BROWSER_USER_AGENTS.length)];
}

function buildHeaders(url: string): Record<string, string> {
  let referer = "https://www.google.com/";
  try { referer = new URL(url).origin + "/"; } catch {}
  return {
    "User-Agent": randomUA(),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": referer,
    "DNT": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Cache-Control": "max-age=0",
  };
}

export async function fetchHtmlOnce(url: string, timeoutMs = 12000): Promise<string | null> {
  try {
    console.log(`[fetch] GET ${url} (timeout=${timeoutMs}ms)`);
    const resp = await fetch(url, {
      headers: buildHeaders(url),
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      console.log(`[fetch] ${url} -> HTTP ${resp.status}`);
      return null;
    }
    const text = await resp.text();
    console.log(`[fetch] ${url} -> OK (${text.length} chars)`);
    return text;
  } catch (err: any) {
    console.log(`[fetch] ${url} -> ERREUR: ${err?.message ?? err}`);
    return null;
  }
}

export async function scrapeProductPrice(url: string, preloadedHtml?: string | null): Promise<ScrapedProduct> {
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
    const html = preloadedHtml ?? await fetchHtmlOnce(url);

    if (!html) {
      result.error = "Impossible de charger la page (timeout ou blocage)";
      return result;
    }
    const htmlNormalized = html.replace(/&nbsp;|&#160;/gi, " ");

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

            if (result.price) { console.log(`[scrape] JSON-LD: prix=${result.price}`); break; }
          }
        }
        if (result.price) break;
      } catch {
        // JSON mal formé — on continue avec la couche suivante
      }
    }
    if (!result.price) console.log(`[scrape] JSON-LD: aucun prix trouvé`);

    // ── Couche 1b : Shopify product JSON endpoint ────────────────────────
    if (!result.price) {
      try {
        const u = new URL(url);
        const jsonUrl = url.endsWith(".json") ? url : `${u.origin}${u.pathname.replace(/\/$/, "")}.json`;
        if (u.pathname !== "/" && !u.pathname.endsWith(".json")) {
          const jsonResp = await fetch(jsonUrl, { headers: buildHeaders(url), signal: AbortSignal.timeout(6000) }).catch(() => null);
          if (jsonResp?.ok) {
            const jd = await jsonResp.json().catch(() => null);
            const product = jd?.product;
            if (product?.variants?.length) {
              const variant = product.variants[0];
              const price = parseFloat(variant.price);
              if (price > 0) {
                result.price = price;
                result.title = product.title ?? result.title;
                result.currency = "EUR";
                console.log(`[scrape] Prix Shopify JSON: ${price}`);
              }
              if (variant.compare_at_price) {
                const orig = parseFloat(variant.compare_at_price);
                if (orig > price) {
                  result.originalPrice = orig;
                  result.hasPromotion = true;
                  result.promotionLabel = `-${Math.round(((orig - price) / orig) * 100)}%`;
                }
              }
            }
          }
        }
      } catch {}
    }

    // ── Couche 2 : Balises meta Shopify / OG ───────────────────────────────
    if (!result.price) {
      // Shopify expose souvent ces meta tags
      const shopifyPriceMatch = htmlNormalized.match(
        /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([0-9.,]+)["']/i
      );
      if (shopifyPriceMatch) {
        result.price = parseLocalizedPrice(shopifyPriceMatch[1]);
      }

      const currencyMatch = htmlNormalized.match(
        /<meta[^>]+property=["']product:price:currency["'][^>]+content=["']([A-Z]{3})["']/i
      );
      if (currencyMatch) result.currency = currencyMatch[1];

      // Microdata itemprop
      if (!result.price) {
        const microPriceMatch = htmlNormalized.match(
          /itemprop=["']price["'][^>]*content=["']([0-9.,\s]+)["']/i
        );
        if (microPriceMatch) {
          result.price = parseLocalizedPrice(microPriceMatch[1]);
        }
      }
      if (!result.price) {
        const microPriceInlineMatch = htmlNormalized.match(
          /itemprop=["']price["'][^>]*>\s*([0-9][0-9\s.,]+)/i
        );
        if (microPriceInlineMatch) {
          result.price = parseLocalizedPrice(microPriceInlineMatch[1]);
        }
      }
      const microCurrencyMatch = htmlNormalized.match(
        /itemprop=["']priceCurrency["'][^>]*content=["']([A-Z]{3})["']/i
      );
      if (microCurrencyMatch) result.currency = microCurrencyMatch[1];

      // Titre OG
      const ogTitleMatch = htmlNormalized.match(
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
        /"price_amount"\s*:\s*"?([0-9]+(?:[.,][0-9]{1,2})?)"?/i,
        /"amount"\s*:\s*"?([0-9]+(?:[.,][0-9]{1,2})?)"?/i,
        /([0-9]{1,3}(?:[ .][0-9]{3})*(?:[.,][0-9]{2}))\s?(?:€|EUR)\b/i,
        /(?:€|EUR)\s?([0-9]{1,3}(?:[ .][0-9]{3})*(?:[.,][0-9]{2}))\b/i,
        /"price"\s*:\s*([0-9]{3,7})\b/i, // parfois en centimes
      ];

      for (const pattern of pricePatterns) {
        const match = htmlNormalized.match(pattern);
        if (match) {
          const raw = match[1];
          const parsed = parseLocalizedPrice(raw);
          if (parsed && parsed > 0) {
            // Fallback "prix en centimes" pour certains JSON thèmes Shopify.
            result.price = parsed >= 1000 ? parsed / 100 : parsed;
            break;
          }
        }
      }
    }

    // Détection promotions textuelles
    if (!result.hasPromotion) {
      const promoKeywords = [
        /sale|solde|promo|discount|réduction|offre|deal|flash/i,
      ];
      for (const kw of promoKeywords) {
        if (kw.test(htmlNormalized.slice(0, 50000))) {
          result.hasPromotion = true;
          result.promotionLabel = "Promotion détectée";
          break;
        }
      }
    }

    if (!result.price) {
      result.error = "Prix non détecté — vérifiez que l'URL pointe vers une page produit";
      console.log(`[scrape] Prix non trouvé pour ${url}`);
    } else {
      console.log(`[scrape] Prix trouvé: ${result.price} ${result.currency} pour ${url}`);
    }
  } catch (err: any) {
    result.error = err.message ?? "Erreur de connexion";
  }

  return result;
}
