-- AlterTable: add emailVerified column to Session (required by shopify-api v11)
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
