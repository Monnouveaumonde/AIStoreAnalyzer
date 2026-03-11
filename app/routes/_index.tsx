/**
 * Route racine "/" — redirige vers la page de connexion.
 * Sans cette route, la page d'accueil serait blanche.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const result = await login(request);
  if (result instanceof Response) return result;
  return redirect("/auth/login");
};

export default function Index() {
  return null;
}
