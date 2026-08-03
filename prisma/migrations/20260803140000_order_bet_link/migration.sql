-- Link an approved order to the bets it created, so a customer's history can show the
-- numbers they backed and which of them won.

ALTER TABLE "TelegramCustomer" ADD COLUMN "username" TEXT;
ALTER TABLE "ThreeDTransaction" ADD COLUMN "telegramOrderId" TEXT;

CREATE INDEX "ThreeDTransaction_telegramOrderId_idx" ON "ThreeDTransaction"("telegramOrderId");
