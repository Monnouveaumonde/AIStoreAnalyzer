-- Migration : Module Competitive Watcher + SEO Optimizer
-- Ajoute les tables pour les deux nouveaux modules

-- ─── MODULE: Competitive Watcher ─────────────────────────────────────────────

-- Produits concurrents surveillés
CREATE TABLE "WatchedProduct" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyProductTitle" TEXT NOT NULL,
    "competitorUrl" TEXT NOT NULL,
    "competitorName" TEXT NOT NULL,
    "competitorDomain" TEXT NOT NULL,
    "lastPrice" DOUBLE PRECISION,
    "lastCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "lastCheckedAt" TIMESTAMP(3),
    "myCurrentPrice" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchedProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WatchedProduct_shopId_idx" ON "WatchedProduct"("shopId");
CREATE INDEX "WatchedProduct_competitorDomain_idx" ON "WatchedProduct"("competitorDomain");

ALTER TABLE "WatchedProduct" ADD CONSTRAINT "WatchedProduct_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Historique des prix concurrents observés
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "watchedProductId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "hasPromotion" BOOLEAN NOT NULL DEFAULT false,
    "promotionLabel" TEXT,
    "originalPrice" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'scrape',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceSnapshot_watchedProductId_idx" ON "PriceSnapshot"("watchedProductId");
CREATE INDEX "PriceSnapshot_capturedAt_idx" ON "PriceSnapshot"("capturedAt");

ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_watchedProductId_fkey"
    FOREIGN KEY ("watchedProductId") REFERENCES "WatchedProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Alertes de changement de prix concurrents
CREATE TABLE "PriceAlert" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "watchedProductId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "oldPrice" DOUBLE PRECISION,
    "newPrice" DOUBLE PRECISION NOT NULL,
    "priceDiffPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "suggestion" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceAlert_shopId_idx" ON "PriceAlert"("shopId");
CREATE INDEX "PriceAlert_watchedProductId_idx" ON "PriceAlert"("watchedProductId");
CREATE INDEX "PriceAlert_isRead_idx" ON "PriceAlert"("isRead");
CREATE INDEX "PriceAlert_createdAt_idx" ON "PriceAlert"("createdAt");

ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_watchedProductId_fkey"
    FOREIGN KEY ("watchedProductId") REFERENCES "WatchedProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── MODULE: SEO Optimizer ────────────────────────────────────────────────────

-- Résultats d'un scan SEO complet
CREATE TABLE "SeoScan" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalIssues" INTEGER NOT NULL DEFAULT 0,
    "criticalIssues" INTEGER NOT NULL DEFAULT 0,
    "warningIssues" INTEGER NOT NULL DEFAULT 0,
    "metaDetails" JSONB,
    "headingDetails" JSONB,
    "altTextDetails" JSONB,
    "duplicateDetails" JSONB,
    "structureDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoScan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SeoScan_shopId_idx" ON "SeoScan"("shopId");
CREATE INDEX "SeoScan_createdAt_idx" ON "SeoScan"("createdAt");

ALTER TABLE "SeoScan" ADD CONSTRAINT "SeoScan_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Issues SEO individuelles détectées
CREATE TABLE "SeoIssue" (
    "id" TEXT NOT NULL,
    "seoScanId" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "category" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceTitle" TEXT NOT NULL,
    "resourceUrl" TEXT,
    "description" TEXT NOT NULL,
    "currentValue" TEXT,
    "suggestedValue" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "fixedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoIssue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SeoIssue_seoScanId_idx" ON "SeoIssue"("seoScanId");
CREATE INDEX "SeoIssue_issueType_idx" ON "SeoIssue"("issueType");
CREATE INDEX "SeoIssue_isFixed_idx" ON "SeoIssue"("isFixed");

ALTER TABLE "SeoIssue" ADD CONSTRAINT "SeoIssue_seoScanId_fkey"
    FOREIGN KEY ("seoScanId") REFERENCES "SeoScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Historique des optimisations SEO appliquées
CREATE TABLE "SeoOptimization" (
    "id" TEXT NOT NULL,
    "seoScanId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceTitle" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT NOT NULL,
    "appliedByAi" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopifyMutationSuccess" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SeoOptimization_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SeoOptimization_seoScanId_idx" ON "SeoOptimization"("seoScanId");
CREATE INDEX "SeoOptimization_shopId_idx" ON "SeoOptimization"("shopId");

ALTER TABLE "SeoOptimization" ADD CONSTRAINT "SeoOptimization_seoScanId_fkey"
    FOREIGN KEY ("seoScanId") REFERENCES "SeoScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SeoOptimization" ADD CONSTRAINT "SeoOptimization_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
