-- AlterEnum
ALTER TYPE "WorkOrderStatus" ADD VALUE 'ASSIGNED';

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "technicianId" TEXT;

-- CreateIndex
CREATE INDEX "WorkOrder_technicianId_idx" ON "WorkOrder"("technicianId");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;
