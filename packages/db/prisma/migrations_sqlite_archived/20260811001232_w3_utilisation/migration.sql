-- W3: отчёт о нанесении (UtilisationReport) + таймер 30 дней (UtilisationAlert)

-- CreateTable
CREATE TABLE "UtilisationReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROCESS',
    "sntins" JSONB NOT NULL,
    "releaseType" TEXT NOT NULL,
    "expirationDate" TEXT NOT NULL,
    "productionDate" TEXT NOT NULL,
    "manufacturerCountry" TEXT NOT NULL,
    "businessPlaceId" TEXT NOT NULL,
    "rejectReason" TEXT,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UtilisationReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UtilisationReport_reportId_key" ON "UtilisationReport"("reportId");

-- CreateTable
CREATE TABLE "UtilisationAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "daysLeft" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UtilisationAlert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable (���������)
CREATE TABLE "MptUtilisation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "reportId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sntins" JSONB NOT NULL,
    "releaseType" TEXT NOT NULL,
    "expirationDate" TEXT NOT NULL,
    "productionDate" TEXT NOT NULL,
    "manufacturerCountry" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROCESS',
    "rejectReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "MptUtilisation_reportId_key" ON "MptUtilisation"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "UtilisationReport_idempotencyKey_key" ON "UtilisationReport"("idempotencyKey");

-- AlterTable
ALTER TABLE "MptCode" ADD COLUMN "used" BOOLEAN NOT NULL DEFAULT false;
