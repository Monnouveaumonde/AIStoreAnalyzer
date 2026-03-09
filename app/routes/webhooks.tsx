import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } =
    await authenticate.webhook(request);

  if (!admin && topic !== "SHOP_REDACT") {
    throw new Response();
  }

  switch (topic) {
    case "APP_UNINSTALLED":
      if (session) {
        await prisma.session.deleteMany({ where: { shop } });
      }
      await prisma.shop.updateMany({
        where: { shopDomain: shop },
        data: { isActive: false, uninstalledAt: new Date() },
      });
      break;

    case "CUSTOMERS_DATA_REQUEST":
      // Shopify GDPR: pas de données clients stockées
      break;

    case "CUSTOMERS_REDACT":
      // Shopify GDPR: pas de données clients à purger
      break;

    case "SHOP_REDACT":
      // Cascade Prisma supprime automatiquement :
      // - analyses, opportunities, recommendations
      // - watchedProducts, priceSnapshots, priceAlerts (Competitive Watcher)
      // - seoScans, seoIssues, seoOptimizations (SEO Optimizer)
      await prisma.shop.deleteMany({ where: { shopDomain: shop } });
      break;

    case "SHOP_UPDATE":
      await prisma.shop.updateMany({
        where: { shopDomain: shop },
        data: { shopName: (payload as any)?.name },
      });
      break;

    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  throw new Response();
};
