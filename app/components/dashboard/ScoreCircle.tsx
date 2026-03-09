import { Box, BlockStack, Text, ProgressBar } from "@shopify/polaris";

interface ScoreCircleProps {
  score: number;
  label: string;
  size?: "small" | "medium" | "large";
}

export function ScoreCircle({ score, label, size = "medium" }: ScoreCircleProps) {
  const tone = score >= 70 ? "success" : score >= 40 ? "warning" : "critical";
  const fontSize = size === "large" ? "headingXl" : size === "small" ? "headingMd" : "headingLg";

  return (
    <Box padding="300" borderWidth="025" borderColor="border" borderRadius="200">
      <BlockStack gap="200" align="center" inlineAlign="center">
        <Text variant={fontSize as any} as="p" alignment="center" fontWeight="bold">
          {Math.round(score)}
        </Text>
        <ProgressBar progress={score} tone={tone} size="small" />
        <Text variant="bodySm" as="p" alignment="center" tone="subdued">
          {label}
        </Text>
      </BlockStack>
    </Box>
  );
}
