import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  // IMPORTANT: en embedded Shopify, il faut conserver les paramètres
  // (id_token, hmac, host, shop, etc.) pour que authenticate.admin()
  // puisse initialiser correctement la session.
  if (url.search) {
    return redirect(`/app${url.search}`);
  }

  return login(request);
};

export default function Index() {
  return (
    <div style={{ fontFamily: "system-ui", padding: "2rem", textAlign: "center" }}>
      <p>Veuillez lancer l&apos;application depuis votre interface Shopify Admin.</p>
    </div>
  );
}