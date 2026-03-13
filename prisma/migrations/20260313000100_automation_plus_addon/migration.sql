-- Subscription: addon Automation+
ALTER TABLE "Subscription"
ADD COLUMN "automationAddonActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "automationAddonChargeId" TEXT,
ADD COLUMN "automationAddonPrice" DOUBLE PRECISION DEFAULT 5;

-- WatchedProduct: automation settings per line
ALTER TABLE "WatchedProduct"
ADD COLUMN "automationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "automationPricingAdvice" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "automationAlerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "automationFrequencyHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN "automationThresholdPct" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN "automationLastRunAt" TIMESTAMP(3),
ADD COLUMN "automationLastStatus" TEXT,
ADD COLUMN "automationLastError" TEXT;
