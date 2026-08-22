ALTER TABLE "User"
  ADD COLUMN "telegramBotToken" TEXT,
  ADD COLUMN "telegramBotUsername" TEXT,
  ADD COLUMN "telegramWebhookSecret" TEXT,
  ADD COLUMN "telegramChatId" TEXT;

CREATE TABLE "TelegramSession" (
  "ownerUserId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "data" TEXT NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramSession_pkey" PRIMARY KEY ("ownerUserId", "chatId")
);

CREATE UNIQUE INDEX "User_telegramBotToken_key"
  ON "User"("telegramBotToken");

CREATE UNIQUE INDEX "User_telegramWebhookSecret_key"
  ON "User"("telegramWebhookSecret");

UPDATE "Role"
SET "permissions" = ("permissions"::jsonb || '["wallet.withdraw"]'::jsonb)::text
WHERE "name" IN ('Owner', 'Admin', 'Cashier', 'Accountant')
  AND NOT ("permissions"::jsonb ? 'wallet.withdraw');
