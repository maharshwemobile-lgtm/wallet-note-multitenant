-- Top-up billers: the float a phone shop holds with an operator, and its movements.

CREATE TABLE "Biller" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TOPUP_CARD',
    "currency" TEXT NOT NULL DEFAULT 'MMK',
    "openingBalance" BIGINT NOT NULL DEFAULT 0,
    "currentBalance" BIGINT NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Biller_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillerTxn" (
    "id" TEXT NOT NULL,
    "txnNo" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT,
    "billerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "faceAmount" BIGINT NOT NULL DEFAULT 0,
    "cashAmount" BIGINT NOT NULL DEFAULT 0,
    "profit" BIGINT NOT NULL DEFAULT 0,
    "walletId" TEXT,
    "balanceAfter" BIGINT NOT NULL DEFAULT 0,
    "customerPhone" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillerTxn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Biller_businessId_name_key" ON "Biller"("businessId", "name");
CREATE INDEX "Biller_businessId_active_idx" ON "Biller"("businessId", "active");

CREATE UNIQUE INDEX "BillerTxn_businessId_txnNo_key" ON "BillerTxn"("businessId", "txnNo");
CREATE INDEX "BillerTxn_billerId_createdAt_idx" ON "BillerTxn"("billerId", "createdAt");
CREATE INDEX "BillerTxn_businessId_createdAt_idx" ON "BillerTxn"("businessId", "createdAt");

ALTER TABLE "BillerTxn" ADD CONSTRAINT "BillerTxn_billerId_fkey"
    FOREIGN KEY ("billerId") REFERENCES "Biller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
