-- The previous migration backfilled updatedAt with now(); Prisma sets it from here on.
ALTER TABLE "Feedback" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "Notification" ALTER COLUMN "updatedAt" DROP DEFAULT;
