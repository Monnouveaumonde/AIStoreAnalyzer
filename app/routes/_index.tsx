import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");

  // Après OAuth, Shopify renvoie sur / avec shop+host — on redirige vers /app
  if (shop && host) {
    return redirect(`/app?shop=${shop}&host=${host}`);
  }

  // Sinon : page de login pour entrer le domaine de la boutique
  return login(request);
};

export default function Index() {
  return null;
}
