import { LoaderFunctionArgs, redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  // Si on a le paramètre shop, on redirige DIRECTEMENT vers /app
  // avec tous les paramètres (hmac, host, etc.)
  if (shop) {
    return redirect(`/app?${url.searchParams.toString()}`);
  }

  return new Response("Veuillez lancer l'application depuis Shopify", { status: 200 });
};