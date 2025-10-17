-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT 'Daily Distance Report',
    "dateFrom" DATETIME NOT NULL,
    "dateTo" DATETIME NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedByEmail" TEXT NOT NULL,
    "verificationSlug" TEXT NOT NULL,
    "ownerId" TEXT,
    CONSTRAINT "Report_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "tankerType" TEXT NOT NULL,
    "transporterName" TEXT NOT NULL,
    "tripDistanceKm" DECIMAL NOT NULL,
    "engineHours" DECIMAL NOT NULL,
    "tripCount" INTEGER NOT NULL,
    CONSTRAINT "ReportRow_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Report_verificationSlug_key" ON "Report"("verificationSlug");
