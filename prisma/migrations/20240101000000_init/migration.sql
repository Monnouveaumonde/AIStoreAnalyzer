-- Migration initiale : AI Store Analyzer
-- Crée toutes les tables nécessaires pour l'application

-- Sessions Shopify OAuth
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- Boutiques installées
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "shopName" TEXT,
    "email" TEXT,
    "accessToken" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "analysisCount" INTEGER NOT NULL DEFAULT 0,
    "monthlyReset" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");
CREATE INDEX "Shop_shopDomain_idx" ON "Shop"("shopDomain");

-- Analyses
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seoScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "speedScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "productScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversionScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "uxScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pricingScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seoDetails" JSONB,
    "speedDetails" JSONB,
    "productDetails" JSONB,
    "conversionDetails" JSONB,
    "uxDetails" JSONB,
    "trustDetails" JSONB,
    "pricingDetails" JSONB,
    "aiInsights" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "shareSlug" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Analysis_shareSlug_key" ON "Analysis"("shareSlug");
CREATE INDEX "Analysis_shopId_idx" ON "Analysis"("shopId");
CREATE INDEX "Analysis_shareSlug_idx" ON "Analysis"("shareSlug");
CREATE INDEX "Analysis_createdAt_idx" ON "Analysis"("createdAt");

ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Opportunités de revenus
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "estimatedImpact" TEXT NOT NULL,
    "impactPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Opportunity_analysisId_idx" ON "Opportunity"("analysisId");

ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_analysisId_fkey"
    FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recommandations actionnables
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actionSteps" JSONB NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "impact" TEXT NOT NULL DEFAULT 'MEDIUM',
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Recommendation_analysisId_idx" ON "Recommendation"("analysisId");

ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_analysisId_fkey"
    FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Abonnements Shopify Billing
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyChargeId" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_shopId_key" ON "Subscription"("shopId");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Données de benchmarking pour comparaison avec la moyenne des boutiques
CREATE TABLE "BenchmarkData" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "averageValue" DOUBLE PRECISION NOT NULL,
    "medianValue" DOUBLE PRECISION NOT NULL,
    "topPercentile" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchmarkData_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BenchmarkData_category_metric_key" ON "BenchmarkData"("category", "metric");

-- Seed des données de benchmark initiales
INSERT INTO "BenchmarkData" ("id", "category", "metric", "averageValue", "medianValue", "topPercentile", "sampleSize", "updatedAt")
VALUES
    (gen_random_uuid()::text, 'global', 'overall_score', 55, 52, 85, 10000, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'seo', 'seo_score', 58, 55, 88, 10000, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'speed', 'speed_score', 45, 42, 80, 10000, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'trust', 'trust_score', 50, 48, 82, 10000, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'products', 'product_score', 52, 50, 83, 10000, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'conversion', 'conversion_score', 48, 45, 79, 10000, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'ux', 'ux_score', 55, 53, 84, 10000, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'pricing', 'pricing_score', 47, 44, 78, 10000, CURRENT_TIMESTAMP)
ON CONFLICT ("category", "metric") DO NOTHING;
