import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Sur /auth/callback : laisser le SDK compléter l'OAuth (INSERT session en DB)
  // puis rediriger vers /app au lieu de laisser le SDK rediriger vers admin.shopify.com
  if (url.pathname === "/auth/callback") {
    // Le SDK lance une Response (302) après avoir sauvé la session — on la laisse passer
    // mais on intercepte pour rediriger vers /app avec shop+host
    const shop = url.searchParams.get("shop");
    const host = url.searchParams.get("host");

    try {
      await authenticate.admin(request);
    } catch (e) {
      // Le SDK lance toujours une Response après le callback — c'est normal
      if (e instanceof Response) {
        // Session sauvée ✅ — on redirige vers /app
        if (shop && host) {
          return redirect(`/app?shop=${shop}&host=${host}`);
        }
        return redirect("/app");
      }
      throw e;
    }
  }

  // Pour toutes les autres routes /auth/* : laisser le SDK gérer
  await authenticate.admin(request);
  return null;
};

export default function Auth() {
  return null;
}
