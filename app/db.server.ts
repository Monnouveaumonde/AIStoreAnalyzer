/**
 * db.server.ts
 *
 * Exporte DEUX clients Prisma (tous deux PrismaClient standard, sans Accelerate).
 * Compatible avec postgresql:// (Railway, Supabase, Neon, etc.)
 *
 * 1. `prisma`        — Client principal
 * 2. `prismaSession` — Pour PrismaSessionStorage Shopify
 */

import { PrismaClient } from "@prisma/client";

// ── Types globaux pour le singleton en développement ──────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __prismaAccelerate: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaSession: PrismaClient | undefined;
}

// ── Client 1 : Principal (connexion directe postgresql://) ────────────────────

function createMainClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const prisma = globalThis.__prismaAccelerate ?? createMainClient();

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

// Export par défaut : client principal (utilisé dans tous les services)
export default prisma;
