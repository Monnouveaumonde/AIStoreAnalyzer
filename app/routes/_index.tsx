import type { LoaderFunctionArgs } from "@remix-run/node";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return login(request);
};

export default function Index() {
  return (
    <div style={{ fontFamily: "system-ui", padding: "2rem", textAlign: "center" }}>
      <p>Veuillez lancer l&apos;application depuis votre interface Shopify Admin.</p>
    </div>
  );
}
