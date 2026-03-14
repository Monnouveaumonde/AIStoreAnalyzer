/**
 * seo-ai.server.ts
 *
 * Service IA pour le SEO Optimizer.
 * Génère automatiquement :
 *  - Meta titles optimisés (50-60 car.)
 *  - Meta descriptions engageantes (120-160 car.)
 *  - Textes alternatifs descriptifs pour les images
 *
 * Respecte les bonnes pratiques SEO : mot-clé principal en début,
 * call-to-action dans la description, description d'image précise.
 */

export interface GeneratedMetaTitle {
  value: string;
  charCount: number;
  keyword: string;
}

export interface GeneratedMetaDescription {
  value: string;
  charCount: number;
}

export interface GeneratedAltText {
  value: string;
}

/**
 * Génère un meta title optimisé SEO pour un produit/page.
 */
export async function generateMetaTitle(input: {
  resourceTitle: string;
  resourceType: "product" | "page" | "collection";
  currentTitle: string | null;
  shopName: string;
  bodyText?: string;
}): Promise<GeneratedMetaTitle> {
  const prompt = `Tu es un expert SEO e-commerce. Génère un meta title optimisé.

Ressource (${input.resourceType}) : "${input.resourceTitle}"
${input.currentTitle ? `Meta title actuel : "${input.currentTitle}"` : "Pas de meta title actuel."}
${input.bodyText ? `Extrait de contenu : ${input.bodyText.substring(0, 200)}` : ""}
Boutique : ${input.shopName}

Règles STRICTES :
- Entre 50 et 60 caractères EXACTEMENT
- Mot-clé principal en début de titre
- Inclure le nom de la boutique à la fin si possible (avec " | " ou " - ")
- Pas d'emoji, pas de majuscules abusives
- Naturel et descriptif

Réponds UNIQUEMENT avec le meta title, sans explication, sans guillemets.`;

  try {
    const result = await callAI(prompt, 80);
    const clean = result.trim().replace(/^["']|["']$/g, "");
    if (clean.length >= 5) {
      return {
        value: clean,
        charCount: clean.length,
        keyword: input.resourceTitle.split(" ")[0],
      };
    }
  } catch {
    // Fallback ci-dessous
  }
  const fallback = generateFallbackMetaTitle(input.resourceTitle, input.shopName);
  return { value: fallback, charCount: fallback.length, keyword: input.resourceTitle.split(" ")[0] };
}

/**
 * Génère une meta description optimisée pour un produit/page.
 */
export async function generateMetaDescription(input: {
  resourceTitle: string;
  resourceType: "product" | "page" | "collection";
  currentDescription: string | null;
  bodyText?: string;
  shopName: string;
}): Promise<GeneratedMetaDescription> {
  const prompt = `Tu es un expert SEO et copywriting e-commerce. Génère une meta description optimisée.

Ressource (${input.resourceType}) : "${input.resourceTitle}"
${input.currentDescription ? `Description actuelle : "${input.currentDescription}"` : "Pas de description actuelle."}
${input.bodyText ? `Extrait de contenu : ${input.bodyText.substring(0, 300)}` : ""}

Règles STRICTES :
- Entre 120 et 155 caractères EXACTEMENT
- Inclure un call-to-action (ex: "Découvrez", "Commandez", "En stock")
- Mentionner les bénéfices clés, pas juste les caractéristiques
- Pas d'emoji
- Ton persuasif mais naturel

Réponds UNIQUEMENT avec la meta description, sans explication, sans guillemets.`;

  try {
    const result = await callAI(prompt, 200);
    const clean = result.trim().replace(/^["']|["']$/g, "");
    if (clean.length >= 10) {
      return { value: clean, charCount: clean.length };
    }
  } catch {
    // Fallback ci-dessous
  }
  const fallback = generateFallbackMetaDescription(input.resourceTitle, input.bodyText);
  return { value: fallback, charCount: fallback.length };
}

/**
 * Génère un texte alternatif descriptif pour une image produit.
 */
export async function generateAltText(input: {
  productTitle: string;
  imageUrl: string;
  imagePosition?: number;
  shopName: string;
}): Promise<GeneratedAltText> {
  const prompt = `Tu es un expert SEO. Génère un texte alternatif (alt text) pour une image produit.

Produit : "${input.productTitle}"
${input.imagePosition !== undefined ? `Image n°${input.imagePosition + 1} du produit` : ""}
Boutique : ${input.shopName}

Règles STRICTES :
- Entre 5 et 125 caractères
- Descriptif et précis (couleur, matière, angle si devinable)
- Inclure le nom du produit naturellement
- Pas de "Image de", "Photo de" en début
- Pas d'emoji
- En français

Réponds UNIQUEMENT avec l'alt text, sans explication, sans guillemets.`;

  try {
    const result = await callAI(prompt, 60);
    const clean = result.trim().replace(/^["']|["']$/g, "");
    if (clean.length >= 3) {
      return { value: clean };
    }
  } catch {
    // Fallback ci-dessous
  }
  return { value: `${input.productTitle} - ${input.shopName}` };
}

/**
 * Génère les suggestions SEO pour un lot d'issues (batch pour économiser les tokens).
 * Retourne une Map issueId -> suggestedValue.
 */
export async function batchGenerateSuggestions(
  issues: Array<{
    id: string;
    issueType: string;
    resourceTitle: string;
    resourceType: string;
    currentValue: string | null;
    bodyText?: string;
  }>,
  shopName: string
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // On traite en batch de 5 pour éviter de surcharger l'API
  const batchSize = 5;
  for (let i = 0; i < issues.length; i += batchSize) {
    const batch = issues.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (issue) => {
        try {
          let value: string;

          if (issue.issueType.includes("META_TITLE") || issue.issueType === "MISSING_META_TITLE") {
            const gen = await generateMetaTitle({
              resourceTitle: issue.resourceTitle,
              resourceType: issue.resourceType as any,
              currentTitle: issue.currentValue,
              shopName,
              bodyText: issue.bodyText,
            });
            value = gen.value;
          } else if (issue.issueType.includes("META_DESCRIPTION") || issue.issueType === "MISSING_META_DESCRIPTION") {
            const gen = await generateMetaDescription({
              resourceTitle: issue.resourceTitle,
              resourceType: issue.resourceType as any,
              currentDescription: issue.currentValue,
              shopName,
              bodyText: issue.bodyText,
            });
            value = gen.value;
          } else if (issue.issueType === "MISSING_ALT_TEXT") {
            const gen = await generateAltText({
              productTitle: issue.resourceTitle,
              imageUrl: issue.currentValue ?? "",
              shopName,
            });
            value = gen.value;
          } else {
            return; // Pas de génération IA pour ce type
          }

          results.set(issue.id, value);
        } catch {
          // Non-bloquant : si l'IA rate, l'issue reste sans suggestion
        }
      })
    );
  }

  return results;
}

// ── Appel API IA (OpenAI ou Anthropic) ───────────────────────────────────────

async function callAI(prompt: string, maxTokens: number): Promise<string> {
  const provider = process.env.AI_PROVIDER ?? "openai";

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.log("[seo-ai] Aucune clé API IA configurée (OPENAI_API_KEY / ANTHROPIC_API_KEY). Utilisation du fallback.");
    throw new Error("Pas de clé API IA");
  }

  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await resp.json();
    return data.content?.[0]?.text ?? "";
  }

  // OpenAI par défaut
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
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
          content: "Tu es un expert SEO e-commerce. Tu génères des textes optimisés SEO, concis et précis.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ── Fallbacks déterministes ───────────────────────────────────────────────────

function generateFallbackMetaTitle(title: string, shopName: string): string {
  const base = `${title} | ${shopName}`;
  return base.length <= 60 ? base : title.substring(0, 57 - shopName.length) + ` | ${shopName}`.substring(0, 20);
}

function generateFallbackMetaDescription(title: string, bodyText?: string): string {
  if (bodyText && bodyText.length >= 100) {
    const clean = bodyText.replace(/\s+/g, " ").trim();
    return clean.substring(0, 152) + "...";
  }
  return `Découvrez ${title}. Livraison rapide, qualité garantie. Commandez maintenant sur notre boutique.`;
}
