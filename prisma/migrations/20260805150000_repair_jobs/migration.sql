-- Devices left in for repair, for shops that fix phones as well as sell them.

CREATE TABLE "RepairJob" (
    "id" TEXT NOT NULL,
    "jobNo" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "deviceBrand" TEXT NOT NULL,
    "deviceModel" TEXT NOT NULL,
    "imei" TEXT,
    "accessories" TEXT,
    "problem" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "estimatedCost" BIGINT NOT NULL DEFAULT 0,
    "partsCost" BIGINT NOT NULL DEFAULT 0,
    "finalCost" BIGINT NOT NULL DEFAULT 0,
    "depositAmount" BIGINT NOT NULL DEFAULT 0,
    "paidAmount" BIGINT NOT NULL DEFAULT 0,
    "technicianId" TEXT,
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promisedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "RepairJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepairJob_businessId_jobNo_key" ON "RepairJob"("businessId", "jobNo");
CREATE INDEX "RepairJob_businessId_status_idx" ON "RepairJob"("businessId", "status");
CREATE INDEX "RepairJob_businessId_receivedAt_idx" ON "RepairJob"("businessId", "receivedAt");
CREATE INDEX "RepairJob_customerId_idx" ON "RepairJob"("customerId");
