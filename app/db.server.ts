/**
 * db.server.ts
 *
 * Exporte DEUX clients Prisma distincts :
 *
 * 1. `prisma`        — Client avec Prisma Accelerate (withAccelerate)
 *                      Utilisé partout dans l'app pour bénéficier du
 *                      connection pooling et du cache de requêtes.
 *
 * 2. `prismaSession` — Client PrismaClient standard (sans extension)
 *                      Requis par PrismaSessionStorage de Shopify qui
 *                      attend le type PrismaClient exact, pas un type étendu.
 *
 * Les deux partagent la même DATABASE_URL (Prisma Accelerate).
 * Prisma Accelerate gère le pooling pour les deux connexions.
 */

import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

// ── Types globaux pour le singleton en développement ──────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __prismaAccelerate: ReturnType<typeof createAccelerateClient> | undefined;
  // eslint-disable-next-line no-var
  var __prismaSession: PrismaClient | undefined;
}

// ── Client 1 : Prisma Accelerate (pour toute l'app) ──────────────────────────

function createAccelerateClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends(withAccelerate());
}

const prisma = globalThis.__prismaAccelerate ?? createAccelerateClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prismaAccelerate = prisma;
}

// ── Client 2 : PrismaClient pur (pour PrismaSessionStorage Shopify) ───────────

function createSessionClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error"] : ["error"],
  });
}

export const prismaSession: PrismaClient =
  globalThis.__prismaSession ?? createSessionClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prismaSession = prismaSession;
}

// Export par défaut : le client Accelerate (utilisé dans tous les services)
export default prisma;
