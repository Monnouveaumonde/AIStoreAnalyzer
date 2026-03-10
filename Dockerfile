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
RUN npx prisma generate --no-engine

# Build Remix
RUN npm run build

# ── Étape 3 : Image finale (légère) ───────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

# Schema : migrate deploy ; si P3005 (base non vide), db push en secours
# server.js écoute sur 0.0.0.0:PORT pour Railway
CMD ["sh", "-c", "(npx prisma migrate deploy || npx prisma db push) && npm run start"]
