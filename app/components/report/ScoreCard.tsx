import { Card, BlockStack, InlineStack, Text, Badge, ProgressBar, Button, Box, Collapsible } from "@shopify/polaris";
import { useState } from "react";

interface ScoreCardProps {
  label: string;
  score: number;
  details?: Record<string, unknown>;
  issues?: string[];
  recommendations?: string[];
}

export function ScoreCard({ label, score, details, issues, recommendations }: ScoreCardProps) {
  const [open, setOpen] = useState(false);
  const tone = score >= 70 ? "success" : score >= 40 ? "warning" : "critical";

  const hasExtra = (issues && issues.length > 0) || (recommendations && recommendations.length > 0) || details;

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingMd" as="h3">{label}</Text>
          <Badge tone={tone}>{Math.round(score)}/100</Badge>
        </InlineStack>
        <ProgressBar progress={score} tone={tone} size="small" />

        {hasExtra && (
          <>
            <Button variant="plain" onClick={() => setOpen(!open)}>
              {open ? "Masquer les détails" : "Voir les détails"}
            </Button>
            <Collapsible open={open} id={`score-details-${label}`}>
              <BlockStack gap="200">
                {issues && issues.length > 0 && (
                  <Box padding="200" background="bg-surface-caution" borderRadius="100">
                    <BlockStack gap="100">
                      <Text variant="bodySm" as="p" fontWeight="semibold">Problèmes détectés :</Text>
                      {issues.map((issue, i) => (
                        <Text key={i} variant="bodySm" as="p">• {issue}</Text>
                      ))}
                    </BlockStack>
                  </Box>
                )}
                {recommendations && recommendations.length > 0 && (
                  <Box padding="200" background="bg-surface-success" borderRadius="100">
                    <BlockStack gap="100">
                      <Text variant="bodySm" as="p" fontWeight="semibold">Recommandations :</Text>
                      {recommendations.map((rec, i) => (
                        <Text key={i} variant="bodySm" as="p">✓ {rec}</Text>
                      ))}
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
            </Collapsible>
          </>
        )}
      </BlockStack>
    </Card>
  );
}
