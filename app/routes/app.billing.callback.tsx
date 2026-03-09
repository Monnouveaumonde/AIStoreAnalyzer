import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan") as "PRO" | "GROWTH" | null;
  const chargeId = url.searchParams.get("charge_id");

  if (plan && chargeId) {
    const shop = await prisma.shop.findUnique({
      where: { shopDomain: session.shop },
    });

    if (shop) {
      await prisma.shop.update({
        where: { shopDomain: session.shop },
        data: { plan },
      });

      await prisma.subscription.upsert({
        where: { shopId: shop.id },
        create: {
          shopId: shop.id,
          shopifyChargeId: chargeId,
          plan,
          status: "ACTIVE",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        update: {
          shopifyChargeId: chargeId,
          plan,
          status: "ACTIVE",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }
  }

  return redirect("/app");
};
