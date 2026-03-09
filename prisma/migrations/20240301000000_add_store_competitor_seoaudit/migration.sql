-- Migration : Ajout des modèles Store, Competitor et SeoAudit
-- Ces modèles constituent la base de l'application AI Store Analyzer

-- Table Store : représente une boutique Shopify trackée
CREATE TABLE "Store" (
    "id"        TEXT        NOT NULL,
    "shop"      TEXT        NOT NULL,   -- ex: my-store.myshopify.com
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- Index unique sur le domaine de la boutique (1 boutique = 1 entrée)
CREATE UNIQUE INDEX "Store_shop_key" ON "Store"("shop");
CREATE INDEX "Store_shop_idx" ON "Store"("shop");

-- Table Competitor : concurrent suivi pour une boutique
CREATE TABLE "Competitor" (
    "id"        TEXT        NOT NULL,
    "storeId"   TEXT        NOT NULL,   -- clé étrangère vers Store
    "url"       TEXT        NOT NULL,   -- URL complète du produit concurrent
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Competitor_storeId_idx" ON "Competitor"("storeId");

-- Clé étrangère : si le Store est supprimé, ses Competitors le sont aussi
ALTER TABLE "Competitor"
    ADD CONSTRAINT "Competitor_storeId_fkey"
    FOREIGN KEY ("storeId")
    REFERENCES "Store"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- Table SeoAudit : résultat d'un audit SEO pour une boutique
CREATE TABLE "SeoAudit" (
    "id"        TEXT             NOT NULL,
    "storeId"   TEXT             NOT NULL,   -- clé étrangère vers Store
    "score"     DOUBLE PRECISION NOT NULL DEFAULT 0,   -- score entre 0 et 100
    "report"    JSONB,                       -- rapport JSON détaillé libre
    "createdAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SeoAudit_storeId_idx" ON "SeoAudit"("storeId");
CREATE INDEX "SeoAudit_createdAt_idx" ON "SeoAudit"("createdAt");

-- Clé étrangère : cascade à la suppression du Store
ALTER TABLE "SeoAudit"
    ADD CONSTRAINT "SeoAudit_storeId_fkey"
    FOREIGN KEY ("storeId")
    REFERENCES "Store"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
