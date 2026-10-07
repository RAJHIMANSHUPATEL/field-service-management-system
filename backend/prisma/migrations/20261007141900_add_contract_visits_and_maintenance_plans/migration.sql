-- AlterTable
ALTER TABLE "ServiceContract" ADD COLUMN     "includedVisits" INTEGER,
ADD COLUMN     "usedVisits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "maintenancePlanId" TEXT;

-- CreateTable
CREATE TABLE "ContractVisit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenancePlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "contractId" TEXT,
    "name" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "leadDays" INTEGER NOT NULL DEFAULT 0,
    "nextDueOn" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractVisit_workOrderId_key" ON "ContractVisit"("workOrderId");

-- CreateIndex
CREATE INDEX "ContractVisit_organizationId_idx" ON "ContractVisit"("organizationId");

-- CreateIndex
CREATE INDEX "ContractVisit_contractId_idx" ON "ContractVisit"("contractId");

-- CreateIndex
CREATE INDEX "MaintenancePlan_organizationId_isActive_nextDueOn_idx" ON "MaintenancePlan"("organizationId", "isActive", "nextDueOn");

-- CreateIndex
CREATE INDEX "MaintenancePlan_customerId_idx" ON "MaintenancePlan"("customerId");

-- CreateIndex
CREATE INDEX "MaintenancePlan_assetId_idx" ON "MaintenancePlan"("assetId");

-- CreateIndex
CREATE INDEX "MaintenancePlan_serviceTypeId_idx" ON "MaintenancePlan"("serviceTypeId");

-- CreateIndex
CREATE INDEX "MaintenancePlan_contractId_idx" ON "MaintenancePlan"("contractId");

-- CreateIndex
CREATE INDEX "WorkOrder_maintenancePlanId_idx" ON "WorkOrder"("maintenancePlanId");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_maintenancePlanId_fkey" FOREIGN KEY ("maintenancePlanId") REFERENCES "MaintenancePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVisit" ADD CONSTRAINT "ContractVisit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVisit" ADD CONSTRAINT "ContractVisit_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVisit" ADD CONSTRAINT "ContractVisit_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
