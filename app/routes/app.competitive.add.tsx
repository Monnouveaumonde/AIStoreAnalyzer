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
import { useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
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
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { canAddWatchedProduct } from "../services/competitive/watcher.server";
import { scrapeProductPrice } from "../services/competitive/price-scraper.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const check = await canAddWatchedProduct(session.shop);

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
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const shopifyProductId = formData.get("shopifyProductId") as string;
  const shopifyProductTitle = formData.get("shopifyProductTitle") as string;
  const myCurrentPrice = parseFloat(formData.get("myCurrentPrice") as string || "0");
  const competitorUrl = (formData.get("competitorUrl") as string || "").trim();
  const competitorName = (formData.get("competitorName") as string || "").trim();

  // Validations de base
  if (!shopifyProductId || !competitorUrl || !competitorName) {
    return json({ error: "Tous les champs sont obligatoires." }, { status: 400 });
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
  const { canAdd, reason, products } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedProductTitle, setSelectedProductTitle] = useState("");
  const [myPrice, setMyPrice] = useState("");
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [competitorName, setCompetitorName] = useState("");

  const isSubmitting = navigation.state === "submitting";

  const handleProductSelect = (id: string) => {
    const product = products.find((p: any) => p.id === id);
    if (product) {
      setSelectedProductId(product.id);
      setSelectedProductTitle(product.title);
      setMyPrice(product.price > 0 ? product.price.toString() : "");
    }
  };

  const handleSubmit = () => {
    const data = new FormData();
    data.set("shopifyProductId", selectedProductId);
    data.set("shopifyProductTitle", selectedProductTitle);
    data.set("myCurrentPrice", myPrice);
    data.set("competitorUrl", competitorUrl);
    data.set("competitorName", competitorName);
    submit(data, { method: "post" });
  };

  return (
    <Page
      title="Ajouter un produit concurrent"
      backAction={{ content: "Competitive Watcher", url: "/app/competitive" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {!canAdd && (
                <Banner tone="warning">
                  <Text as="p">{reason}</Text>
                  <Button url="/app/billing">Upgrader le plan</Button>
                </Banner>
              )}

              {actionData?.error && (
                <Banner tone="critical">
                  <Text as="p">{actionData.error}</Text>
                </Banner>
              )}

              <FormLayout>
                {/* Sélection du produit du marchand */}
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">Votre produit</Text>
                  <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e1e3e5", borderRadius: "8px" }}>
                    {products.map((p: any) => (
                      <Box
                        key={p.id}
                        padding="200"
                        background={selectedProductId === p.id ? "bg-surface-selected" : undefined}
                      >
                        <button
                          type="button"
                          onClick={() => handleProductSelect(p.id)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "4px 8px",
                          }}
                        >
                          <InlineStack align="space-between">
                            <Text variant="bodyMd" as="span">{p.title}</Text>
                            <Text variant="bodySm" as="span" tone="subdued">{p.price} €</Text>
                          </InlineStack>
                        </button>
                      </Box>
                    ))}
                  </div>
                  {selectedProductTitle && (
                    <Text variant="bodySm" as="p" tone="success">
                      ✓ Sélectionné : {selectedProductTitle}
                    </Text>
                  )}
                </BlockStack>

                <TextField
                  label="Mon prix actuel"
                  type="number"
                  value={myPrice}
                  onChange={setMyPrice}
                  suffix="€"
                  helpText="Votre prix de vente actuel pour ce produit"
                  autoComplete="off"
                />

                <TextField
                  label="Nom du concurrent"
                  value={competitorName}
                  onChange={setCompetitorName}
                  placeholder="ex: Amazon, CDiscount, concurrent-shop.fr"
                  autoComplete="off"
                />

                <TextField
                  label="URL du produit chez le concurrent"
                  value={competitorUrl}
                  onChange={setCompetitorUrl}
                  type="url"
                  placeholder="https://www.concurrent.fr/produit/ref-123"
                  helpText="L'URL exacte de la page produit à surveiller. Le prix sera extrait automatiquement."
                  autoComplete="off"
                />

                <Button
                  variant="primary"
                  disabled={!canAdd || !selectedProductId || !competitorUrl || !competitorName || isSubmitting}
                  onClick={handleSubmit}
                  loading={isSubmitting}
                >
                  {isSubmitting ? "Vérification du prix en cours..." : "Ajouter la surveillance"}
                </Button>
              </FormLayout>
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
