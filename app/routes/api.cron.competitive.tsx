import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { runStalePriceChecks } from "../services/competitive/watcher.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    return json(
      { ok: false, error: "CRON_SECRET non configuré." },
      { status: 500 },
    );
  }

  const providedSecret =
    request.headers.get("x-cron-secret") ?? new URL(request.url).searchParams.get("secret");
  if (!providedSecret || providedSecret !== configuredSecret) {
    return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const runFlag = searchParams.get("run");
  if (runFlag !== "1") {
    return json({
      ok: true,
      skipped: true,
      reason: "Add run=1 to execute checks.",
    });
  }

  const maxShopsRaw = Number(searchParams.get("maxShops") ?? "1");
  const maxShops = Number.isFinite(maxShopsRaw)
    ? Math.min(Math.max(Math.floor(maxShopsRaw), 1), 10)
    : 1;
  const maxProductsPerShopRaw = Number(searchParams.get("maxProductsPerShop") ?? "1");
  const maxProductsPerShop = Number.isFinite(maxProductsPerShopRaw)
    ? Math.min(Math.max(Math.floor(maxProductsPerShopRaw), 1), 20)
    : 1;

  const shops = await prisma.shop.findMany({
    where: {
      isActive: true,
      watchedProducts: { some: { isActive: true } },
    },
    select: { shopDomain: true },
    take: maxShops,
  });

  let checkedShops = 0;
  let checkedProducts = 0;
  let alertsGenerated = 0;
  for (const shop of shops) {
    try {
      const result = await runStalePriceChecks(shop.shopDomain, maxProductsPerShop, {
        onlyAutomation: true,
      });
      if (result.checkedProducts > 0) checkedShops += 1;
      checkedProducts += result.checkedProducts;
      alertsGenerated += result.alertsGenerated;
    } catch {
      // Non bloquant: on continue avec les autres boutiques.
    }
  }

  return json({
    ok: true,
    shopsWithActiveWatchers: shops.length,
    shopsCheckedNow: checkedShops,
    productsCheckedNow: checkedProducts,
    alertsGeneratedNow: alertsGenerated,
    limits: { maxShops, maxProductsPerShop },
  });
};

export default function CronCompetitiveWatcherRoute() {
  return null;
}
