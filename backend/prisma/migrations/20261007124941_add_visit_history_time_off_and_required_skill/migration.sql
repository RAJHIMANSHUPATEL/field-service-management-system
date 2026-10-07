-- CreateEnum
CREATE TYPE "VisitChangeKind" AS ENUM ('SCHEDULED', 'RESCHEDULED', 'REASSIGNED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ServiceType" ADD COLUMN     "requiredSkillId" TEXT;

-- AlterTable
ALTER TABLE "ServiceVisit" ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 120;

-- CreateTable
CREATE TABLE "VisitChange" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" "VisitChangeKind" NOT NULL,
    "fromStart" TIMESTAMP(3),
    "toStart" TIMESTAMP(3),
    "fromTechnicianId" TEXT,
    "toTechnicianId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianTimeOff" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicianTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitChange_organizationId_idx" ON "VisitChange"("organizationId");

-- CreateIndex
CREATE INDEX "VisitChange_visitId_idx" ON "VisitChange"("visitId");

-- CreateIndex
CREATE INDEX "VisitChange_actorId_idx" ON "VisitChange"("actorId");

-- CreateIndex
CREATE INDEX "TechnicianTimeOff_organizationId_idx" ON "TechnicianTimeOff"("organizationId");

-- CreateIndex
CREATE INDEX "TechnicianTimeOff_technicianId_idx" ON "TechnicianTimeOff"("technicianId");

-- CreateIndex
CREATE INDEX "TechnicianTimeOff_startsAt_idx" ON "TechnicianTimeOff"("startsAt");

-- CreateIndex
CREATE INDEX "ServiceType_requiredSkillId_idx" ON "ServiceType"("requiredSkillId");

-- CreateIndex
CREATE INDEX "ServiceVisit_scheduledStart_idx" ON "ServiceVisit"("scheduledStart");

-- AddForeignKey
ALTER TABLE "ServiceType" ADD CONSTRAINT "ServiceType_requiredSkillId_fkey" FOREIGN KEY ("requiredSkillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitChange" ADD CONSTRAINT "VisitChange_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ServiceVisit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitChange" ADD CONSTRAINT "VisitChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianTimeOff" ADD CONSTRAINT "TechnicianTimeOff_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE CASCADE ON UPDATE CASCADE;
