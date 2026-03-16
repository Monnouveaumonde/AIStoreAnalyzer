import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan") as "PRO" | "GROWTH" | null;
  const addon = url.searchParams.get("addon");
  const chargeId = url.searchParams.get("charge_id");

  if (!chargeId) return redirect("/app/billing");

  const chargeStatus = await verifyChargeStatus(admin, chargeId);
  if (chargeStatus !== "ACTIVE") {
    return redirect("/app/billing");
  }

  if (plan) {
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

  if (addon === "automation_plus") {
    const shop = await prisma.shop.findUnique({
      where: { shopDomain: session.shop },
    });

    if (shop) {
      await prisma.subscription.upsert({
        where: { shopId: shop.id },
        create: {
          shopId: shop.id,
          shopifyChargeId: null,
          plan: shop.plan,
          status: "ACTIVE",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          automationAddonActive: true,
          automationAddonChargeId: chargeId,
          automationAddonPrice: 5,
        },
        update: {
          automationAddonActive: true,
          automationAddonChargeId: chargeId,
          automationAddonPrice: 5,
        },
      });
    }
  }

  return redirect("/app");
};

async function verifyChargeStatus(
  admin: any,
  chargeId: string
): Promise<string> {
  try {
    const response = await admin.graphql(`
      query {
        node(id: "gid://shopify/AppSubscription/${chargeId}") {
          ... on AppSubscription {
            status
          }
        }
      }
    `);
    const data = await response.json();
    return data.data?.node?.status ?? "UNKNOWN";
  } catch {
    return "ACTIVE";
  }
}
