import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// En mode embedded=false, authenticate.admin gère tout :
// - Session valide → redirige vers /app
// - Pas de session → redirige vers /auth (OAuth dans nouvel onglet)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return null;
}
