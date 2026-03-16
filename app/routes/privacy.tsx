/**
 * privacy.tsx — Page de politique de confidentialité publique.
 * URL : /privacy
 * OBLIGATOIRE pour la soumission Shopify App Store.
 */
import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [
  { title: "Politique de confidentialité — ShopPulseAi" },
  { name: "robots", content: "index, follow" },
];

export default function PrivacyPolicy() {
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
          p, li { font-size: 15px; color: #475569; margin-bottom: 8px; }
          ul { padding-left: 20px; }
          .badge {
            display: inline-block; background: #ede9fe; color: #6d28d9;
            padding: 4px 12px; border-radius: 20px; font-size: 13px;
            font-weight: 500; margin-bottom: 24px;
          }
          .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #e2e8f0;
            font-size: 13px; color: #94a3b8; }
        `}</style>
      </head>
      <body>
        <div className="container">
          <div className="badge">ShopPulseAi</div>
          <h1>Politique de confidentialité</h1>
          <p>Dernière mise à jour : Mars 2026</p>

          <h2>1. Données collectées</h2>
          <p>ShopPulseAi collecte uniquement les données nécessaires au fonctionnement de l'application :</p>
          <ul>
            <li>Le domaine de votre boutique Shopify (identifiant unique)</li>
            <li>Les métadonnées de vos produits, pages et collections (lecture seule via API Shopify)</li>
            <li>Les scores et résultats d'analyse générés par notre algorithme</li>
            <li>Les informations d'abonnement (plan choisi, date d'installation)</li>
          </ul>
          <p><strong>Aucune donnée personnelle de vos clients n'est collectée, traitée ou stockée.</strong></p>

          <h2>2. Utilisation des données</h2>
          <p>Les données collectées sont utilisées exclusivement pour :</p>
          <ul>
            <li>Générer les analyses SEO, vitesse, et recommandations de votre boutique</li>
            <li>Calculer le Store Score et les opportunités d'amélioration</li>
            <li>Afficher l'historique de vos analyses dans le dashboard</li>
            <li>Gérer votre abonnement via Shopify Billing</li>
          </ul>

          <h2>3. Partage des données</h2>
          <p>Vos données ne sont jamais vendues ni partagées avec des tiers, à l'exception de :</p>
          <ul>
            <li><strong>Prisma (base de données)</strong> : stockage sécurisé des analyses</li>
            <li><strong>OpenAI / Anthropic</strong> (optionnel) : génération du coaching IA, sans données personnelles</li>
          </ul>

          <h2>4. Sécurité</h2>
          <p>Les connexions sont chiffrées via TLS/HTTPS. L'accès token Shopify est stocké de façon sécurisée et n'est jamais exposé.</p>

          <h2>5. Suppression des données (RGPD / Shopify GDPR)</h2>
          <p>À la désinstallation de l'application, vos données sont automatiquement supprimées dans les 30 jours conformément aux webhooks GDPR Shopify :</p>
          <ul>
            <li><code>customers/data_request</code> : aucune donnée client stockée</li>
            <li><code>customers/redact</code> : aucune donnée client à purger</li>
            <li><code>shop/redact</code> : suppression complète de toutes les données de la boutique</li>
          </ul>

          <h2>6. Contact</h2>
          <p>Pour toute question relative à vos données :</p>
          <ul>
            <li>Email : privacy@ai-store-analyzer.com</li>
            <li>Réponse sous 48h (jours ouvrés)</li>
          </ul>

          <div className="footer">
            <p>© 2026 ShopPulseAi — Tous droits réservés</p>
          </div>
        </div>
      </body>
    </html>
  );
}
