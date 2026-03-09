import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Badge,
  InlineStack,
  Box,
  Button,
  EmptyState,
  IndexTable,
  ProgressBar,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!shop) {
    return json({ analyses: [] });
  }

  const analyses = await prisma.analysis.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      opportunities: true,
    },
  });

  return json({
    analyses: analyses.map((a) => ({
      id: a.id,
      overallScore: a.overallScore,
      seoScore: a.seoScore,
      speedScore: a.speedScore,
      productScore: a.productScore,
      conversionScore: a.conversionScore,
      uxScore: a.uxScore,
      trustScore: a.trustScore,
      pricingScore: a.pricingScore,
      opportunityCount: a.opportunities.length,
      shareSlug: a.shareSlug,
      createdAt: a.createdAt,
    })),
  });
};

export default function HistoryPage() {
  const { analyses } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  if (analyses.length === 0) {
    return (
      <Page title="Historique des analyses" backAction={{ content: "Dashboard", url: "/app" }}>
        <Card>
          <EmptyState
            heading="Aucune analyse"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            action={{ content: "Lancer une analyse", url: "/app/analyze" }}
          >
            <p>Lancez votre première analyse pour voir l'historique ici.</p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  const scoreBadge = (score: number) => {
    const tone = score >= 70 ? "success" : score >= 40 ? "warning" : "critical";
    return <Badge tone={tone}>{Math.round(score)}</Badge>;
  };

  const rowMarkup = analyses.map((analysis: any, index: number) => (
    <IndexTable.Row
      id={analysis.id}
      key={analysis.id}
      position={index}
      onClick={() => navigate(`/app/report/${analysis.id}`)}
    >
      <IndexTable.Cell>
        <Text variant="bodyMd" as="p" fontWeight="semibold">
          {new Date(analysis.createdAt).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="100" blockAlign="center">
          {scoreBadge(analysis.overallScore)}
          <Box minInlineSize="60px">
            <ProgressBar
              progress={analysis.overallScore}
              tone={analysis.overallScore >= 70 ? "success" : analysis.overallScore >= 40 ? "warning" : "critical"}
              size="small"
            />
          </Box>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>{scoreBadge(analysis.seoScore)}</IndexTable.Cell>
      <IndexTable.Cell>{scoreBadge(analysis.speedScore)}</IndexTable.Cell>
      <IndexTable.Cell>{scoreBadge(analysis.productScore)}</IndexTable.Cell>
      <IndexTable.Cell>{scoreBadge(analysis.trustScore)}</IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone="attention">{analysis.opportunityCount}</Badge>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page title="Historique des analyses" backAction={{ content: "Dashboard", url: "/app" }}>
      <Card>
        <IndexTable
          itemCount={analyses.length}
          headings={[
            { title: "Date" },
            { title: "Score global" },
            { title: "SEO" },
            { title: "Vitesse" },
            { title: "Produits" },
            { title: "Trust" },
            { title: "Opportunités" },
          ]}
          selectable={false}
        >
          {rowMarkup}
        </IndexTable>
      </Card>
    </Page>
  );
}
