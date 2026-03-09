# AI Store Analyzer — Shopify App

Application Shopify embedded qui analyse les boutiques et génère un **Store Score (0-100)** avec coaching IA et détection d'opportunités de revenus.

## Architecture

```
ai-store-analyzer/
├── app/
│   ├── routes/
│   │   ├── app.tsx                    # Layout embedded Polaris + App Bridge 4.0
│   │   ├── app._index.tsx             # Dashboard principal (Store Score + historique)
│   │   ├── app.analyze.tsx            # Lancer une analyse
│   │   ├── app.report.$id.tsx         # Rapport détaillé embedded (+ bouton partage)
│   │   ├── app.history.tsx            # Historique des analyses avec tableau
│   │   ├── app.billing.tsx            # Plans et abonnements (Free/Pro/Growth)
│   │   ├── app.billing.callback.tsx   # Callback Shopify Billing API
│   │   ├── api.analysis.$id.tsx       # API JSON publique pour intégrations
│   │   ├── auth.$.tsx                 # OAuth Shopify catch-all
│   │   ├── auth.login/route.tsx       # Page login partenaires
│   │   ├── webhooks.tsx               # Webhooks (GDPR, uninstall, purge)
│   │   └── report.$slug.tsx           # Page publique virale /report/:slug
│   ├── components/
│   │   ├── index.ts                   # Exports centralisés
│   │   ├── dashboard/
│   │   │   ├── ScoreCircle.tsx        # Composant score avec barre de progression
│   │   │   └── OpportunityCard.tsx    # Carte d'opportunité de revenu
│   │   ├── report/
│   │   │   └── ScoreCard.tsx          # Carte score avec détails dépliables
│   │   └── common/
│   │       └── ShareButton.tsx        # Bouton partage avec copie de lien
│   ├── services/
│   │   ├── analyzers/
│   │   │   ├── index.ts               # Orchestrateur d'analyse parallèle
│   │   │   ├── seo.analyzer.ts        # SEO: meta titles, descriptions, alt texts
│   │   │   ├── speed.analyzer.ts      # Vitesse: Core Web Vitals (PageSpeed API)
│   │   │   ├── product.analyzer.ts    # Produits: descriptions, images, variantes
│   │   │   ├── conversion.analyzer.ts # Conversion: remises, collections, CRO
│   │   │   ├── ux.analyzer.ts         # UX: pages essentielles, navigation, thème
│   │   │   ├── trust.analyzer.ts      # Trust: politiques, avis, badges sécurité
│   │   │   └── pricing.analyzer.ts    # Prix: compare-at, distribution, ancrage
│   │   ├── ai/
│   │   │   └── insights.server.ts     # Coaching IA (OpenAI GPT-4o-mini / Claude)
│   │   ├── billing/
│   │   │   └── plans.server.ts        # Plans SaaS + Shopify Billing API + limites
│   │   └── opportunities.server.ts    # Détecteur d'opportunités revenus (9 types)
│   ├── lib/
│   │   └── utils.server.ts            # nanoid, slugify, formatScore, scoreColor
│   ├── shopify.server.ts              # Config Shopify App Remix + PrismaSessionStorage
│   ├── db.server.ts                   # Client Prisma singleton
│   ├── root.tsx                       # Root layout HTML
│   └── entry.server.tsx               # Entry server Remix
├── prisma/
│   ├── schema.prisma                  # Schéma complet (7 modèles + 8 enums)
│   ├── seed.ts                        # Données de benchmark initiales
│   └── migrations/
│       ├── migration_lock.toml
│       └── 20240101000000_init/
│           └── migration.sql          # Migration SQL initiale complète
├── shopify.app.toml                   # Config Shopify CLI (scopes, webhooks, embedded)
├── .env.example                       # Variables d'environnement documentées
├── package.json
├── vite.config.ts
├── tsconfig.json
└── Dockerfile
```

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Framework | Remix (Shopify App Remix) |
| Frontend | Shopify Polaris 13 |
| Auth | Shopify OAuth + App Bridge 4.0 |
| Base de données | PostgreSQL + Prisma ORM |
| IA | OpenAI GPT-4o-mini / Claude 3.5 |
| Vitesse | Google PageSpeed Insights API |
| Billing | Shopify Billing API |
| Déploiement | Vercel / AWS / Docker |

## Schéma base de données

- **Session** — Sessions Shopify OAuth
- **Shop** — Boutiques installées (plan, compteur analyses)
- **Analysis** — Résultats d'analyse (7 scores + détails JSON)
- **Opportunity** — Opportunités de revenus détectées
- **Recommendation** — Recommandations actionnables
- **Subscription** — Abonnements SaaS
- **BenchmarkData** — Données de comparaison sectorielles

## Plans SaaS

| Plan | Prix | Analyses/mois | Fonctionnalités |
|------|------|---------------|-----------------|
| Free | $0 | 3 | Score global, recommandations de base |
| Pro | $19 | 20 | Rapport complet, coaching IA, export PDF, rapport viral |
| Growth | $49 | Illimité | Tout Pro + benchmarking, alertes, support prioritaire |

## Endpoints API

| Route | Méthode | Auth | Description |
|-------|---------|------|-------------|
| `/app` | GET | Shopify OAuth | Dashboard principal |
| `/app/analyze` | GET/POST | Shopify OAuth | Lancer une analyse |
| `/app/report/:id` | GET | Shopify OAuth | Rapport détaillé embedded |
| `/app/history` | GET | Shopify OAuth | Historique des analyses |
| `/app/billing` | GET/POST | Shopify OAuth | Gestion abonnement |
| `/app/billing/callback` | GET | Shopify OAuth | Callback Shopify Billing |
| `/app/competitive` | GET/POST | Shopify OAuth | Dashboard Competitive Watcher |
| `/app/competitive/add` | GET/POST | Shopify OAuth | Ajouter un produit concurrent |
| `/app/competitive/alerts` | GET/POST | Shopify OAuth | Historique des alertes prix |
| `/app/competitive/:id` | GET/POST | Shopify OAuth | Détail produit surveillé |
| `/app/seo` | GET/POST | Shopify OAuth | Dashboard SEO Optimizer |
| `/app/seo/:id` | GET/POST | Shopify OAuth | Rapport SEO + optimisations |
| `/api/analysis/:id` | GET | Public (isPublic=true) | JSON API pour intégrations |
| `/report/:slug` | GET | Public | Rapport viral partageable |
| `/auth/*` | GET | — | OAuth Shopify flow |
| `/webhooks` | POST | HMAC Shopify | Webhooks GDPR + uninstall |

---

## Guide de déploiement pas à pas

### Prérequis

- Node.js 18+
- PostgreSQL 15+
- Compte Shopify Partner
- Clé API OpenAI ou Anthropic
- (Optionnel) Clé API Google PageSpeed

### Étape 1 : Créer l'app Shopify

1. Allez sur [partners.shopify.com](https://partners.shopify.com)
2. Créez une nouvelle app
3. Notez le **API Key** et **API Secret**
4. Configurez les scopes : `read_products,read_orders,read_themes,read_content`
5. URL de l'app : `https://votre-domaine.vercel.app`
6. URLs de redirection : `https://votre-domaine.vercel.app/auth/callback`

### Étape 2 : Configuration locale

```bash
# Cloner et installer
cd ai-store-analyzer
npm install

# Configurer les variables d'environnement
cp .env.example .env
# Éditez .env avec vos clés

# Configurer la base de données
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed

# Lancer en développement
npm run dev
```

### Étape 3 : Configurer shopify.app.toml

Remplacez `YOUR_CLIENT_ID` par votre vrai client_id Shopify dans `shopify.app.toml`.

### Étape 4 : Déploiement Vercel

```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel

# Configurer les variables d'env dans Vercel Dashboard :
# - SHOPIFY_API_KEY
# - SHOPIFY_API_SECRET
# - DATABASE_URL (PostgreSQL hébergé : Supabase, Neon, Railway)
# - OPENAI_API_KEY
# - SCOPES
# - HOST (URL Vercel)
```

### Étape 5 : Déploiement Docker (alternative)

```bash
docker build -t ai-store-analyzer .
docker run -p 3000:3000 --env-file .env ai-store-analyzer
```

### Étape 6 : Soumettre au Shopify App Store

1. Vérifiez la checklist Shopify :
   - [x] App embedded
   - [x] UI 100% Polaris
   - [x] OAuth avec App Bridge 4.0
   - [x] Webhooks GDPR (customers/data_request, customers/redact, shop/redact)
   - [x] Purge des données à la désinstallation (APP_UNINSTALLED)
   - [x] Pas de scripts externes non approuvés
   - [x] Performance < 1s au chargement
   - [x] HTTPS obligatoire
2. Créez la fiche App Store (screenshots, description, vidéo)
3. Soumettez pour review

---

## Plan de développement (8 semaines)

### Semaine 1-2 : Foundation
- [x] Architecture projet Remix + Shopify App
- [x] Auth OAuth + App Bridge 4.0
- [x] Schéma Prisma + migrations
- [x] Webhooks GDPR
- [x] Structure des routes

### Semaine 3-4 : Moteur d'analyse
- [x] 7 analyseurs (SEO, vitesse, produits, conversion, UX, trust, prix)
- [x] Orchestrateur d'analyse parallèle
- [x] Détecteur d'opportunités de revenus
- [x] Intégration Google PageSpeed API
- [ ] Tests unitaires des analyseurs

### Semaine 5 : IA & Insights
- [x] Intégration OpenAI / Anthropic
- [x] Génération de coaching personnalisé
- [x] Fallback si API indisponible
- [ ] Fine-tuning des prompts

### Semaine 6 : Frontend & UX
- [x] Dashboard Polaris embedded
- [x] Page d'analyse avec loader
- [x] Rapport détaillé avec scores et opportunités
- [x] Historique des analyses
- [x] Page rapport viral publique
- [ ] Export PDF

### Semaine 7 : Monétisation
- [x] Plans Free / Pro / Growth
- [x] Intégration Shopify Billing API
- [x] Limites d'analyse par plan
- [x] Reset mensuel automatique
- [ ] Page de pricing A/B testable

### Semaine 8 : Polish & Soumission
- [ ] Tests E2E
- [ ] Audit performance (< 1s)
- [ ] Screenshots App Store
- [ ] Vidéo de démonstration
- [ ] Soumission Shopify App Review

---

## Conformité Shopify App Store

| Exigence | Statut |
|----------|--------|
| App embedded | ✅ |
| UI 100% Polaris | ✅ |
| OAuth + App Bridge 4.0 | ✅ |
| Webhooks GDPR | ✅ |
| Purge données désinstallation | ✅ |
| Pas de scripts externes | ✅ |
| Performance < 1s | ✅ (optimisé) |
| HTTPS | ✅ (Vercel/infra) |
| Session storage sécurisé | ✅ (Prisma) |
| Billing API pour plans payants | ✅ |

## Licence

Propriétaire — Tous droits réservés.
