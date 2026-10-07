-- CreateEnum
CREATE TYPE "PartRequestStatus" AS ENUM ('OPEN', 'FULFILLED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "VisitStatus" ADD VALUE 'UNSUCCESSFUL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WorkOrderStatus" ADD VALUE 'AWAITING_PARTS';
ALTER TYPE "WorkOrderStatus" ADD VALUE 'FOLLOW_UP_REQUIRED';

-- AlterTable
ALTER TABLE "ServiceVisit" ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "outcomeReason" TEXT;

-- CreateTable
CREATE TABLE "PartRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "visitId" TEXT,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "PartRequestStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "requestedById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartRequest_organizationId_status_idx" ON "PartRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PartRequest_workOrderId_idx" ON "PartRequest"("workOrderId");

-- AddForeignKey
ALTER TABLE "PartRequest" ADD CONSTRAINT "PartRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartRequest" ADD CONSTRAINT "PartRequest_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartRequest" ADD CONSTRAINT "PartRequest_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartRequest" ADD CONSTRAINT "PartRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
