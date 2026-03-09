/**
 * price-ai.server.ts
 *
 * Génération de suggestions de prix intelligentes via OpenAI ou Anthropic.
 * Utilisé pour recommander une réaction au marchand quand un concurrent
 * change son prix ou lance une promotion.
 */

export interface PriceSuggestionInput {
  productTitle: string;
  myPrice: number | null;
  competitorPrice: number;
  competitorName: string;
  alertType: string;
  priceDiffPercent: number;
}

/**
 * Génère une suggestion de réaction tarifaire en langage naturel.
 * Retourne un fallback si l'IA est indisponible (pas de clé API configurée).
 */
export async function generatePriceSuggestion(
  input: PriceSuggestionInput
): Promise<string> {
  const provider = process.env.AI_PROVIDER || "openai";
  const prompt = buildPricePrompt(input);

  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return callAnthropic(prompt);
  }

  if (process.env.OPENAI_API_KEY) {
    return callOpenAI(prompt);
  }

  // Fallback déterministe si aucune clé IA n'est configurée
  return generateFallbackSuggestion(input);
}

function buildPricePrompt(input: PriceSuggestionInput): string {
  const myPriceInfo = input.myPrice
    ? `Mon prix actuel : ${input.myPrice} €`
    : "Mon prix actuel : non renseigné";

  const direction =
    input.alertType === "PRICE_DROP" || input.alertType === "PROMOTION_STARTED"
      ? `a BAISSÉ son prix de ${Math.abs(input.priceDiffPercent).toFixed(1)}%`
      : `a AUGMENTÉ son prix de ${input.priceDiffPercent.toFixed(1)}%`;

  return `Tu es un expert en pricing e-commerce. Un concurrent vient de changer son prix.

Produit : "${input.productTitle}"
${myPriceInfo}
Concurrent (${input.competitorName}) ${direction}
Nouveau prix concurrent : ${input.competitorPrice} €

Génère une recommandation courte (2-3 phrases max) et concrète pour le marchand :
- Doit-il ajuster son prix ? Si oui, vers quel montant ?
- Quelle est l'urgence (immédiat / dans la semaine / surveiller) ?
- Un conseil d'action rapide.

Réponds directement sans introduction, en français, de façon professionnelle et actionnable.`;
}

async function callOpenAI(prompt: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Tu es un consultant en stratégie tarifaire e-commerce. Tes conseils sont concis, chiffrés et immédiatement actionnables.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 250,
      temperature: 0.5,
    }),
    signal: AbortSignal.timeout(10000),
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? generateFallbackSuggestion({ alertType: "", priceDiffPercent: 0, myPrice: null, competitorPrice: 0, competitorName: "", productTitle: "" });
}

async function callAnthropic(prompt: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 250,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(10000),
  });

  const data = await response.json();
  return data.content?.[0]?.text ?? "";
}

function generateFallbackSuggestion(input: PriceSuggestionInput): string {
  const { alertType, priceDiffPercent, myPrice, competitorPrice } = input;

  if (alertType === "PRICE_DROP" || alertType === "PROMOTION_STARTED") {
    const myPriceVsCompetitor =
      myPrice && myPrice > competitorPrice
        ? `Votre prix (${myPrice} €) est maintenant supérieur au concurrent (${competitorPrice} €).`
        : `Votre prix est aligné ou inférieur au concurrent.`;

    return `${myPriceVsCompetitor} Si vous perdez des ventes, envisagez d'ajuster votre prix ou de mettre en avant votre valeur ajoutée (livraison, garantie, service). Action recommandée : surveiller vos conversions les 48h prochaines.`;
  }

  if (alertType === "PRICE_INCREASE") {
    return `Le concurrent a augmenté son prix de ${priceDiffPercent.toFixed(1)}%. C'est une opportunité : vous pouvez légèrement augmenter votre prix tout en restant compétitif, ou accentuer votre communication sur le rapport qualité-prix.`;
  }

  return "Surveillez l'évolution de ce changement et adaptez votre stratégie en fonction de vos marges.";
}
