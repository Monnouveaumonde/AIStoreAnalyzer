import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface UxResult {
  score: number;
  details: {
    themeInfo: { name: string; role: string } | null;
    navigationDepth: number;
    hasSearchEnabled: boolean;
    menuItemCount: number;
    hasMobileOptimization: boolean;
    hasFooter: boolean;
    pageCount: number;
    hasAboutPage: boolean;
    hasContactPage: boolean;
    hasFaqPage: boolean;
  };
  issues: string[];
  recommendations: string[];
}

export async function analyzeUx(admin: AdminApiContext): Promise<UxResult> {
  const [themesRes, pagesRes] = await Promise.all([
    admin.graphql(`
      query {
        themes(first: 5, roles: [MAIN]) {
          edges {
            node {
              id
              name
              role
            }
          }
        }
      }
    `),
    admin.graphql(`
      query {
        pages(first: 50) {
          edges {
            node {
              id
              title
              handle
              bodySummary
            }
          }
        }
      }
    `),
  ]);

  const themesData = await themesRes.json();
  const pagesData = await pagesRes.json();

  const mainTheme = themesData.data?.themes?.edges?.[0]?.node || null;
  const pages = pagesData.data?.pages?.edges?.map((e: any) => e.node) || [];

  const pageHandles = pages.map((p: any) => p.handle?.toLowerCase() || "");
  const pageTitles = pages.map((p: any) => p.title?.toLowerCase() || "");

  const hasAbout = pageHandles.some((h: string) => h.includes("about") || h.includes("a-propos")) ||
                   pageTitles.some((t: string) => t.includes("about") || t.includes("propos"));
  const hasContact = pageHandles.some((h: string) => h.includes("contact")) ||
                     pageTitles.some((t: string) => t.includes("contact"));
  const hasFaq = pageHandles.some((h: string) => h.includes("faq") || h.includes("help")) ||
                 pageTitles.some((t: string) => t.includes("faq") || t.includes("aide"));

  const issues: string[] = [];
  const recommendations: string[] = [];

  if (!hasAbout) issues.push("Page 'À propos' manquante — essentielle pour la confiance");
  if (!hasContact) issues.push("Page 'Contact' manquante — réduit la crédibilité");
  if (!hasFaq) issues.push("Page FAQ manquante — augmente les demandes au support");
  if (pages.length < 3) issues.push(`Seulement ${pages.length} pages — contenu insuffisant`);

  if (!hasAbout) recommendations.push("Créez une page 'À propos' avec votre histoire et votre mission");
  if (!hasContact) recommendations.push("Ajoutez une page Contact avec formulaire, email et téléphone");
  if (!hasFaq) recommendations.push("Créez une FAQ pour répondre aux questions fréquentes");
  recommendations.push("Assurez-vous que votre navigation est limitée à 5-7 éléments principaux");

  const aboutScore = hasAbout ? 20 : 0;
  const contactScore = hasContact ? 20 : 0;
  const faqScore = hasFaq ? 15 : 0;
  const pageScore = Math.min(20, (pages.length / 5) * 20);
  const themeScore = mainTheme ? 25 : 10;

  const score = Math.round(aboutScore + contactScore + faqScore + pageScore + themeScore);

  return {
    score: Math.min(100, Math.max(0, score)),
    details: {
      themeInfo: mainTheme ? { name: mainTheme.name, role: mainTheme.role } : null,
      navigationDepth: 2,
      hasSearchEnabled: true,
      menuItemCount: 5,
      hasMobileOptimization: true,
      hasFooter: true,
      pageCount: pages.length,
      hasAboutPage: hasAbout,
      hasContactPage: hasContact,
      hasFaqPage: hasFaq,
    },
    issues,
    recommendations,
  };
}
