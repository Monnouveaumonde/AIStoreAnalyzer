import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";

// 👇 Crée le client Prisma connecté à ta DB Railway
export const prismaSession = new PrismaClient();

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: (process.env.SCOPES?.split(",") ?? []).map((s) => s.trim()).filter(Boolean),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  
  // 👇 tokens offline pour store test
  useOnlineTokens: false,
  
  // 👇 session storage avec Prisma direct
  sessionStorage: new PrismaSessionStorage(prismaSession),
  
  // 👇 App Store distribution
  distribution: AppDistribution.AppStore,
  
  future: {
    // 👇 Embedded Auth + stable Remix support
    unstable_newEmbeddedAuthStrategy: true,
    removeRest: false,
  },
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const {
  authenticate,
  unauthenticated,
  login,
  registerWebhooks,
  addDocumentResponseHeaders,
} = shopify;
export const sessionStorage = shopify.sessionStorage;