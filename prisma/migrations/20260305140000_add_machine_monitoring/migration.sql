-- AlterTable: Add monitoring fields to machines
ALTER TABLE "machines" ADD COLUMN "oil_level" REAL;
ALTER TABLE "machines" ADD COLUMN "temperature" REAL;
ALTER TABLE "machines" ADD COLUMN "last_voucher" TEXT;
ALTER TABLE "machines" ADD COLUMN "pump_cycles" INTEGER;
