-- Currency exchanges customers ask for over Telegram, held for a staff slip check.

CREATE TABLE "ExchangeOrder" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "fromAmount" BIGINT NOT NULL,
    "toAmount" BIGINT NOT NULL,
    "rate" TEXT NOT NULL,
    "payMethod" TEXT,
    "receiveMethod" TEXT,
    "receiveAccount" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_SLIP',
    "slipFileId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "exchangeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExchangeOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExchangeOrder_businessId_orderNo_key" ON "ExchangeOrder"("businessId", "orderNo");
CREATE INDEX "ExchangeOrder_businessId_status_idx" ON "ExchangeOrder"("businessId", "status");
CREATE INDEX "ExchangeOrder_ownerUserId_status_idx" ON "ExchangeOrder"("ownerUserId", "status");

ALTER TABLE "ExchangeOrder" ADD CONSTRAINT "ExchangeOrder_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "TelegramCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
