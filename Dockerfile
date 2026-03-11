FROM node:20-alpine AS base
WORKDIR /app
# OpenSSL requis par Prisma sur Alpine
RUN apk add --no-cache openssl

# ── Étape 1 : Installation des dépendances ────────────────────────────────────
FROM base AS deps
COPY package*.json ./
# --ignore-scripts évite les erreurs de compilation native (puppeteer, etc.)
# sur Alpine. Les scripts Prisma sont lancés séparément.
RUN npm ci --ignore-scripts

# ── Étape 2 : Build de production ─────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Créer public si absent (Remix/Vite n'en crée pas toujours)
RUN mkdir -p public

# DATABASE_URL requis pour la validation du schema (prisma generate ne se connecte pas)
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

# Génération du client Prisma (nécessaire avant le build Remix)
# Sans --no-engine : moteur inclus pour connexion directe postgresql://
RUN npx prisma generate

# Build Remix
RUN npm run build

# ── Étape 3 : Image finale (légère) ───────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production

# Copier node_modules complet depuis le builder (inclut .prisma/client avec le binaire engine)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

# Regénérer le client Prisma dans l'image runner (même architecture Alpine)
# Nécessaire pour que le binaire query-engine corresponde à l'OS de production
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate
ENV DATABASE_URL=""

# Railway injecte PORT (souvent 8080) — l'app doit écouter dessus
EXPOSE 8080

# migrate deploy puis démarrage — si la table _prisma_migrations n'existe pas, db push en secours
CMD ["sh", "-c", "(npx prisma migrate deploy || npx prisma db push --accept-data-loss) && NODE_ENV=production npm run start"]
