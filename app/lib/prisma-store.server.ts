/**
 * prisma-store.server.ts
 *
 * Helpers CRUD pour les modèles Store, Competitor et SeoAudit.
 * Importé dans les routes Remix qui ont besoin de ces opérations.
 *
 * Utilise le client Prisma singleton défini dans db.server.ts.
 */

import prisma from "../db.server";

// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * Trouve ou crée un Store à partir du domaine Shopify.
 * Utilisé à l'installation de l'app et à chaque connexion.
 */
export async function findOrCreateStore(shopDomain: string) {
  return prisma.store.upsert({
    where: { shop: shopDomain },
    update: {},
    create: { shop: shopDomain },
  });
}

/**
 * Récupère un Store avec tous ses concurrents et audits SEO.
 */
export async function getStoreWithRelations(shopDomain: string) {
  return prisma.store.findUnique({
    where: { shop: shopDomain },
    include: {
      competitors: { orderBy: { createdAt: "desc" } },
      seoAudits: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
}

// ─── Competitor ───────────────────────────────────────────────────────────────

/**
 * Ajoute un concurrent à surveiller pour un Store donné.
 */
export async function addCompetitor(storeId: string, url: string) {
  return prisma.competitor.create({
    data: { storeId, url },
  });
}

/**
 * Liste tous les concurrents d'un Store.
 */
export async function getCompetitors(storeId: string) {
  return prisma.competitor.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Supprime un concurrent par son ID.
 */
export async function deleteCompetitor(id: string) {
  return prisma.competitor.delete({ where: { id } });
}

// ─── SeoAudit ─────────────────────────────────────────────────────────────────

/**
 * Crée un nouvel audit SEO pour un Store.
 * `report` est un objet JSON libre contenant les résultats détaillés.
 */
export async function createSeoAudit(
  storeId: string,
  score: number,
  report: Record<string, unknown>
) {
  return prisma.seoAudit.create({
    data: { storeId, score, report },
  });
}

/**
 * Récupère le dernier audit SEO d'un Store.
 */
export async function getLatestSeoAudit(storeId: string) {
  return prisma.seoAudit.findFirst({
    where: { storeId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Récupère l'historique des 10 derniers audits SEO d'un Store.
 */
export async function getSeoAuditHistory(storeId: string, limit = 10) {
  return prisma.seoAudit.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, score: true, createdAt: true },
  });
}
