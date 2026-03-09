import OpenAI from "openai";
import type { FullAnalysisResult } from "../analyzers";
import type { OpportunityData } from "../opportunities.server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateAiInsights(
  analysis: FullAnalysisResult,
  opportunities: OpportunityData[],
  shopDomain: string
): Promise<string> {
  const provider = process.env.AI_PROVIDER || "openai";

  const prompt = buildPrompt(analysis, opportunities, shopDomain);

  if (provider === "anthropic") {
    return generateWithAnthropic(prompt);
  }

  return generateWithOpenAI(prompt);
}

function buildPrompt(
  analysis: FullAnalysisResult,
  opportunities: OpportunityData[],
  shopDomain: string
): string {
  return `Tu es un expert e-commerce Shopify. Analyse les données suivantes pour la boutique "${shopDomain}" et génère un coaching business personnalisé.

## Scores d'analyse
- Score global: ${analysis.overallScore}/100
- SEO: ${analysis.seo.score}/100
- Vitesse: ${analysis.speed.score}/100
- Pages produits: ${analysis.products.score}/100
- Conversion: ${analysis.conversion.score}/100
- UX: ${analysis.ux.score}/100
- Trust: ${analysis.trust.score}/100
- Prix: ${analysis.pricing.score}/100

## Problèmes détectés
${[
  ...analysis.seo.issues,
  ...analysis.products.issues,
  ...analysis.conversion.issues,
  ...analysis.trust.issues,
  ...analysis.ux.issues,
  ...analysis.pricing.issues,
].map(i => `- ${i}`).join("\n")}

## Opportunités de revenus
${opportunities.map(o => `- ${o.title}: ${o.estimatedImpact}`).join("\n")}

## Instructions
Génère un rapport de coaching avec:
1. **Diagnostic rapide** (2-3 phrases résumant la situation)
2. **Top 3 actions prioritaires** avec étapes concrètes
3. **Quick wins** réalisables en moins de 30 minutes
4. **Projection de revenus** si les recommandations sont appliquées
5. **Plan d'action sur 30 jours**

Sois concis, actionnable et motivant. Utilise des chiffres concrets.
Réponds en français.`;
}

async function generateWithOpenAI(prompt: string): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Tu es un consultant e-commerce senior spécialisé Shopify. Tu donnes des conseils concrets, actionnables et basés sur les données.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    });

    return completion.choices[0]?.message?.content || "Analyse en cours...";
  } catch (error) {
    console.error("OpenAI API error:", error);
    return generateFallbackInsights(prompt);
  }
}

async function generateWithAnthropic(prompt: string): Promise<string> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    return data.content?.[0]?.text || "Analyse en cours...";
  } catch (error) {
    console.error("Anthropic API error:", error);
    return generateFallbackInsights(prompt);
  }
}

function generateFallbackInsights(prompt: string): string {
  return `## Diagnostic

Votre boutique présente des axes d'amélioration significatifs. Voici les actions prioritaires identifiées par notre algorithme.

## Actions prioritaires

1. **Optimisez vos fiches produits** — Enrichissez les descriptions avec des bénéfices clients et du storytelling
2. **Renforcez la confiance** — Ajoutez des avis clients, des badges de sécurité et une politique de retour visible
3. **Améliorez le SEO** — Complétez les meta titles et descriptions pour chaque produit

## Quick wins (< 30 min)

- Ajoutez une politique de retour claire
- Complétez les textes alternatifs des images
- Activez un code promo de bienvenue

*Connectez une clé API IA pour obtenir un coaching personnalisé plus détaillé.*`;
}
