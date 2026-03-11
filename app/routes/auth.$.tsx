import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// Cette route gère le callback OAuth de Shopify.
// authenticate.admin traite le code d'autorisation et redirige vers /app.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Auth() {
  return null;
}
