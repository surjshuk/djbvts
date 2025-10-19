/*
  Warnings:

  - You are about to drop the `ReportRow` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `dateFrom` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `dateTo` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `generatedAt` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `generatedByEmail` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `ownerId` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `verificationSlug` on the `Report` table. All the data in the column will be lost.
  - Added the required column `area` to the `Report` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reportDate` to the `Report` table without a default value. This is not possible if the table is not empty.
  - Added the required column `snapshotCode` to the `Report` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tankerType` to the `Report` table without a default value. This is not possible if the table is not empty.
  - Added the required column `transporterName` to the `Report` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tripCount` to the `Report` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tripDistanceKm` to the `Report` table without a default value. This is not possible if the table is not empty.
  - Added the required column `uploadedBy` to the `Report` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vehicleNo` to the `Report` table without a default value. This is not possible if the table is not empty.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ReportRow";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "PdfGeneration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "verificationCode" TEXT NOT NULL,
    "verificationUrl" TEXT NOT NULL,
    "dateFrom" TEXT NOT NULL,
    "dateTo" TEXT NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filterVehicle" TEXT,
    "filterArea" TEXT,
    "filterMonth" TEXT,
    "pdfBase64" TEXT,
    "recordCount" INTEGER NOT NULL,
    CONSTRAINT "PdfGeneration_generatedBy_fkey" FOREIGN KEY ("generatedBy") REFERENCES "User" ("email") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UploadSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotCode" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordCount" INTEGER NOT NULL,
    "fileName" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotCode" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "tankerType" TEXT NOT NULL,
    "transporterName" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "tripDistanceKm" TEXT NOT NULL,
    "tripCount" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User" ("email") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Report" ("id") SELECT "id" FROM "Report";
DROP TABLE "Report";
ALTER TABLE "new_Report" RENAME TO "Report";
CREATE INDEX "Report_vehicleNo_idx" ON "Report"("vehicleNo");
CREATE INDEX "Report_area_idx" ON "Report"("area");
CREATE INDEX "Report_snapshotCode_idx" ON "Report"("snapshotCode");
CREATE INDEX "Report_uploadedBy_idx" ON "Report"("uploadedBy");
CREATE INDEX "Report_reportDate_idx" ON "Report"("reportDate");
CREATE UNIQUE INDEX "Report_vehicleNo_reportDate_key" ON "Report"("vehicleNo", "reportDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

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
