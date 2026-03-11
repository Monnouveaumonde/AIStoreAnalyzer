/**
 * support.tsx — Page de support publique.
 * URL : /support
 * OBLIGATOIRE pour la soumission Shopify App Store.
 */
import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [
  { title: "Support — ShopPulseAi" },
  { name: "robots", content: "index, follow" },
];

export default function SupportPage() {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
            background: #f8fafc; color: #1e293b; line-height: 1.7;
          }
          .container { max-width: 760px; margin: 0 auto; padding: 48px 24px; }
          h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
          h2 { font-size: 18px; font-weight: 600; margin: 32px 0 12px; color: #334155; }
          h3 { font-size: 16px; font-weight: 600; margin: 20px 0 6px; }
          p, li { font-size: 15px; color: #475569; margin-bottom: 8px; }
          ul { padding-left: 20px; }
          .badge {
            display: inline-block; background: #ede9fe; color: #6d28d9;
            padding: 4px 12px; border-radius: 20px; font-size: 13px;
            font-weight: 500; margin-bottom: 24px;
          }
          .contact-card {
            background: white; border: 1px solid #e2e8f0; border-radius: 12px;
            padding: 24px; margin: 16px 0;
          }
          .plans-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
          .plans-table th, .plans-table td {
            border: 1px solid #e2e8f0; padding: 10px 14px;
            text-align: left; font-size: 14px;
          }
          .plans-table th { background: #f1f5f9; font-weight: 600; }
          .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #e2e8f0;
            font-size: 13px; color: #94a3b8; }
        `}</style>
      </head>
      <body>
        <div className="container">
          <div className="badge">ShopPulseAi</div>
          <h1>Centre de support</h1>
          <p>Besoin d'aide ? Nous sommes là pour vous.</p>

          <h2>Contact</h2>
          <div className="contact-card">
            <p>📧 <strong>Email</strong> : support@ai-store-analyzer.com</p>
            <p>⏱ <strong>Délai de réponse</strong> : sous 24h (jours ouvrés)</p>
            <p>🌐 <strong>Langue</strong> : Français et Anglais</p>
          </div>

          <h2>Plans disponibles</h2>
          <table className="plans-table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Prix</th>
                <th>Analyses/mois</th>
                <th>Fonctionnalités</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Free</td>
                <td>Gratuit</td>
                <td>3</td>
                <td>Score global, recommandations de base</td>
              </tr>
              <tr>
                <td>Pro</td>
                <td>$19/mois</td>
                <td>20</td>
                <td>Rapport complet, coaching IA, rapport viral, SEO Optimizer</td>
              </tr>
              <tr>
                <td>Growth</td>
                <td>$49/mois</td>
                <td>Illimité</td>
                <td>Tout Pro + Competitive Watcher illimité, benchmarking, alertes</td>
              </tr>
            </tbody>
          </table>

          <h2>FAQ</h2>

          <h3>Comment lancer une analyse ?</h3>
          <p>Depuis le dashboard → cliquez sur "Lancer ma première analyse". L'analyse prend 15 à 30 secondes.</p>

          <h3>Que signifie le Store Score ?</h3>
          <p>C'est une note sur 100 qui évalue 7 dimensions de votre boutique : SEO, Vitesse, Produits, Conversion, UX, Trust et Prix. Plus le score est élevé, plus votre boutique est optimisée.</p>

          <h3>Comment fonctionne le Competitive Watcher ?</h3>
          <p>Ajoutez l'URL d'un produit chez votre concurrent. L'app vérifie automatiquement son prix 1x/jour et vous envoie une alerte si le prix change.</p>

          <h3>Le SEO Optimizer peut-il modifier mon site automatiquement ?</h3>
          <p>Oui. Depuis le rapport SEO, cliquez "Appliquer sur Shopify" sur chaque suggestion pour appliquer automatiquement la correction (meta title, meta description, alt text).</p>

          <h3>Comment annuler mon abonnement ?</h3>
          <p>Dans l'app → Abonnement → "Annuler". La résiliation prend effet à la fin de la période en cours. Aucun remboursement partiel.</p>

          <h3>Mes données sont-elles sécurisées ?</h3>
          <p>Oui. Aucune donnée client n'est stockée. Toutes les données sont chiffrées. Voir notre <a href="/privacy">politique de confidentialité</a>.</p>

          <div className="footer">
            <p>© 2026 ShopPulseAi — <a href="/privacy">Confidentialité</a></p>
          </div>
        </div>
      </body>
    </html>
  );
}
