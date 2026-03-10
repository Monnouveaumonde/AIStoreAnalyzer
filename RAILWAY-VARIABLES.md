# Configuration des variables Railway — AI Store Analyzer

## Où ajouter les variables

1. Ouvrez [railway.app](https://railway.app) → votre projet **AI Store Analyzer**
2. Cliquez sur votre **service** (le conteneur Docker)
3. Onglet **Variables** (ou **Settings** → **Variables**)

---

## Variables par priorité

### 🔴 OBLIGATOIRES (sans elles, l'app ne démarre pas)

| Variable | Exemple | Où la trouver |
|----------|---------|--------------|
| `DATABASE_URL` | `postgresql://postgres:xxx@xxx.railway.internal:5432/railway` | Voir section Base de données ci-dessous |
| `SHOPIFY_API_KEY` | `a1b2c3d4e5f6...` | [Shopify Partners](https://partners.shopify.com) → Apps → votre app → **Client ID** |
| `SHOPIFY_API_SECRET` | `shpss_xxxx...` | [Shopify Partners](https://partners.shopify.com) → Apps → votre app → **Client secret** |
| `SCOPES` | `read_products,read_orders,...` | Copier la valeur ci-dessous |
| `HOST` | `0.0.0.0` | **Railway** : remix-serve doit écouter sur 0.0.0.0. L'URL publique = SHOPIFY_APP_URL. |
| `SHOPIFY_APP_URL` | `https://VOTRE-URL.up.railway.app` | **Identique à HOST** |
| `APP_URL` | `https://VOTRE-URL.up.railway.app` | **Identique à HOST** |
| `NODE_ENV` | `production` | Toujours `production` en prod |

#### Valeur pour SCOPES (copier-coller)
```
read_products,read_orders,read_themes,read_content,read_discounts,read_price_rules
```

---

### 🟡 Base de données : 2 options

#### Option A — PostgreSQL Railway (recommandé pour démarrer)

1. Dans Railway : **+ New** → **Database** → **PostgreSQL**
2. Une fois créé, cliquez sur le service PostgreSQL
3. Onglet **Variables** ou **Connect** → copiez **`DATABASE_URL`**
4. Collez-la dans les variables de votre **service app** (pas dans le service Postgres)

Format typique :
```
postgresql://postgres:MOT_DE_PASSE@containers-us-west-xxx.railway.app:5432/railway
```

> ✅ L’app accepte directement les URLs `postgresql://` (Railway, Supabase, Neon, etc.)

#### Option B — Prisma Accelerate

1. Créez une base PostgreSQL (Railway, Supabase, Neon, etc.)
2. Allez sur [prisma.io/data-platform](https://www.prisma.io/data-platform)
3. Créez un projet et connectez votre base
4. Récupérez l’URL au format `prisma+postgres://accelerate.prisma-data.net/?api_key=xxx`
5. Utilisez cette URL comme `DATABASE_URL`

---

### 🟢 Optionnelles (pour les fonctionnalités avancées)

| Variable | Rôle | Où la trouver |
|----------|------|--------------|
| `OPENAI_API_KEY` | Coaching IA, insights | [platform.openai.com](https://platform.openai.com/api-keys) |
| `AI_PROVIDER` | `openai` ou `anthropic` | Par défaut : `openai` |
| `ANTHROPIC_API_KEY` | Si vous utilisez Claude | [console.anthropic.com](https://console.anthropic.com) |
| `GOOGLE_PAGESPEED_API_KEY` | Score vitesse | [Google Cloud Console](https://console.cloud.google.com/) |
| `SHOP_CUSTOM_DOMAIN` | Domaine custom | Si vous utilisez un domaine personnalisé |

---

## Exemple complet (copy-paste)

**Remplacez** les valeurs entre `<>` par vos vraies données :

```
DATABASE_URL=postgresql://postgres:<MOT_DE_PASSE>@<HOST>.railway.app:5432/railway
SHOPIFY_API_KEY=<VOTRE_CLIENT_ID>
SHOPIFY_API_SECRET=<VOTRE_CLIENT_SECRET>
SCOPES=read_products,read_orders,read_themes,read_content,read_discounts,read_price_rules
HOST=0.0.0.0
SHOPIFY_APP_URL=https://<VOTRE-PROJECT>.up.railway.app
APP_URL=https://<VOTRE-PROJECT>.up.railway.app
NODE_ENV=production
```

### Avec IA (optionnel)
```
OPENAI_API_KEY=sk-...
AI_PROVIDER=openai
```

### Avec PageSpeed (optionnel)
```
GOOGLE_PAGESPEED_API_KEY=AIza...
```

---

## Ordre de configuration recommandé

1. **Créer le projet Railway** et déployer depuis GitHub
2. **Générer le domaine** : Settings → Networking → Generate Domain → noter l’URL
3. **Ajouter PostgreSQL** : + New → Database → PostgreSQL
4. **Copier `DATABASE_URL`** du service Postgres vers le service app
5. **Récupérer les clés Shopify** : Partners → votre app → Client ID & Secret
6. **Renseigner toutes les variables** dans Variables du service app
7. **Redéployer** si besoin : Deployments → Redeploy

---

## Vérification

Après avoir ajouté les variables :

1. Railway redéploie automatiquement au prochain push
2. Ouvrez l’URL Railway : vous devriez voir une page de redirection vers Shopify (OAuth)
3. En cas d’erreur, consultez les **logs** : Railway → votre service → Deployments → cliquer sur le dernier → **View logs**

Erreurs fréquentes :
- `DATABASE_URL` manquante → migrations Prisma échouent
- `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` incorrects → OAuth échoue
- `HOST` / `SHOPIFY_APP_URL` différents de l’URL réelle → erreurs de redirection
