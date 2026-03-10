# Baseliner la base Railway (erreur P3005)

Quand la base contient déjà des tables, Prisma refuse d'exécuter les migrations. Il faut marquer les migrations comme déjà appliquées.

## Commandes à exécuter (en local)

Ouvrez un terminal dans le dossier du projet et exécutez :

```bash
cd "C:\Users\Monno\Desktop\AI Store Analyzer"

# Définir l'URL Railway (remplacez si besoin)
$env:DATABASE_URL="postgresql://postgres:ysYNsMTponTDcooUhGHMMuTOfqbeHXTY@yamanote.proxy.rlwy.net:13789/railway"

# Marquer chaque migration comme déjà appliquée
npx prisma migrate resolve --applied "20240101000000_init"
npx prisma migrate resolve --applied "20240201000000_competitive_seo"
npx prisma migrate resolve --applied "20240301000000_add_store_competitor_seoaudit"
```

## Alternative : base vide

Si la base est neuve et ne contient pas encore les bonnes tables, utilisez plutôt :

```bash
npx prisma db push
```

Puis redéployez sur Railway.
