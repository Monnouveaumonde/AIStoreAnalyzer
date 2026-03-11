import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { login } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");

  // Si la boutique a déjà une session en DB → aller directement à /app
  if (shop) {
    const session = await prisma.session.findFirst({
      where: { shop, accessToken: { not: "" } },
    });
    if (session) {
      console.log("[index] Session trouvée en DB pour", shop, "→ /app");
      return redirect(`/app?shop=${shop}${host ? `&host=${host}` : ""}`);
    }
  }

  // Pas de session → OAuth
  console.log("[index] Pas de session → login()");
  return login(request);
};

export default function Index() {
  return null;
}
