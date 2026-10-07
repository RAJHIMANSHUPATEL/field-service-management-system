-- CreateEnum
CREATE TYPE "WarehouseKind" AS ENUM ('WAREHOUSE', 'VAN');

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianSkill" (
    "id" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicianSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceArea" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "postalCodes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianServiceArea" (
    "id" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "serviceAreaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicianServiceArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isSerialized" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "WarehouseKind" NOT NULL DEFAULT 'WAREHOUSE',
    "technicianId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Skill_organizationId_idx" ON "Skill"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_organizationId_name_key" ON "Skill"("organizationId", "name");

-- CreateIndex
CREATE INDEX "TechnicianSkill_technicianId_idx" ON "TechnicianSkill"("technicianId");

-- CreateIndex
CREATE INDEX "TechnicianSkill_skillId_idx" ON "TechnicianSkill"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicianSkill_technicianId_skillId_key" ON "TechnicianSkill"("technicianId", "skillId");

-- CreateIndex
CREATE INDEX "ServiceArea_organizationId_idx" ON "ServiceArea"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceArea_organizationId_name_key" ON "ServiceArea"("organizationId", "name");

-- CreateIndex
CREATE INDEX "TechnicianServiceArea_technicianId_idx" ON "TechnicianServiceArea"("technicianId");

-- CreateIndex
CREATE INDEX "TechnicianServiceArea_serviceAreaId_idx" ON "TechnicianServiceArea"("serviceAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicianServiceArea_technicianId_serviceAreaId_key" ON "TechnicianServiceArea"("technicianId", "serviceAreaId");

-- CreateIndex
CREATE INDEX "Part_organizationId_idx" ON "Part"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Part_organizationId_sku_key" ON "Part"("organizationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_technicianId_key" ON "Warehouse"("technicianId");

-- CreateIndex
CREATE INDEX "Warehouse_organizationId_idx" ON "Warehouse"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_organizationId_name_key" ON "Warehouse"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianSkill" ADD CONSTRAINT "TechnicianSkill_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianSkill" ADD CONSTRAINT "TechnicianSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceArea" ADD CONSTRAINT "ServiceArea_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianServiceArea" ADD CONSTRAINT "TechnicianServiceArea_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianServiceArea" ADD CONSTRAINT "TechnicianServiceArea_serviceAreaId_fkey" FOREIGN KEY ("serviceAreaId") REFERENCES "ServiceArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;
