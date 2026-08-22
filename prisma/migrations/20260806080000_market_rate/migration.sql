-- The published daily market rate, shared by every tenant.

CREATE TABLE "MarketRate" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "buy" TEXT NOT NULL,
    "sell" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketRate_source_currency_postedAt_key" ON "MarketRate"("source", "currency", "postedAt");
CREATE INDEX "MarketRate_currency_postedAt_idx" ON "MarketRate"("currency", "postedAt");
