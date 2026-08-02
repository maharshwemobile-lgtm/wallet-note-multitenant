-- Official Myanmar 2D results. Additive only: no existing table or row is touched.
CREATE TABLE "TwoDOfficialResult" (
    "id" TEXT NOT NULL,
    "drawDate" TEXT NOT NULL,
    "sessionName" TEXT NOT NULL,
    "drawTime" TEXT,
    "resultNumber" TEXT NOT NULL,
    "setValue" TEXT,
    "value" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MYANMAR_2D_RAPIDAPI',
    "sourceKey" TEXT NOT NULL,
    "rawPayload" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwoDOfficialResult_pkey" PRIMARY KEY ("id")
);

-- One row per draw: re-fetching the same draw updates rather than duplicates.
CREATE UNIQUE INDEX "TwoDOfficialResult_sourceKey_key" ON "TwoDOfficialResult"("sourceKey");
CREATE INDEX "TwoDOfficialResult_drawDate_idx" ON "TwoDOfficialResult"("drawDate");
