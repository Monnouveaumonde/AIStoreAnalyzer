import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { redirect } from "@remix-run/node";
import { prismaSession } from "./db.server";
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: (process.env.SCOPES?.split(",") ?? []).map((s) => s.trim()).filter(Boolean),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prismaSession),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: false,
    removeRest: false,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

// Wrapper authenticate.admin pour le mode non-embedded :
// Si le SDK ne peut pas authentifier (pas de cookie), on récupère la session
// directement en DB via le paramètre `shop` dans l'URL.
const originalAuthenticate = shopify.authenticate;

const adminWrapper = async (request: Request) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  try {
    return await originalAuthenticate.admin(request);
  } catch (e) {
    // Si c'est une redirection du SDK (Response), on la laisse passer
    if (e instanceof Response) throw e;

    // Sinon : tenter de récupérer la session depuis la DB via shop
    if (shop) {
      const session = await prismaSession.session.findFirst({
        where: { shop, isOnline: false },
      });
      if (session?.accessToken) {
        // Reconstruire un contexte admin avec la session DB
        // On modifie la requête pour ajouter un header Authorization factice
        // que le SDK peut utiliser pour retrouver la session
        const newHeaders = new Headers(request.headers);
        newHeaders.set("Authorization", `Bearer ${session.id}`);
        const newRequest = new Request(request.url, {
          method: request.method,
          headers: newHeaders,
          body: request.body,
        });
        try {
          return await originalAuthenticate.admin(newRequest);
        } catch (e2) {
          if (e2 instanceof Response) throw e2;
        }
      }
      // Pas de session en DB → OAuth
      throw redirect(`/auth?shop=${shop}`);
    }
    throw redirect("/auth/login");
  }
};

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = {
  ...originalAuthenticate,
  admin: adminWrapper,
};
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
