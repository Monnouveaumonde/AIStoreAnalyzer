# Guide — Créer une version de l'app ShopPulseAI

Une **version** est un snapshot de la configuration de votre app (scopes, webhooks, URLs) enregistré chez Shopify. Elle ne déploie pas votre code — votre app tourne déjà sur Railway.

---

## Prérequis avant de créer la version

- [ ] App créée sur Shopify Partners (Client ID et Secret récupérés)
- [ ] App déployée sur Railway et fonctionnelle
- [ ] `shopify.app.toml` mis à jour avec les vraies valeurs

---

## Méthode 1 : Via la CLI Shopify (recommandé)

### Étape 1 : Mettre à jour shopify.app.toml

Remplacez dans `shopify.app.toml` :

| Champ | Valeur |
|-------|--------|
| `name` | `ShopPulseAI` |
| `client_id` | Votre Client ID (ex: `a1b2c3d4e5f6...`) |
| `application_url` | `https://VOTRE-URL.up.railway.app` |
| Toutes les URLs `your-app-url` | `https://VOTRE-URL.up.railway.app` |

### Étape 2 : Lier le projet à l'app (si pas déjà fait)

```bash
cd "C:\Users\Monno\Desktop\AI Store Analyzer"
shopify app config link
```

- Choisissez **Use an existing app**
- Sélectionnez **ShopPulseAI** (ou le nom de votre app)
- Le `client_id` sera mis à jour automatiquement dans le fichier

### Étape 3 : Créer et publier la version

```bash
shopify app deploy
```

Options utiles :

| Option | Effet |
|--------|-------|
| `--version 1.0.0` | Nom de version personnalisé |
| `--message "Première version"` | Message interne |
| `--no-release` | Crée la version sans la publier tout de suite |

Exemple :
```bash
shopify app deploy --version 1.0.0 --message "Version initiale ShopPulseAI"
```

### Étape 4 : Vérifier

- Dans **Shopify Partners** → votre app → **Versions** : la nouvelle version apparaît
- Les marchands qui installent l'app reçoivent cette configuration

---

## Méthode 2 : Via le Dashboard (Dev Dashboard)

1. Allez sur **https://dev.shopify.com/dashboard**
2. Cliquez sur votre app **ShopPulseAI**
3. Menu **Versions** (ou **Versions** dans la sidebar)
4. Cliquez sur **Create a version**
5. (Optionnel) Saisissez un nom et un message
6. Cliquez sur **Release**

> ⚠️ Cette méthode ne crée que la config. Si vous avez des extensions (theme, etc.), utilisez la CLI.

---

## Méthode 3 : Soumettre pour l'App Store (créer une fiche)

Pour publier sur l'App Store Shopify, il faut **créer une fiche** et soumettre pour review :

### 1. Accéder à la page de soumission

1. **Shopify Partners** → **Apps** → **ShopPulseAI**
2. **Distribution** → **Shopify App Store**
3. **Create listing** (ou **App Store listing**)

### 2. Remplir la fiche obligatoire

| Champ | Exemple |
|-------|---------|
| **App name** | ShopPulseAI |
| **Tagline** | Analyse, SEO et veille concurrentielle propulsés par l'IA |
| **Description** | Texte décrivant les fonctionnalités |
| **Primary language** | English (ou Français) |
| **App icon** | 1200 x 1200 px (JPEG / PNG) |
| **Screenshots** | 3 à 8 captures (1280 x 720 px min) |
| **Privacy policy URL** | `https://VOTRE-URL.up.railway.app/privacy` |
| **Support URL** | `https://VOTRE-URL.up.railway.app/support` |

### 3. Configuration requise

- **Contact d'urgence** : email + téléphone
- **API contact email** : sans le mot "Shopify"
- **Webhooks de conformité** : déjà configurés dans le fichier

### 4. Lancer les vérifications automatiques

- Sur la page de soumission, cliquez sur **Run automated checks**
- Corrigez les erreurs éventuelles

### 5. Soumettre pour review

- Cliquez sur **Submit for review**
- Vérifiez que `app-submissions@shopify.com` est dans vos expéditeurs autorisés

---

## Résumé des commandes

```bash
# 1. Lier le projet
shopify app config link

# 2. Créer et publier la version
shopify app deploy --version 1.0.0 --message "Version initiale ShopPulseAI"
```

---

## Ordre recommandé

1. Mettre à jour `shopify.app.toml` (nom, URL, client_id)
2. `shopify app config link` si besoin
3. `shopify app deploy` pour créer la version
4. Tester sur une boutique de dev
5. Créer la fiche App Store et soumettre pour review
