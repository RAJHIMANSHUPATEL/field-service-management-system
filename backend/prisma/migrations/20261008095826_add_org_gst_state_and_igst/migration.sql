-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "igst" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "gstState" TEXT;
