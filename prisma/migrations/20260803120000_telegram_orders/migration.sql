-- Telegram customers and the bet orders they place, held for staff approval.

CREATE TABLE "TelegramCustomer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramCustomer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramCustomer_ownerUserId_chatId_key" ON "TelegramCustomer"("ownerUserId", "chatId");
CREATE INDEX "TelegramCustomer_businessId_idx" ON "TelegramCustomer"("businessId");

CREATE TABLE "LotteryOrder" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "rows" TEXT NOT NULL,
    "totalAmount" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_SLIP',
    "paymentMethod" TEXT,
    "slipFileId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LotteryOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LotteryOrder_businessId_orderNo_key" ON "LotteryOrder"("businessId", "orderNo");
CREATE INDEX "LotteryOrder_businessId_status_idx" ON "LotteryOrder"("businessId", "status");
CREATE INDEX "LotteryOrder_ownerUserId_status_idx" ON "LotteryOrder"("ownerUserId", "status");
CREATE INDEX "LotteryOrder_sessionId_idx" ON "LotteryOrder"("sessionId");

ALTER TABLE "LotteryOrder" ADD CONSTRAINT "LotteryOrder_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "TelegramCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
