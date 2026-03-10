# Diagnostic — L'app ne fonctionne pas

## Test 1 : La route /health (sans auth, sans DB)

J'ai ajouté une route `/health` qui ne touche ni à la base ni à Shopify.

**Après avoir poussé le code et redéployé**, ouvrez :

```
https://aistoreanalyzer-production.up.railway.app/health
```

| Résultat | Signification |
|----------|---------------|
| **JSON avec `"status": "ok"`** | L'app tourne. Le souci vient probablement de l'OAuth ou de la DB. |
| **Erreur / pas de réponse** | L'app ne démarre pas ou ne répond pas (voir Test 2). |

---

## Test 2 : Pages publiques

Testez ces URLs (aucune authentification) :

- `https://aistoreanalyzer-production.up.railway.app/privacy`
- `https://aistoreanalyzer-production.up.railway.app/support`

| Résultat | Signification |
|----------|---------------|
| **Page affichée** | L'app répond. Le problème vient probablement du flux OAuth / app. |
| **Pas de réponse** | Problème de démarrage ou de port. |

---

## Test 3 : Logs Railway

1. **Railway** → votre projet → **Deployments**
2. Ouvrez le **dernier déploiement**
3. Onglet **Logs**

**À chercher :**

- `prisma migrate deploy` → messages d’erreur ?
- `Error` ou `ENOENT` ou `ECONNREFUSED`
- Lignes juste avant l’arrêt du process

**Exemples fréquents :**

```
Error: P1012: Environment variable not found: DATABASE_URL
→ Ajouter DATABASE_URL dans les Variables
```

```
Can't reach database server at `xxx.railway.app`
→ Vérifier l’URL, le réseau, le firewall de la base
```

```
Migration `xxx` failed to apply
→ Vérifier les migrations et l’état de la base
```

---

## Test 4 : Variables Railway

Dans **Railway** → **Variables**, vérifier que tout est bien défini :

| Variable | Présent ? | Exemple |
|----------|-----------|---------|
| DATABASE_URL | ✓ | `postgresql://postgres:xxx@xxx.railway.app:5432/railway` |
| SHOPIFY_API_KEY | ✓ | Longue chaîne (Client ID) |
| SHOPIFY_API_SECRET | ✓ | `shpss_xxx...` |
| SCOPES | ✓ | `read_products,read_orders,...` |
| HOST | ✓ | `https://aistoreanalyzer-production.up.railway.app` |
| SHOPIFY_APP_URL | ✓ | Idem |
| APP_URL | ✓ | Idem |
| NODE_ENV | ✓ | `production` |

---

## Test 5 : Configurer le health check Railway

1. **Railway** → votre service app → **Settings**
2. Section **Health check** (si disponible)
3. **Health check path** : `/health`

Railway utilisera `/health` pour vérifier que l’app répond avec un 200.

---

## Test 6 : Base PostgreSQL

1. **Railway** → un service **PostgreSQL** doit exister
2. Ouvrez ce service → **Variables**
3. Copiez `DATABASE_URL`
4. Collez-la dans les Variables de votre **service app**

---

## Ordre recommandé

1. Pousser le code (avec la route `/health`).
2. Redéployer sur Railway.
3. Ouvrir `https://aistoreanalyzer-production.up.railway.app/health`.
4. Consulter les logs si ça ne répond pas.
5. Vérifier les variables Railway et la base de données.

---

## Si /health répond correctement

Si `/health` renvoie du JSON, l’app démarre. Le souci vient probablement de :

- L’installation / OAuth Shopify
- Les URLs de redirection (Shopify Partners)
- Une erreur sur une route spécifique (app, auth, webhooks)

Indiquez ce que vous obtenez pour `/health` et les tests ci‑dessus.
