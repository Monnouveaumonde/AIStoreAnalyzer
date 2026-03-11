/**
 * Route racine "/" — gère le flux auth et redirige.
 * - Si id_token/host présents (chargement embedded avec session) : authenticate.admin traite le token puis redirect /app
 * - Sinon : login() pour OAuth ou redirection vers /auth/login
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate, login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  // id_token + host = app chargée dans l'iframe avec session JWT → traiter et aller vers /app
  if (url.searchParams.has("id_token") && url.searchParams.has("host")) {
    const { session } = await authenticate.admin(request);
    if (session) return redirect("/app");
  }
  const result = await login(request);
  if (result instanceof Response) return result;
  return redirect("/auth/login");
};

export default function Index() {
  return null;
}
