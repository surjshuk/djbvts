-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "snapshotCode" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "tankerType" TEXT NOT NULL,
    "transporterName" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "tripDistanceKm" TEXT NOT NULL,
    "tripCount" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfGeneration" (
    "id" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "verificationUrl" TEXT NOT NULL,
    "dateFrom" TEXT NOT NULL,
    "dateTo" TEXT NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filterVehicle" TEXT,
    "filterArea" TEXT,
    "filterMonth" TEXT,
    "pdfBase64" TEXT,
    "recordCount" INTEGER NOT NULL,

    CONSTRAINT "PdfGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotCode" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordCount" INTEGER NOT NULL,
    "fileName" TEXT,

    CONSTRAINT "UploadSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Report_vehicleNo_idx" ON "Report"("vehicleNo");

-- CreateIndex
CREATE INDEX "Report_area_idx" ON "Report"("area");

-- CreateIndex
CREATE INDEX "Report_snapshotCode_idx" ON "Report"("snapshotCode");

-- CreateIndex
CREATE INDEX "Report_uploadedBy_idx" ON "Report"("uploadedBy");

-- CreateIndex
CREATE INDEX "Report_reportDate_idx" ON "Report"("reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "Report_vehicleNo_reportDate_key" ON "Report"("vehicleNo", "reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "PdfGeneration_verificationCode_key" ON "PdfGeneration"("verificationCode");

-- CreateIndex
CREATE INDEX "PdfGeneration_verificationCode_idx" ON "PdfGeneration"("verificationCode");

-- CreateIndex
CREATE INDEX "PdfGeneration_generatedBy_idx" ON "PdfGeneration"("generatedBy");

-- CreateIndex
CREATE INDEX "PdfGeneration_generatedAt_idx" ON "PdfGeneration"("generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UploadSnapshot_snapshotCode_key" ON "UploadSnapshot"("snapshotCode");

-- CreateIndex
CREATE INDEX "UploadSnapshot_snapshotCode_idx" ON "UploadSnapshot"("snapshotCode");

-- CreateIndex
CREATE INDEX "UploadSnapshot_uploadedBy_idx" ON "UploadSnapshot"("uploadedBy");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("email") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfGeneration" ADD CONSTRAINT "PdfGeneration_generatedBy_fkey" FOREIGN KEY ("generatedBy") REFERENCES "User"("email") ON DELETE RESTRICT ON UPDATE CASCADE;
