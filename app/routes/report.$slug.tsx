import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import prisma from "../db.server";
import { checkRateLimit, RATE_LIMITS } from "../lib/rate-limit.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) return [{ title: "Rapport introuvable" }];
  const score = Math.round(data.analysis.overallScore);
  const shop = data.analysis.shopName;
  return [
    { title: `Store Score: ${score}/100 — ${shop} | ShopPulseAi` },
    {
      name: "description",
      content: `Analyse complète de ${shop}: Score ${score}/100. Découvrez les opportunités de revenus et améliorez votre boutique Shopify.`,
    },
    { property: "og:title", content: `${shop} a obtenu ${score}/100 sur ShopPulseAi` },
    {
      property: "og:description",
      content: `${data.analysis.opportunityCount} opportunités de revenus détectées. Analysez votre boutique gratuitement !`,
    },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ];
};

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { slug } = params;

  // Rate limiting : 30 vues/minute par IP (protection anti-scraping)
  if (checkRateLimit(request, RATE_LIMITS.PUBLIC_REPORT)) {
    throw new Response("Trop de requêtes. Réessayez dans une minute.", { status: 429 });
  }

  const analysis = await prisma.analysis.findUnique({
    where: { shareSlug: slug },
    include: {
      opportunities: { orderBy: { impactPercent: "desc" } },
      shop: true,
    },
  });

  if (!analysis || !analysis.isPublic) {
    throw new Response("Rapport introuvable", { status: 404 });
  }

  const benchmarks = await prisma.benchmarkData.findMany();
  const avgScore =
    benchmarks.find((b) => b.metric === "overall_score")?.averageValue || 55;

  return json({
    analysis: {
      overallScore: analysis.overallScore,
      seoScore: analysis.seoScore,
      speedScore: analysis.speedScore,
      productScore: analysis.productScore,
      conversionScore: analysis.conversionScore,
      uxScore: analysis.uxScore,
      trustScore: analysis.trustScore,
      pricingScore: analysis.pricingScore,
      shopName: analysis.shop.shopName || analysis.shop.shopDomain,
      shopDomain: analysis.shop.shopDomain,
      opportunityCount: analysis.opportunities.length,
      opportunities: analysis.opportunities.map((o) => ({
        title: o.title,
        description: o.description,
        estimatedImpact: o.estimatedImpact,
        impactPercent: o.impactPercent,
        priority: o.priority,
        category: o.category,
      })),
      createdAt: analysis.createdAt,
    },
    benchmark: {
      averageScore: avgScore,
    },
  });
};

export default function PublicReport() {
  const { analysis, benchmark } = useLoaderData<typeof loader>();
  const score = Math.round(analysis.overallScore);
  const avgScore = Math.round(benchmark.averageScore);
  const diff = score - avgScore;

  const scoreColor = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";

  const totalImpact = analysis.opportunities.reduce(
    (acc: number, o: any) => acc + o.impactPercent,
    0
  );

  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {/* Font Inter via CDN Shopify officiel — approuvé Shopify App Store */}
        <link rel="preconnect" href="https://cdn.shopify.com" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <style dangerouslySetInnerHTML={{ __html: publicReportStyles }} />
      </head>
      <body>
        <div className="report-container">
          {/* Header */}
          <header className="report-header">
            <div className="logo">ShopPulseAi</div>
            <p className="subtitle">Rapport d'analyse Shopify</p>
          </header>

          {/* Score principal */}
          <section className="score-hero">
            <h1 className="shop-name">{analysis.shopName}</h1>
            <div className="score-circle" style={{ borderColor: scoreColor }}>
              <span className="score-value" style={{ color: scoreColor }}>{score}</span>
              <span className="score-label">/100</span>
            </div>
            <div className="score-comparison">
              {diff > 0 ? (
                <span className="positive">+{diff} pts au-dessus de la moyenne Shopify ({avgScore}/100)</span>
              ) : diff < 0 ? (
                <span className="negative">{diff} pts en dessous de la moyenne Shopify ({avgScore}/100)</span>
              ) : (
                <span>Dans la moyenne Shopify ({avgScore}/100)</span>
              )}
            </div>
          </section>

          {/* Scores détaillés */}
          <section className="scores-grid">
            <h2>Scores par catégorie</h2>
            <div className="grid">
              {[
                { label: "SEO", score: analysis.seoScore, icon: "🔍" },
                { label: "Vitesse", score: analysis.speedScore, icon: "⚡" },
                { label: "Produits", score: analysis.productScore, icon: "📦" },
                { label: "Conversion", score: analysis.conversionScore, icon: "💰" },
                { label: "UX", score: analysis.uxScore, icon: "🎨" },
                { label: "Trust", score: analysis.trustScore, icon: "🛡️" },
                { label: "Prix", score: analysis.pricingScore, icon: "💲" },
              ].map((item) => {
                const c = item.score >= 70 ? "#22c55e" : item.score >= 40 ? "#f59e0b" : "#ef4444";
                return (
                  <div key={item.label} className="score-card">
                    <span className="icon">{item.icon}</span>
                    <span className="card-score" style={{ color: c }}>
                      {Math.round(item.score)}
                    </span>
                    <span className="card-label">{item.label}</span>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${item.score}%`, background: c }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Opportunités */}
          <section className="opportunities">
            <h2>
              {analysis.opportunityCount} opportunités de revenus détectées
              <span className="impact-badge">+{totalImpact}% potentiel</span>
            </h2>
            <div className="opp-list">
              {analysis.opportunities.map((opp: any, i: number) => (
                <div key={i} className="opp-card">
                  <div className="opp-header">
                    <span className={`priority priority-${opp.priority.toLowerCase()}`}>
                      {opp.priority}
                    </span>
                    <span className="opp-impact">+{opp.impactPercent}%</span>
                  </div>
                  <h3>{opp.title}</h3>
                  <p>{opp.description}</p>
                  <p className="impact-text">{opp.estimatedImpact}</p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section className="cta-section">
            <h2>Corrigez automatiquement ces problèmes</h2>
            <p>
              Installez ShopPulseAi et obtenez un coaching IA personnalisé
              avec des actions concrètes pour booster vos ventes.
            </p>
            <a
              href="https://apps.shopify.com/ai-store-analyzer"
              className="cta-button"
              target="_blank"
              rel="noopener noreferrer"
            >
              Installer l'app Shopify gratuitement
            </a>
            <p className="cta-sub">3 analyses gratuites par mois — Sans engagement</p>
          </section>

          {/* Footer */}
          <footer className="report-footer">
            <p>
              Généré le{" "}
              {new Date(analysis.createdAt).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}{" "}
              par ShopPulseAi
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}

const publicReportStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f8fafc;
    color: #1e293b;
    line-height: 1.6;
  }
  .report-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
  }
  .report-header {
    text-align: center;
    padding: 40px 0 20px;
  }
  .logo {
    font-size: 24px;
    font-weight: 800;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .subtitle { color: #64748b; margin-top: 4px; }
  .score-hero {
    text-align: center;
    padding: 40px 0;
  }
  .shop-name {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 24px;
  }
  .score-circle {
    width: 160px;
    height: 160px;
    border-radius: 50%;
    border: 6px solid;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
    background: white;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  }
  .score-value { font-size: 48px; font-weight: 800; }
  .score-label { font-size: 18px; color: #94a3b8; }
  .score-comparison { font-size: 14px; color: #64748b; }
  .positive { color: #22c55e; font-weight: 600; }
  .negative { color: #ef4444; font-weight: 600; }
  .scores-grid { margin: 40px 0; }
  .scores-grid h2 { font-size: 20px; margin-bottom: 16px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
  }
  .score-card {
    background: white;
    border-radius: 12px;
    padding: 16px;
    text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .icon { font-size: 24px; }
  .card-score { font-size: 28px; font-weight: 700; }
  .card-label { font-size: 13px; color: #64748b; }
  .progress-bar {
    width: 100%;
    height: 4px;
    background: #e2e8f0;
    border-radius: 2px;
    margin-top: 4px;
  }
  .progress-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }
  .opportunities { margin: 40px 0; }
  .opportunities h2 { font-size: 20px; margin-bottom: 16px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .impact-badge {
    background: #dcfce7;
    color: #16a34a;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
  }
  .opp-list { display: flex; flex-direction: column; gap: 12px; }
  .opp-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .opp-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
  .priority {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }
  .priority-critical { background: #fee2e2; color: #dc2626; }
  .priority-high { background: #fef3c7; color: #d97706; }
  .priority-medium { background: #dbeafe; color: #2563eb; }
  .priority-low { background: #f1f5f9; color: #64748b; }
  .opp-impact {
    background: #dcfce7;
    color: #16a34a;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
  }
  .opp-card h3 { font-size: 16px; margin-bottom: 6px; }
  .opp-card p { font-size: 14px; color: #475569; }
  .impact-text { color: #16a34a !important; font-weight: 600; margin-top: 8px; }
  .cta-section {
    text-align: center;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
    padding: 48px 32px;
    border-radius: 16px;
    margin: 40px 0;
  }
  .cta-section h2 { font-size: 24px; margin-bottom: 12px; }
  .cta-section p { opacity: 0.9; margin-bottom: 20px; }
  .cta-button {
    display: inline-block;
    background: white;
    color: #6366f1;
    padding: 14px 32px;
    border-radius: 8px;
    font-weight: 700;
    font-size: 16px;
    text-decoration: none;
    transition: transform 0.2s;
  }
  .cta-button:hover { transform: scale(1.05); }
  .cta-sub { font-size: 13px; opacity: 0.7; margin-top: 12px; }
  .report-footer {
    text-align: center;
    padding: 32px 0;
    color: #94a3b8;
    font-size: 13px;
  }
  @media (max-width: 600px) {
    .grid { grid-template-columns: repeat(2, 1fr); }
    .score-circle { width: 120px; height: 120px; }
    .score-value { font-size: 36px; }
    .cta-section { padding: 32px 16px; }
  }
`;
