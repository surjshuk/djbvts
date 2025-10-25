-- AlterTable
ALTER TABLE "PdfGeneration" ADD COLUMN     "summaryGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "summaryTotalDistance" DOUBLE PRECISION,
ADD COLUMN     "summaryTotalTrips" INTEGER,
ADD COLUMN     "summaryVehicleCount" INTEGER,
ADD COLUMN     "summaryVehicleReports" JSONB;
