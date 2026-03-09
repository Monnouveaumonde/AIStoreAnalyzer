# Guide de déploiement — AI Store Analyzer
## Shopify App Store Ready

---

## ÉTAPE 1 — Créer l'app sur Shopify Partners

1. Allez sur https://partners.shopify.com
2. **Apps** → **Create app** → **Create app manually**
3. Nom : `AI Store Analyzer`
4. Copiez votre **Client ID** (API key) et **Client secret** (API secret)
5. Dans **App setup** → **URLs** → laissez vide pour l'instant (on remplira après déploiement)

---

## ÉTAPE 2 — Déploiement sur Railway (recommandé)

### 2.1 Créer un compte Railway
- Allez sur https://railway.app
- Connectez-vous avec GitHub

### 2.2 Déployer depuis GitHub

```bash
# 1. Initialisez le repo Git (si pas déjà fait)
cd "C:\Users\Monno\Desktop\AI Store Analyzer"
git init
git add .
git commit -m "feat: initial AI Store Analyzer"

# 2. Créez un repo sur GitHub (github.com → New repository)
#    Nom suggéré : ai-store-analyzer
#    Visibilité : Private

# 3. Poussez vers GitHub
git remote add origin https://github.com/VOTRE_USERNAME/ai-store-analyzer.git
git branch -M main
git push -u origin main
```

### 2.3 Sur Railway
1. **New Project** → **Deploy from GitHub repo**
2. Sélectionnez `ai-store-analyzer`
3. Railway détecte automatiquement le `Dockerfile` ✅
4. Attendez le premier build (2-3 minutes)
5. Allez dans **Settings** → **Networking** → **Generate Domain**
6. Copiez l'URL générée : `https://ai-store-analyzer-production.up.railway.app`

### 2.4 Variables d'environnement sur Railway
Dans votre projet Railway → **Variables** → ajoutez chacune :

```
DATABASE_URL=prisma+postgres://accelerate.prisma-data.net/?api_key=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqd3RfaWQiOjEsInNlY3VyZV9rZXkiOiJza19Sal9xMnFFVkExaVNSOE9JZEVPMm4iLCJhcGlfa2V5IjoiMDFLSzkyVjk1QzgxNzBWVkhLUU04MUEzNTMiLCJ0ZW5hbnRfaWQiOiJmYmNlZWJhZDY1MGE5Yjc3NGMyYTcyNGJjZmUzMjk3NWJlOGI1YjYxMjUzNDdhZjI5OTExNzkyYjM0YzY0NWI4IiwiaW50ZXJuYWxfc2VjcmV0IjoiZGM3MmVkY2QtMGUyNC00MTExLWFjMWYtZGRhNTNmMDZhZmJjIn0.2w5C8vuj4_-XHxJ8iD3wxhOiw5tvzcfXzeGpuFF0gGQ

SHOPIFY_API_KEY=VOTRE_CLIENT_ID_SHOPIFY
SHOPIFY_API_SECRET=VOTRE_CLIENT_SECRET_SHOPIFY
SCOPES=read_products,read_orders,read_themes,read_content,read_discounts,read_price_rules

HOST=https://ai-store-analyzer-production.up.railway.app
SHOPIFY_APP_URL=https://ai-store-analyzer-production.up.railway.app
APP_URL=https://ai-store-analyzer-production.up.railway.app

NODE_ENV=production

# Optionnel — IA coaching
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Optionnel — vitesse
GOOGLE_PAGESPEED_API_KEY=AIza...
```

---

## ÉTAPE 3 — Configurer Shopify Partners avec l'URL Railway

Une fois Railway déployé et l'URL obtenue :

### 3.1 Mettre à jour shopify.app.toml
```toml
name = "AI Store Analyzer"
client_id = "VOTRE_VRAI_CLIENT_ID"
application_url = "https://ai-store-analyzer-production.up.railway.app"

[access_scopes]
scopes = "read_products,read_orders,read_themes,read_content,read_discounts,read_price_rules"

[auth]
redirect_urls = [
  "https://ai-store-analyzer-production.up.railway.app/auth/callback",
  "https://ai-store-analyzer-production.up.railway.app/auth/shopify/callback",
  "https://ai-store-analyzer-production.up.railway.app/api/auth/callback"
]

[webhooks]
api_version = "2025-01"

  [[webhooks.subscriptions]]
  topics = [ "app/uninstalled" ]
  uri = "/webhooks"

  [[webhooks.subscriptions]]
  topics = [ "shop/update" ]
  uri = "/webhooks"

  [[webhooks.subscriptions]]
  topics = [ "customers/data_request", "customers/redact", "shop/redact" ]
  uri = "/webhooks"
  compliance_topics = true
```

### 3.2 Mettre à jour dans Shopify Partners Dashboard
1. Allez dans votre app → **App setup**
2. **App URL** : `https://ai-store-analyzer-production.up.railway.app`
3. **Allowed redirection URL(s)** :
   ```
   https://ai-store-analyzer-production.up.railway.app/auth/callback
   https://ai-store-analyzer-production.up.railway.app/auth/shopify/callback
   https://ai-store-analyzer-production.up.railway.app/api/auth/callback
   ```
4. **Sauvegardez**

### 3.3 Déployer la config Shopify
```bash
cd "C:\Users\Monno\Desktop\AI Store Analyzer"
npx shopify app deploy
```

---

## ÉTAPE 4 — Tester l'installation sur une boutique de dev

1. Dans Shopify Partners → votre app → **Test your app**
2. Sélectionnez votre boutique de développement
3. **Install app** → vous devriez être redirigé vers votre app Railway
4. Vérifiez que le dashboard s'affiche correctement
5. Lancez une analyse → vérifiez que le score s'affiche

---

## ÉTAPE 5 — Pages obligatoires pour l'App Store

Créez ces deux pages publiques sur votre domaine Railway :

### 5.1 Page Privacy Policy — `/privacy`
Créez le fichier `app/routes/privacy.tsx` :

```tsx
export default function PrivacyPolicy() {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <title>Politique de confidentialité — AI Store Analyzer</title>
      </head>
      <body style={{ fontFamily: "sans-serif", maxWidth: "800px", margin: "40px auto", padding: "0 20px" }}>
        <h1>Politique de confidentialité</h1>
        <p>Dernière mise à jour : Mars 2026</p>

        <h2>Données collectées</h2>
        <p>AI Store Analyzer collecte uniquement :</p>
        <ul>
          <li>Le domaine de votre boutique Shopify (identifiant unique)</li>
          <li>Les données de vos produits, pages et collections (lecture seule)</li>
          <li>Les scores et résultats d'analyse générés</li>
        </ul>
        <p><strong>Aucune donnée personnelle de vos clients n'est collectée ou stockée.</strong></p>

        <h2>Utilisation des données</h2>
        <p>Les données sont utilisées exclusivement pour générer les analyses SEO et les recommandations d'optimisation.</p>

        <h2>Suppression des données</h2>
        <p>À la désinstallation de l'app, toutes vos données sont automatiquement supprimées dans les 30 jours conformément aux exigences Shopify GDPR.</p>

        <h2>Contact</h2>
        <p>Pour toute question : support@ai-store-analyzer.com</p>
      </body>
    </html>
  );
}
```

### 5.2 Page Support — `/support`
```tsx
export default function Support() {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <title>Support — AI Store Analyzer</title>
      </head>
      <body style={{ fontFamily: "sans-serif", maxWidth: "800px", margin: "40px auto", padding: "0 20px" }}>
        <h1>Support AI Store Analyzer</h1>
        <p>Besoin d'aide ? Contactez-nous :</p>
        <ul>
          <li>Email : support@ai-store-analyzer.com</li>
          <li>Réponse sous 24h (jours ouvrés)</li>
        </ul>
        <h2>FAQ</h2>
        <h3>Comment lancer une analyse ?</h3>
        <p>Depuis le dashboard → bouton "Lancer ma première analyse".</p>
        <h3>Combien d'analyses par mois ?</h3>
        <p>Plan Free : 3 / Pro : 20 / Growth : illimité.</p>
      </body>
    </html>
  );
}
```

---

## ÉTAPE 6 — Soumission Shopify App Store

### Checklist finale avant soumission

```
[ ] URL Railway opérationnelle (HTTPS ✅)
[ ] Installation testée sur boutique dev
[ ] shopify.app.toml : client_id réel + URLs réelles
[ ] Page /privacy accessible publiquement
[ ] Page /support accessible publiquement
[ ] shopify.app.toml : privacy_policy et support_url renseignés
[ ] Screenshots préparés (min. 3 captures d'écran 1280×800)
[ ] Vidéo de démonstration (optionnel mais recommandé, 30-60s)
[ ] Description App Store rédigée (FR + EN)
[ ] Plans tarifaires configurés dans Shopify Partners
```

### Dans Shopify Partners Dashboard
1. Votre app → **Distribution** → **Shopify App Store**
2. Renseignez :
   - **App name** : AI Store Analyzer
   - **Tagline** : Analysez et optimisez votre boutique Shopify avec l'IA
   - **Description** : (voir ci-dessous)
   - **Screenshots** : 3 minimum (dashboard, rapport, score)
   - **Privacy policy URL** : `https://votre-url.up.railway.app/privacy`
   - **Support URL** : `https://votre-url.up.railway.app/support`
3. **Submit for review**

### Description App Store suggérée
```
AI Store Analyzer analyse votre boutique Shopify en quelques secondes et 
génère un Store Score sur 100 avec des recommandations IA personnalisées.

✅ 7 dimensions analysées : SEO, Vitesse, Produits, Conversion, UX, Trust, Prix
✅ Détection automatique des opportunités de revenus (+15% en moyenne)
✅ Coaching IA avec plan d'action sur 30 jours
✅ Competitive Watcher : surveillez les prix de vos concurrents
✅ SEO Optimizer : corrigez automatiquement vos balises meta en 1 clic
✅ Rapport viral partageable pour attirer de nouveaux clients

Plan Free disponible — Aucune carte bancaire requise.
```

---

## ÉTAPE 7 — Domaine personnalisé (optionnel)

Pour une URL professionnelle (`app.ai-store-analyzer.com`) :

### Sur Railway
1. Settings → Networking → **Custom domain**
2. Entrez votre domaine
3. Ajoutez le CNAME dans votre DNS (Railway vous donne la valeur)

### Achat domaine recommandé
- **Namecheap** (~10$/an)
- **Cloudflare Registrar** (prix coûtant, + protection DDoS gratuite)

---

## Résumé des coûts mensuels

| Service | Coût | Notes |
|---------|------|-------|
| Railway (Hobby) | $5/mois | Ou gratuit avec quota limité |
| Prisma Accelerate | Gratuit | Jusqu'à 6M requêtes/mois |
| OpenAI GPT-4o-mini | ~$2-10/mois | Selon volume d'analyses |
| Domaine | ~$1/mois | Optionnel |
| **Total** | **~$8-16/mois** | |

Avec 10 abonnés Pro ($19/mois) → **ROI positif dès le premier mois**.
