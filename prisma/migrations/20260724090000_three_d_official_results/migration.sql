CREATE TABLE "ThreeDOfficialResult" (
    "id" TEXT NOT NULL,
    "drawDate" TEXT NOT NULL,
    "sessionName" TEXT NOT NULL,
    "drawTime" TEXT,
    "resultNumber" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'THAI_LOTTO_RAPIDAPI',
    "sourceKey" TEXT NOT NULL,
    "rawPayload" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ThreeDOfficialResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ThreeDOfficialResult_sourceKey_key" ON "ThreeDOfficialResult"("sourceKey");
CREATE INDEX "ThreeDOfficialResult_drawDate_idx" ON "ThreeDOfficialResult"("drawDate");
