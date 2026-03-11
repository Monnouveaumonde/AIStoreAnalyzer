import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  console.log("[auth.$] path:", url.pathname, "params:", Object.fromEntries(url.searchParams));

  try {
    await authenticate.admin(request);
    console.log("[auth.$] authenticate.admin OK");
  } catch (e) {
    console.error("[auth.$] ERREUR authenticate.admin:", e);
    throw e;
  }

  // Vérification post-callback : sessions en DB
  if (url.pathname === "/auth/callback") {
    const shop = url.searchParams.get("shop");
    if (shop) {
      const count = await prisma.session.count({ where: { shop } });
      console.log(`[auth.$] Sessions en DB pour ${shop}:`, count);
    }
  }

  return null;
};

export default function Auth() {
  return null;
}
