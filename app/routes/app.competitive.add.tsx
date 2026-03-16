/**
 * app.competitive.add.tsx
 *
 * Formulaire d'ajout d'un produit concurrent à surveiller.
 * Le marchand :
 *  1. Choisit un de ses produits Shopify (via ResourcePicker ou champ texte)
 *  2. Saisit l'URL du produit chez le concurrent
 *  3. Saisit son prix actuel (pour comparaison)
 *
 * À la soumission :
 *  - Validation de l'URL (fetch HEAD pour vérifier la disponibilité)
 *  - Premier scraping du prix concurrent
 *  - Création du WatchedProduct en base
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  TextField,
  FormLayout,
  Banner,
  InlineStack,
  Spinner,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { canAddWatchedProduct } from "../services/competitive/watcher.server";
import { scrapeProductPrice } from "../services/competitive/price-scraper.server";
import { hasPaidModulesAccess } from "../services/billing/plans.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const paidAccess = await hasPaidModulesAccess(session.shop);
  if (!paidAccess.allowed) {
    throw redirect("/app/billing?source=competitive");
  }

  const check = await canAddWatchedProduct(session.shop);
  console.info("[competitive.add] loader", {
    shop: session.shop,
    canAdd: check.allowed,
    current: check.current,
    limit: check.limit,
  });

  // Charge les produits Shopify du marchand pour le sélecteur
  const response = await admin.graphql(`
    query {
      products(first: 50, sortKey: TITLE) {
        edges {
          node {
            id
            title
            variants(first: 1) {
              edges { node { price } }
            }
          }
        }
      }
    }
  `);
  const data = await response.json();
  const products = data.data?.products?.edges?.map((e: any) => ({
    id: e.node.id,
    title: e.node.title,
    price: parseFloat(e.node.variants?.edges?.[0]?.node?.price ?? "0"),
  })) ?? [];

  return json({ canAdd: check.allowed, reason: check.reason, products, current: check.current, limit: check.limit });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  console.info("[competitive.add] action hit", { shop: session.shop, method: request.method });
  const paidAccess = await hasPaidModulesAccess(session.shop);
  if (!paidAccess.allowed) {
    return redirect("/app/billing?source=competitive");
  }
  const formData = await request.formData();

  const shopifyProductIdRaw = (formData.get("shopifyProductId") as string | null)?.trim() ?? "";
  const manualProductTitle = (formData.get("manualProductTitle") as string | null)?.trim() ?? "";
  const myCurrentPrice = parseFloat(formData.get("myCurrentPrice") as string || "0");
  const competitorUrl = (formData.get("competitorUrl") as string || "").trim();
  const competitorName = (formData.get("competitorName") as string || "").trim();

  let shopifyProductId = shopifyProductIdRaw;
  let shopifyProductTitle = "Produit Shopify";

  // Validations de base
  if ((!shopifyProductId && !manualProductTitle) || !competitorUrl || !competitorName) {
    return json({ error: "Tous les champs sont obligatoires." }, { status: 400 });
  }

  // Fallback: boutique sans produit Shopify sélectionnable
  if (!shopifyProductId && manualProductTitle) {
    shopifyProductId = `manual:${Date.now()}`;
    shopifyProductTitle = manualProductTitle;
  }

  let urlObj: URL;
  try {
    urlObj = new URL(competitorUrl);
  } catch {
    return json({ error: "L'URL du concurrent n'est pas valide (ex: https://monsite.com/produit)." }, { status: 400 });
  }

  // Vérification limite plan
  const check = await canAddWatchedProduct(session.shop);
  if (!check.allowed) {
    return json({ error: check.reason }, { status: 403 });
  }

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ error: "Boutique introuvable." }, { status: 404 });

  if (!shopifyProductId.startsWith("manual:")) {
    try {
      const productResp = await admin.graphql(
        `#graphql
        query ProductTitle($id: ID!) {
          product(id: $id) {
            title
          }
        }`,
        { variables: { id: shopifyProductId } },
      );
      const productJson = await productResp.json();
      const title = productJson?.data?.product?.title;
      if (typeof title === "string" && title.trim()) {
        shopifyProductTitle = title.trim();
      }
    } catch {
      // Ne bloque pas la création si Shopify ne renvoie pas le produit.
    }
  }

  // Premier scraping pour récupérer le prix initial
  let initialPrice: number | null = null;
  let scrapeError: string | null = null;

  try {
    const scraped = await scrapeProductPrice(competitorUrl);
    if (scraped.price) initialPrice = scraped.price;
    else scrapeError = scraped.error;
  } catch {
    scrapeError = "Impossible de contacter le site concurrent.";
  }

  // Création du produit surveillé
  const watchedProduct = await prisma.watchedProduct.create({
    data: {
      shopId: shop.id,
      shopifyProductId,
      shopifyProductTitle,
      competitorUrl,
      competitorName,
      competitorDomain: urlObj.hostname,
      myCurrentPrice: myCurrentPrice > 0 ? myCurrentPrice : null,
      lastPrice: initialPrice,
      lastCheckedAt: initialPrice ? new Date() : null,
    },
  });

  // Si on a récupéré un prix, on crée le premier snapshot
  if (initialPrice) {
    await prisma.priceSnapshot.create({
      data: {
        watchedProductId: watchedProduct.id,
        price: initialPrice,
        currency: "EUR",
      },
    });
  }

  // Redirection avec message de succès (ou avertissement si scraping raté)
  const params = new URLSearchParams();
  if (scrapeError) params.set("warn", "Prix non récupéré automatiquement. Vérifiez l'URL.");
  return redirect(`/app/competitive?${params.toString()}`);
};

export default function AddCompetitorPage() {
  const { canAdd, reason, products, current, limit } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  return (
    <Page
      title="Ajouter un produit concurrent"
      backAction={{ content: "Competitive Watcher", url: "/app/competitive" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {actionData?.error ? (
                <Banner tone="critical">
                  <Text as="p">{actionData.error}</Text>
                </Banner>
              ) : !canAdd ? (
                <Banner tone="warning">
                  <Text as="p">
                    {reason} ({current}/{limit === -1 ? "illimité" : limit})
                  </Text>
                  <Button url="/app/billing">Upgrader le plan</Button>
                </Banner>
              ) : (
                <Banner tone="info">
                  <Text as="p">
                    Sélectionnez un produit, puis renseignez le concurrent et son URL produit.
                  </Text>
                </Banner>
              )}

              <form id="competitive-add-form" method="post">
              <FormLayout>

                {/* Sélection du produit du marchand */}
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">Votre produit</Text>
                  {products.length > 0 ? (
                    <select
                      name="shopifyProductId"
                      defaultValue=""
                      style={{
                        width: "100%",
                        minHeight: 40,
                        border: "1px solid #c9cccf",
                        borderRadius: 8,
                        padding: "8px 10px",
                        background: "#ffffff",
                      }}
                    >
                      <option value="" disabled>
                        Choisir un produit Shopify...
                      </option>
                      {products.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.title} {p.price > 0 ? `- ${p.price} EUR` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <label>
                      <Text as="span" variant="bodyMd">Nom de votre produit</Text>
                      <input
                        type="text"
                        name="manualProductTitle"
                        placeholder="Ex: T-shirt coton premium"
                        style={{
                          width: "100%",
                          minHeight: 40,
                          marginTop: 6,
                          border: "1px solid #c9cccf",
                          borderRadius: 8,
                          padding: "8px 10px",
                        }}
                      />
                    </label>
                  )}
                </BlockStack>

                <label>
                  <Text as="span" variant="bodyMd">Mon prix actuel</Text>
                  <input
                    type="number"
                    name="myCurrentPrice"
                    step="0.01"
                    min="0"
                    placeholder="29.90"
                    style={{
                      width: "100%",
                      minHeight: 40,
                      marginTop: 6,
                      border: "1px solid #c9cccf",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  />
                </label>

                <label>
                  <Text as="span" variant="bodyMd">Nom du concurrent</Text>
                  <input
                    type="text"
                    name="competitorName"
                    placeholder="ex: Amazon, CDiscount, concurrent-shop.fr"
                    style={{
                      width: "100%",
                      minHeight: 40,
                      marginTop: 6,
                      border: "1px solid #c9cccf",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  />
                </label>

                <label>
                  <Text as="span" variant="bodyMd">URL du produit chez le concurrent</Text>
                  <input
                    type="url"
                    name="competitorUrl"
                    placeholder="https://www.concurrent.fr/produit/ref-123"
                    style={{
                      width: "100%",
                      minHeight: 40,
                      marginTop: 6,
                      border: "1px solid #c9cccf",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  />
                  <Text as="p" variant="bodySm" tone="subdued">
                    L'URL exacte de la page produit à surveiller. Le prix sera extrait automatiquement.
                  </Text>
                </label>

                <div>
                  <input
                    type="submit"
                    value={isSubmitting ? "Vérification du prix en cours..." : "Ajouter la surveillance"}
                    disabled={isSubmitting}
                    style={{
                      background: "#111827",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontWeight: 600,
                      cursor: isSubmitting ? "not-allowed" : "pointer",
                      opacity: isSubmitting ? 0.6 : 1,
                    }}
                  />
                </div>
              </FormLayout>
              </form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h3">Conseils</Text>
              <Text variant="bodySm" as="p">
                <strong>URL directe</strong> : utilisez l'URL exacte de la page
                produit (pas la page d'accueil ni une catégorie).
              </Text>
              <Text variant="bodySm" as="p">
                <strong>Sites compatibles</strong> : fonctionne avec la majorité
                des boutiques Shopify, WooCommerce et sites avec JSON-LD.
              </Text>
              <Text variant="bodySm" as="p">
                <strong>Fréquence</strong> : vérification automatique 1x/jour.
                Vous pouvez aussi lancer une vérification manuelle depuis le
                dashboard.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
