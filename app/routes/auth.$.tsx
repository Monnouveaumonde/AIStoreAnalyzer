import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Route de callback OAuth : le SDK valide le code et sauvegarde la session
  // puis on redirige explicitement vers /app
  if (url.pathname === "/auth/callback") {
    const { session } = await authenticate.admin(request);
    if (session) {
      const shop = session.shop;
      const host = url.searchParams.get("host");
      return redirect(`/app?shop=${shop}${host ? `&host=${host}` : ""}`);
    }
  }

  await authenticate.admin(request);
  return null;
};

export default function Auth() {
  return null;
}
