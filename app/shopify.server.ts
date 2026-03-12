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
  scopes: (process.env.SCOPES?.split(",") ?? []).map((s) => s.trim()).filter(Boolean),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  useOnlineTokens: false,
  sessionStorage: new PrismaSessionStorage(prismaSession) as any,
  distribution: AppDistribution.AppStore,
  future: {
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