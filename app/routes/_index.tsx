import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");

  if (shop) {
    const params = new URLSearchParams({ shop });
    if (host) params.set("host", host);
    return redirect(`/app?${params.toString()}`);
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
