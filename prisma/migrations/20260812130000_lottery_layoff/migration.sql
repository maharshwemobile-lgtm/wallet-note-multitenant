-- Part of a number passed on to another bookmaker, so the shop is not carrying it all.
CREATE TABLE "LotteryLayoff" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT,
    "sessionId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "odds" TEXT NOT NULL,
    "bookmaker" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LotteryLayoff_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LotteryLayoff_sessionId_number_idx" ON "LotteryLayoff"("sessionId", "number");
CREATE INDEX "LotteryLayoff_businessId_createdAt_idx" ON "LotteryLayoff"("businessId", "createdAt");

ALTER TABLE "LotteryLayoff" ADD CONSTRAINT "LotteryLayoff_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "ThreeDSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
