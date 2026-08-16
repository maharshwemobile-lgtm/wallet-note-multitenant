-- One row per shop per draw it has announced, so a customer is told the number once.
CREATE TABLE "ResultAnnouncement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "gameType" TEXT NOT NULL,
    "drawDate" TEXT NOT NULL,
    "sessionName" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResultAnnouncement_businessId_gameType_drawDate_sessionName_key"
    ON "ResultAnnouncement"("businessId", "gameType", "drawDate", "sessionName");
CREATE INDEX "ResultAnnouncement_businessId_sentAt_idx" ON "ResultAnnouncement"("businessId", "sentAt");
