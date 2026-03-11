import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  const session = url.searchParams.get("session");

  // Après callback OAuth, Shopify renvoie vers / avec shop + session
  // On redirige directement vers /app avec les params nécessaires
  if (shop && host && session) {
    return redirect(`/app?shop=${shop}&host=${host}`);
  }

  // Première visite avec shop → initier l'OAuth
  return login(request);
};

export default function Index() {
  return (
    <div style={{ fontFamily: "system-ui", padding: "2rem", textAlign: "center" }}>
      <p>Veuillez lancer l&apos;application depuis votre interface Shopify Admin.</p>
    </div>
  );
}