import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { prismaSession } from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  // Nettoyage automatique des scopes pour éviter les erreurs de format
  scopes: (process.env.SCOPES?.split(",") ?? []).map((s) => s.trim()).filter(Boolean),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prismaSession),
  distribution: AppDistribution.AppStore,
  // On laisse le SDK gérer l'authentification selon le mode configuré dans le .toml
  future: {
    unstable_newEmbeddedAuthStrategy: true, // Recommandé pour 2025
    removeRest: false,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

// ... (garder le début du fichier identique)

export default shopify;
export const apiVersion = ApiVersion.January25;
export const {
  authenticate,
  unauthenticated,
  login,
  registerWebhooks,
  addDocumentResponseHeaders,
} = shopify;

// On l'exporte séparément pour éviter les conflits de nommage
export const sessionStorage = shopify.sessionStorage;