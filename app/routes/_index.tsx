/**
 * Route racine "/" — redirige vers la page de connexion.
 * Sans cette route, la page d'accueil serait blanche.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // login() retourne une Response (redirect OAuth) si nécessaire
  const response = login(request);
  if (response) return response;
  return redirect("/auth/login");
};
