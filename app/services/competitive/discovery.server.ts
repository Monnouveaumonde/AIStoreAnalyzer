export type CompetitorCandidate = {
  url: string;
  domain: string;
  title: string;
  snippet: string;
  score: number;
  relevanceScore: number;
  ecommerceScore: number;
  platform: string | null;
  source: string;
  confidence: "faible" | "moyenne" | "elevee";
  reason: string;
};

function tokenize(input: string): string[] {
  return (input || "")
    .toLowerCase()
    .replace(/https?:\/\/|www\./g, " ")
    .replace(/[^a-z0-9\u00c0-\u017f]+/g, " ")
    .split(" ")
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  return inter / new Set([...setA, ...setB]).size;
}

function extractDomain(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const EXCLUDED_DOMAINS = [
  "facebook.com", "instagram.com", "tiktok.com", "youtube.com",
  "pinterest.com", "x.com", "twitter.com", "linkedin.com",
  "wikipedia.org", "reddit.com", "quora.com",
  "amazon.", "ebay.", "aliexpress.", "etsy.com",
  "alibaba.", "wish.com", "rakuten.", "cdiscount.fr",
  "leboncoin.fr", "vinted.fr", "depop.com", "fnac.com",
  "google.", "bing.", "yahoo.", "duckduckgo.",
  "shopify.com", "woocommerce.com", "prestashop.com",
  "wordpress.com", "wix.com", "squarespace.com", "webflow.com",
  "trustpilot.", "avis-verifies.", "tripadvisor.",
  "gov.", ".edu", "wikimedia.", "mozilla.",
  "apple.com", "microsoft.com", "github.com",
  "w3.org", "stackoverflow.com", "medium.com",
  "about.com", "healthline.com", "nytimes.com",
];

function isDomainExcluded(domain: string, ownDomain?: string): boolean {
  const d = domain.toLowerCase();
  if (ownDomain && d.includes(ownDomain.replace(/^www\./, "").toLowerCase())) return true;
  return EXCLUDED_DOMAINS.some((x) => d.includes(x));
}

function detectPlatform(text: string, url: string): string | null {
  const t = (text + " " + url).toLowerCase();
  if (t.includes("myshopify") || t.includes("powered by shopify") || t.includes("cdn.shopify") || (t.includes("/collections/") && t.includes("/products/"))) return "Shopify";
  if (t.includes("woocommerce") || t.includes("wp-content/plugins/woo") || t.includes("wc-ajax") || t.includes("add-to-cart")) return "WooCommerce";
  if (t.includes("prestashop") || t.includes("addons.prestashop") || t.includes("module-")) return "PrestaShop";
  if (t.includes("magento") || t.includes("mage/") || t.includes("varien")) return "Magento";
  if (t.includes("bigcommerce")) return "BigCommerce";
  if (t.includes("wixsite") || t.includes(".wixsite.")) return "Wix";
  if (t.includes("shopware")) return "Shopware";
  return null;
}

async function detectPlatformFromUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 30000);
    if (html.includes("cdn.shopify.com") || html.includes("Shopify.theme") || html.includes("myshopify")) return "Shopify";
    if (html.includes("woocommerce") || html.includes("wc-ajax") || html.includes("wp-content/plugins/woocommerce")) return "WooCommerce";
    if (html.includes("prestashop") || html.includes("PrestaShop")) return "PrestaShop";
    if (html.includes("Magento") || html.includes("mage/cookies")) return "Magento";
    if (html.includes("BigCommerce") || html.includes("bigcommerce")) return "BigCommerce";
    if (html.includes("wix.com") || html.includes("X-Wix")) return "Wix";
    if (html.includes("shopware")) return "Shopware";
    const ecomSignals = ["add to cart", "panier", "ajouter au panier", "checkout", "acheter", "buy now", "add-to-cart"];
    if (ecomSignals.some((s) => html.toLowerCase().includes(s))) return "E-commerce";
    return null;
  } catch {
    return null;
  }
}

function scoreEcommerceSignals(text: string): number {
  const t = text.toLowerCase();
  const signals = [
    "shop", "store", "product", "products", "catalog", "collection",
    "checkout", "cart", "acheter", "boutique", "prix", "panier",
    "commande", "livraison", "soldes", "promotion", "discount",
    "€", "$", "buy now", "order", "sale", "add to cart",
    "free shipping", "livraison gratuite", "paiement", "payment",
  ];
  let score = 0;
  for (const k of signals) if (t.includes(k)) score++;
  return Math.min(1, score / 5);
}

function scoreDomainStore(domain: string): number {
  const d = domain.toLowerCase();
  const keywords = ["shop", "store", "boutique", "wear", "style", "mode", "sport", "beauty", "cosmet", "fit", "gym", "yoga", "market", "goods", "deal", "promo"];
  return keywords.some((k) => d.includes(k)) ? 0.15 : 0;
}

// ─── DuckDuckGo HTML lite (vrai moteur web, pas l'API encyclopédique) ─────────

async function fetchDDGHtml(query: string, source: string): Promise<Array<{ url: string; title: string; snippet: string; source: string }>> {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/`;
    const res = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
      },
      body: `q=${encodeURIComponent(query)}&kl=fr-fr&df=`,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const results: Array<{ url: string; title: string; snippet: string; source: string }> = [];

    // Extraire les <a class="result__a"> ... </a>
    const resultBlocks = html.split(/class="result\s/g);
    for (const block of resultBlocks) {
      const hrefMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!hrefMatch) continue;
      let url = hrefMatch[1];
      const title = hrefMatch[2].replace(/<[^>]+>/g, "").trim();

      // DDG lite wraps URLs with a redirect
      if (url.includes("uddg=")) {
        try {
          url = decodeURIComponent(url.split("uddg=")[1].split("&")[0]);
        } catch { /* keep original */ }
      }
      if (!url.startsWith("http")) continue;

      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|span)/i);
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "";

      results.push({ url, title, snippet, source });
    }
    return results;
  } catch {
    return [];
  }
}

// ─── Google Custom Search API (si clés disponibles) ──────────────────────────

async function fetchGoogleCSE(query: string): Promise<Array<{ url: string; title: string; snippet: string; source: string }>> {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) return [];
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(query)}&num=10&lr=lang_fr`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).map((item: any) => ({
      url: item.link ?? "",
      title: item.title ?? "",
      snippet: item.snippet ?? "",
      source: "Google",
    }));
  } catch {
    return [];
  }
}

// ─── Bing Web Search (scraping HTML) ────────────────────────────────────────

async function fetchBingHtml(query: string): Promise<Array<{ url: string; title: string; snippet: string; source: string }>> {
  try {
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=fr&cc=FR&count=15`;
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results: Array<{ url: string; title: string; snippet: string; source: string }> = [];

    const liBlocks = html.split(/<li class="b_algo"/g);
    for (let i = 1; i < liBlocks.length; i++) {
      const block = liBlocks[i];
      const hrefMatch = block.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!hrefMatch) continue;
      const url = hrefMatch[1];
      const title = hrefMatch[2].replace(/<[^>]+>/g, "").trim();
      const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || block.match(/class="b_caption"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i);
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      results.push({ url, title, snippet, source: "Bing" });
    }
    return results;
  } catch {
    return [];
  }
}

// ─── Fonction principale ─────────────────────────────────────────────────────

export async function discoverCompetitors(params: {
  query: string;
  ownDomain?: string;
  limit?: number;
}): Promise<CompetitorCandidate[]> {
  const limit = Math.min(params.limit ?? 10, 50);
  const query = (params.query || "").trim();
  if (!query) return [];

  // Construire 4 requêtes ciblées en parallèle pour maximiser les résultats
  const queries = [
    { q: `${query} boutique en ligne acheter`, src: "DuckDuckGo" },
    { q: `${query} site shopify acheter prix`, src: "DuckDuckGo-Shopify" },
    { q: `${query} acheter en ligne prix livraison`, src: "Bing" },
    { q: `${query} shop online buy price`, src: "Bing-EN" },
  ];

  const [ddg1, ddg2, bing1, bing2, google] = await Promise.all([
    fetchDDGHtml(queries[0].q, queries[0].src),
    fetchDDGHtml(queries[1].q, queries[1].src),
    fetchBingHtml(queries[2].q),
    fetchBingHtml(queries[3].q),
    fetchGoogleCSE(query),
  ]);

  const allItems = [...ddg1, ...ddg2, ...bing1, ...bing2, ...google];

  const seedTokens = tokenize(query);
  const seenDomains = new Set<string>();
  const rawCandidates: Array<{
    url: string;
    domain: string;
    title: string;
    snippet: string;
    source: string;
    relevanceScore: number;
    ecommerceScore: number;
    platform: string | null;
    score: number;
  }> = [];

  for (const item of allItems) {
    if (!item.url) continue;
    const domain = extractDomain(item.url);
    if (!domain) continue;
    if (isDomainExcluded(domain, params.ownDomain)) continue;
    if (seenDomains.has(domain)) continue;
    seenDomains.add(domain);

    const textForScoring = `${item.title} ${item.snippet} ${domain} ${item.url}`;
    const relevanceScore = jaccard(seedTokens, tokenize(textForScoring));
    const ecommerceScore = scoreEcommerceSignals(textForScoring);
    const domainBonus = scoreDomainStore(domain);
    const platform = detectPlatform(textForScoring, item.url);
    const platformBonus = platform ? 0.2 : 0;

    const score = Math.min(1, relevanceScore * 0.45 + ecommerceScore * 0.3 + domainBonus + platformBonus);

    rawCandidates.push({
      url: item.url,
      domain,
      title: item.title || domain,
      snippet: item.snippet,
      source: item.source,
      relevanceScore,
      ecommerceScore,
      platform,
      score,
    });
  }

  // Trier et limiter avant la détection de plateforme (coûteuse)
  rawCandidates.sort((a, b) => {
    const aS = a.platform === "Shopify" ? 1 : 0;
    const bS = b.platform === "Shopify" ? 1 : 0;
    if (aS !== bS) return bS - aS;
    return b.score - a.score;
  });

  const top = rawCandidates.slice(0, limit);

  // Détection de plateforme en parallèle pour les candidats sans plateforme
  const withPlatform = await Promise.all(
    top.map(async (c) => {
      let platform = c.platform;
      if (!platform) {
        try {
          platform = await detectPlatformFromUrl(c.url);
        } catch {
          platform = null;
        }
      }

      const platformBonus = platform ? 0.2 : 0;
      const finalScore = Math.min(1, c.relevanceScore * 0.45 + c.ecommerceScore * 0.3 + scoreDomainStore(c.domain) + platformBonus);

      const confidence: CompetitorCandidate["confidence"] =
        finalScore >= 0.35 ? "elevee" : finalScore >= 0.15 ? "moyenne" : "faible";

      const reasonParts: string[] = [];
      if (platform) reasonParts.push(platform);
      if (c.relevanceScore >= 0.15) reasonParts.push("niche similaire");
      if (c.ecommerceScore >= 0.2) reasonParts.push("boutique e-commerce");
      if (reasonParts.length === 0) reasonParts.push("résultat web");

      return {
        url: c.url,
        domain: c.domain,
        title: c.title,
        snippet: c.snippet,
        score: finalScore,
        relevanceScore: c.relevanceScore,
        ecommerceScore: c.ecommerceScore,
        platform,
        source: c.source,
        confidence,
        reason: reasonParts.join(" · "),
      } satisfies CompetitorCandidate;
    }),
  );

  // Re-trier après détection plateforme
  return withPlatform.sort((a, b) => {
    const aS = a.platform === "Shopify" ? 1 : 0;
    const bS = b.platform === "Shopify" ? 1 : 0;
    if (aS !== bS) return bS - aS;
    return b.score - a.score;
  });
}
