import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Le SDK va détecter si c'est un début d'OAuth ou un callback
  // Il va gérer l'INSERT en base de données et la redirection finale
  await authenticate.admin(request);
  
  return null;
};

export default function Auth() {
  return null;
}