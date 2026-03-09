/**
 * rate-limit.server.ts
 *
 * Rate limiter en mémoire — léger, sans dépendance externe.
 * Utilise un sliding window par IP.
 *
 * Sur Railway/Vercel (multi-instances), remplacer par Redis si nécessaire.
 * En production single-instance, ce module suffit pour protéger les endpoints.
 *
 * Usage dans une route Remix :
 *   import { checkRateLimit } from "~/lib/rate-limit.server";
 *   const limited = await checkRateLimit(request, { max: 30, windowMs: 60_000 });
 *   if (limited) return json({ error: "Trop de requêtes" }, { status: 429 });
 */

interface RateLimitOptions {
  max: number;        // Nombre max de requêtes dans la fenêtre
  windowMs: number;   // Durée de la fenêtre en ms (ex: 60_000 = 1 minute)
  keyPrefix?: string; // Préfixe pour distinguer les limiteurs
}

interface RateLimitEntry {
  count: number;
  resetAt: number; // timestamp ms
}

// Stockage en mémoire — Map<"prefix:ip" → {count, resetAt}>
const store = new Map<string, RateLimitEntry>();

// Nettoyage automatique toutes les 5 minutes pour éviter les fuites mémoire
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Retourne true si la requête doit être bloquée (limite dépassée).
 * Retourne false si la requête est autorisée.
 */
export function checkRateLimit(
  request: Request,
  options: RateLimitOptions
): boolean {
  const { max, windowMs, keyPrefix = "rl" } = options;
  const ip = getClientIp(request);
  const key = `${keyPrefix}:${ip}`;
  const now = Date.now();

  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    // Nouvelle fenêtre
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false; // autorisé
  }

  if (entry.count >= max) {
    return true; // bloqué
  }

  entry.count++;
  return false; // autorisé
}

/**
 * Extrait l'IP client depuis les headers (compatible Railway, Vercel, Cloudflare).
 */
function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??      // Cloudflare
    request.headers.get("x-real-ip") ??             // Nginx proxy
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? // Load balancer
    "unknown"
  );
}

/**
 * Limites prédéfinies pour les endpoints publics de l'app.
 */
export const RATE_LIMITS = {
  // API publique /api/analysis/:id — 60 requêtes/minute par IP
  PUBLIC_API: { max: 60, windowMs: 60_000, keyPrefix: "pub-api" },
  // Rapport public /report/:slug — 30 vues/minute par IP
  PUBLIC_REPORT: { max: 30, windowMs: 60_000, keyPrefix: "pub-report" },
  // Analyse Shopify — 5 analyses/minute par boutique
  ANALYZE: { max: 5, windowMs: 60_000, keyPrefix: "analyze" },
} as const;
