import { Box, BlockStack, InlineStack, Text, Badge } from "@shopify/polaris";

interface Opportunity {
  id: string;
  title: string;
  description: string;
  estimatedImpact: string;
  impactPercent: number;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category: string;
}

interface OpportunityCardProps {
  opportunity: Opportunity;
}

const priorityTone: Record<string, "critical" | "warning" | "info" | "success"> = {
  CRITICAL: "critical",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "success",
};

export function OpportunityCard({ opportunity }: OpportunityCardProps) {
  return (
    <Box padding="300" borderWidth="025" borderColor="border" borderRadius="200">
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Badge tone={priorityTone[opportunity.priority] ?? "info"}>
              {opportunity.priority}
            </Badge>
            <Text variant="headingSm" as="h4">
              {opportunity.title}
            </Text>
          </InlineStack>
          <Badge tone={priorityTone[opportunity.priority] ?? "info"}>
            {opportunity.priority === "CRITICAL" ? "Impact majeur" : opportunity.priority === "HIGH" ? "Impact élevé" : "Impact modéré"}
          </Badge>
        </InlineStack>
        <Text variant="bodyMd" as="p">
          {opportunity.description}
        </Text>
        <Text variant="bodySm" as="p" tone="subdued">
          {opportunity.estimatedImpact}
        </Text>
      </BlockStack>
    </Box>
  );
}
