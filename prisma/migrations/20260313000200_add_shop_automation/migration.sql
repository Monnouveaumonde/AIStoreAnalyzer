-- Migration: add_shop_automation
-- Ajout des champs Centre d'automatisation globale sur le modèle Shop

ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "autoCompetitiveEnabled"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "autoCompetitiveFrequency" TEXT    NOT NULL DEFAULT 'daily';
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "autoSeoEnabled"           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "autoSeoFrequency"         TEXT    NOT NULL DEFAULT 'monthly';
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "autoAnalysisEnabled"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "autoAnalysisFrequency"    TEXT    NOT NULL DEFAULT 'monthly';
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "autoAlertsEnabled"        BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "autoAlertThresholdPct"    FLOAT8  NOT NULL DEFAULT 5;
