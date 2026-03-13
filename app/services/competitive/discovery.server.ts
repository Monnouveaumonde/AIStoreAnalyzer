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
  "searx.", "serper.dev",
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 25000);
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

type RawResult = { url: string; title: string; snippet: string; source: string };

// ════════════════════════════════════════════════════════════════════════════
//  SOURCE PRIMAIRE : Serper.dev (Google Search API — 2500 req gratuites)
// ════════════════════════════════════════════════════════════════════════════

async function fetchSerper(query: string): Promise<RawResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.log("[discovery] SERPER_API_KEY manquante — configurez-la sur Railway");
    return [];
  }
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        gl: "fr",
        hl: "fr",
        num: 30,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.log(`[discovery] Serper erreur HTTP: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = await res.json();
    const results: RawResult[] = [];
    for (const item of data.organic ?? []) {
      if (item.link) {
        results.push({
          url: item.link,
          title: item.title ?? "",
          snippet: item.snippet ?? "",
          source: "Google",
        });
      }
    }
    console.log(`[discovery] Serper (Google): ${results.length} résultat(s)`);
    return results;
  } catch (e: any) {
    console.error(`[discovery] Serper erreur: ${e?.message ?? e}`);
    return [];
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  FALLBACKS : Brave, Google CSE, DDG, Bing
// ════════════════════════════════════════════════════════════════════════════

async function fetchBraveSearch(query: string): Promise<RawResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20&search_lang=fr&country=fr`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json", "X-Subscription-Token": apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: RawResult[] = (data.web?.results ?? [])
      .filter((item: any) => item.url)
      .map((item: any) => ({ url: item.url, title: item.title ?? "", snippet: item.description ?? "", source: "Brave" }));
    console.log(`[discovery] Brave: ${results.length} résultat(s)`);
    return results;
  } catch { return []; }
}

async function fetchGoogleCSE(query: string): Promise<RawResult[]> {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) return [];
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(query)}&num=10&lr=lang_fr`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).map((item: any) => ({ url: item.link ?? "", title: item.title ?? "", snippet: item.snippet ?? "", source: "Google CSE" }));
  } catch { return []; }
}

async function fetchDDGHtml(query: string): Promise<RawResult[]> {
  try {
    const res = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
      body: `q=${encodeURIComponent(query)}&kl=fr-fr`,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results: RawResult[] = [];
    const blocks = html.split(/class="result\s/g);
    for (const block of blocks) {
      const hrefMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!hrefMatch) continue;
      let url = hrefMatch[1];
      const title = hrefMatch[2].replace(/<[^>]+>/g, "").trim();
      if (url.includes("uddg=")) { try { url = decodeURIComponent(url.split("uddg=")[1].split("&")[0]); } catch {} }
      if (!url.startsWith("http")) continue;
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|span)/i);
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "";
      results.push({ url, title, snippet, source: "DuckDuckGo" });
    }
    if (results.length > 0) console.log(`[discovery] DDG: ${results.length} résultat(s)`);
    return results;
  } catch { return []; }
}

async function fetchBingHtml(query: string): Promise<RawResult[]> {
  try {
    const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=fr&cc=FR&count=20`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results: RawResult[] = [];
    const liBlocks = html.split(/<li class="b_algo"/g);
    for (let i = 1; i < liBlocks.length; i++) {
      const block = liBlocks[i];
      const hrefMatch = block.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!hrefMatch) continue;
      const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      results.push({
        url: hrefMatch[1],
        title: hrefMatch[2].replace(/<[^>]+>/g, "").trim(),
        snippet: snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "",
        source: "Bing",
      });
    }
    if (results.length > 0) console.log(`[discovery] Bing: ${results.length} résultat(s)`);
    return results;
  } catch { return []; }
}

// ════════════════════════════════════════════════════════════════════════════
//  FONCTION PRINCIPALE
// ════════════════════════════════════════════════════════════════════════════

export async function discoverCompetitors(params: {
  query: string;
  ownDomain?: string;
  limit?: number;
}): Promise<CompetitorCandidate[]> {
  const limit = Math.min(params.limit ?? 10, 50);
  const query = (params.query || "").trim();
  if (!query) return [];

  console.log(`[discovery] ======= Recherche: "${query}" (limit=${limit}) =======`);

  const q1 = `${query} boutique en ligne acheter`;
  const q2 = `${query} shop online buy price`;

  // Serper = source primaire (API Google fiable)
  // Tout le reste en fallback
  const [serper1, serper2, brave, google, ddg, bing] = await Promise.all([
    fetchSerper(q1),
    fetchSerper(q2),
    fetchBraveSearch(q1),
    fetchGoogleCSE(query),
    fetchDDGHtml(q1),
    fetchBingHtml(q1),
  ]);

  const allItems = [...serper1, ...serper2, ...brave, ...google, ...ddg, ...bing];
  console.log(`[discovery] Total brut: ${allItems.length} (Serper: ${serper1.length + serper2.length}, Brave: ${brave.length}, Google CSE: ${google.length}, DDG: ${ddg.length}, Bing: ${bing.length})`);

  if (allItems.length === 0) {
    console.log("[discovery] AUCUNE source n'a retourné de résultats. Vérifiez SERPER_API_KEY dans les variables Railway.");
  }

  const seedTokens = tokenize(query);
  const seenDomains = new Set<string>();
  const rawCandidates: Array<{
    url: string; domain: string; title: string; snippet: string;
    source: string; relevanceScore: number; ecommerceScore: number;
    platform: string | null; score: number;
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
      url: item.url, domain, title: item.title || domain,
      snippet: item.snippet, source: item.source,
      relevanceScore, ecommerceScore, platform, score,
    });
  }

  console.log(`[discovery] Après filtrage: ${rawCandidates.length} candidats uniques`);

  rawCandidates.sort((a, b) => {
    if (a.platform === "Shopify" && b.platform !== "Shopify") return -1;
    if (b.platform === "Shopify" && a.platform !== "Shopify") return 1;
    return b.score - a.score;
  });

  const top = rawCandidates.slice(0, limit);

  // Détection plateforme en batch
  const withPlatform: CompetitorCandidate[] = [];
  for (let i = 0; i < top.length; i += 8) {
    const batch = top.slice(i, i + 8);
    const resolved = await Promise.all(
      batch.map(async (c) => {
        let platform = c.platform;
        if (!platform) {
          try { platform = await detectPlatformFromUrl(c.url); } catch { platform = null; }
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
          url: c.url, domain: c.domain, title: c.title, snippet: c.snippet,
          score: finalScore, relevanceScore: c.relevanceScore, ecommerceScore: c.ecommerceScore,
          platform, source: c.source, confidence, reason: reasonParts.join(" · "),
        } satisfies CompetitorCandidate;
      }),
    );
    withPlatform.push(...resolved);
  }

  withPlatform.sort((a, b) => {
    if (a.platform === "Shopify" && b.platform !== "Shopify") return -1;
    if (b.platform === "Shopify" && a.platform !== "Shopify") return 1;
    return b.score - a.score;
  });

  console.log(`[discovery] ======= Résultat: ${withPlatform.length} concurrent(s) =======`);
  return withPlatform;
}
