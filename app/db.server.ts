import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Un seul client Prisma partagé — évite les connexions multiples
const prisma = globalThis.__prisma ?? new PrismaClient({
  log: ["query", "error", "warn"],
});

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

// Test de connexion au démarrage
prisma.$connect()
  .then(() => console.log("[db] PostgreSQL connecté"))
  .catch((e: unknown) => console.error("[db] ERREUR connexion PostgreSQL:", e));

// Même instance utilisée pour les sessions Shopify et le reste de l'app
export const prismaSession = prisma;
export default prisma;
