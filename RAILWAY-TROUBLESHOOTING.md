# Dépannage — Railway & Shopify

## 0. "L'application ne peut pas être chargée" (mal configurée)

**Cause fréquente** : les scopes dans `shopify.app.toml` ne correspondent pas à la variable `SCOPES` sur Railway.

**Solution** :
1. Dans **Railway** → Variables, vérifiez que `SCOPES` est **exactement** :
   ```
   read_content,read_discounts,read_orders,read_price_rules,read_products,read_themes
   ```
2. Pas d'espaces avant/après, pas de virgule en trop.
3. Exécutez `shopify app deploy` pour synchroniser la config avec Shopify Partners.
4. Redéployez sur Railway après avoir modifié les variables.

---

## 1. Consulter les logs (prioritaire)

1. **Railway** → votre projet → votre **service app**
2. **Deployments** → cliquez sur le dernier déploiement
3. **View logs** (ou onglet **Logs**)

Les logs indiquent la cause exacte. Erreurs fréquentes :

| Message dans les logs | Cause | Solution |
|-----------------------|-------|----------|
| `Environment variable not found: DATABASE_URL` | Variable manquante | Ajouter `DATABASE_URL` dans Variables |
| `Can't reach database server` | Connexion DB impossible | Vérifier l’URL, le réseau, le firewall |
| `P1012` / `schema validation` | `DATABASE_URL` invalide | Vérifier le format de l’URL |
| `Migration failed` | Problème de migrations | Vérifier que la base existe et est accessible |
| `Error: Invalid API key` | Clés Shopify manquantes | Ajouter `SHOPIFY_API_KEY` et `SHOPIFY_API_SECRET` |

---

## 2. Vérifier les variables obligatoires

Dans **Railway** → **Variables**, ces variables doivent être définies :

| Variable | Obligatoire | Format |
|----------|-------------|--------|
| `DATABASE_URL` | Oui | `postgresql://user:pass@host:5432/dbname` |
| `SHOPIFY_API_KEY` | Oui | Client ID (ex. `a1b2c3...`) |
| `SHOPIFY_API_SECRET` | Oui | Client secret (ex. `shpss_...`) |
| `SCOPES` | Oui | Doit correspondre EXACTEMENT à shopify.app.toml (voir RAILWAY-VARIABLES.md) |
| `HOST` | Oui | `https://votre-app.up.railway.app` |
| `SHOPIFY_APP_URL` | Oui | Identique à HOST |
| `APP_URL` | Oui | Identique à HOST |
| `NODE_ENV` | Oui | `production` |
| `PORT` | Non (Railway l’ajoute) | Si besoin : `3000` |

---

## 3. Vérifier la base de données

### Base PostgreSQL Railway

1. **Railway** → **+ New** → **Database** → **PostgreSQL**
2. Une fois créée, ouvrez le service PostgreSQL
3. **Variables** → copiez `DATABASE_URL`
4. Collez-la dans les variables du **service app** (pas dans le service Postgres)

### Format de l’URL

- Doit commencer par `postgresql://`
- Exemple : `postgresql://postgres:xxxxx@containers-us-west-xxx.railway.app:5432/railway`
- Vérifier qu’il n’y a pas d’espaces ou de caractères en trop

---

## 4. Premier déploiement : migrations

Au démarrage, l’app exécute `prisma migrate deploy`. Si la base est vide ou inaccessible, cela peut échouer.

**Option A — Base neuve :**  
Les migrations créent les tables. Vérifier que `DATABASE_URL` pointe bien vers la base Railway.

**Option B — En cas d’échec des migrations :**  
Si les logs montrent une erreur de migration, vous pouvez tester avec :

```bash
# En local, avec la même DATABASE_URL que Railway
npx prisma migrate deploy
```

---

## 5. Redémarrer le déploiement

Après avoir corrigé les variables :

1. **Railway** → **Deployments**
2. **Redeploy** (ou **Deploy** → **Redeploy**)

---

## 6. Vérifier le port

Railway fournit `PORT`. Si l’app ne répond pas, ajouter manuellement :

```
PORT=3000
```

---

## Checklist rapide

- [ ] `DATABASE_URL` définie et correcte
- [ ] Base PostgreSQL créée sur Railway
- [ ] `SHOPIFY_API_KEY` et `SHOPIFY_API_SECRET` renseignés
- [ ] `HOST`, `SHOPIFY_APP_URL`, `APP_URL` en `https://`
- [ ] Logs consultés pour identifier l’erreur exacte
- [ ] Redéploiement effectué après modification des variables
