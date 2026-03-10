/**
 * health.tsx — Endpoint de vérification sans auth ni DB.
 * URL : /health — pour tester si l'app Railway répond.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      url: request.url,
      env: {
        hasDatabase: !!process.env.DATABASE_URL,
        hasShopifyKey: !!process.env.SHOPIFY_API_KEY,
        hasShopifySecret: !!process.env.SHOPIFY_API_SECRET,
        nodeEnv: process.env.NODE_ENV,
      },
    },
    { status: 200 }
  );
};
