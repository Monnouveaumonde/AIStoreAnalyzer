/**
 * Route racine "/" — gère le flux auth et redirige.
 * - Si id_token/host présents : rediriger vers /auth/callback (route prévue pour le token)
 * - Sinon : login() pour OAuth ou /auth/login
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.has("id_token") && url.searchParams.has("host")) {
    return redirect(`/auth/callback?${url.searchParams.toString()}`);
  }
  const result = await login(request);
  if (result instanceof Response) return result;
  return redirect("/auth/login");
};

export default function Index() {
  return null;
}
