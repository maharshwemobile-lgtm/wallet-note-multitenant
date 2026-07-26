-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramBotToken" TEXT,
ADD COLUMN     "telegramBotUsername" TEXT,
ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramWebhookSecret" TEXT;

-- CreateTable
CREATE TABLE "TelegramSession" (
    "ownerUserId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramSession_pkey" PRIMARY KEY ("ownerUserId","chatId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramBotToken_key" ON "User"("telegramBotToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramWebhookSecret_key" ON "User"("telegramWebhookSecret");

