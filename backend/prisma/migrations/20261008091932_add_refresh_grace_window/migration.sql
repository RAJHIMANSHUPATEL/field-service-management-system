-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "graceUntil" TIMESTAMP(3),
ADD COLUMN     "successorId" TEXT,
ADD COLUMN     "successorSecret" TEXT;
