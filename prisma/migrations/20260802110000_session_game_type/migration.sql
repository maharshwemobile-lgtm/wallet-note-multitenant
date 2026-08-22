-- Distinguish 2D from 3D sessions. Existing rows are all 3D, which the default preserves,
-- so no data is rewritten and every current query keeps its meaning.
ALTER TABLE "ThreeDSession" ADD COLUMN "gameType" TEXT NOT NULL DEFAULT 'THREE_D';

CREATE INDEX "ThreeDSession_businessId_gameType_drawDate_idx"
  ON "ThreeDSession"("businessId", "gameType", "drawDate");
