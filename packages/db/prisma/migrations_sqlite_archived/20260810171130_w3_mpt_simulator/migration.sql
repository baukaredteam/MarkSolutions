-- W3: симулятор ИС МПТ (MptOrder + MptCode, ADR-005/024)

-- CreateTable
CREATE TABLE "MptOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "gtin" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MptOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MptOrder_externalId_key" ON "MptOrder"("externalId");

-- CreateTable
CREATE TABLE "MptCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "mptOrderId" TEXT NOT NULL,
    "gtin" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "ai91" TEXT,
    "ai92" TEXT,
    "form" TEXT NOT NULL DEFAULT 'base',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MptCode_mptOrderId_fkey" FOREIGN KEY ("mptOrderId") REFERENCES "MptOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MptCode_gtin_serial_key" ON "MptCode"("gtin", "serial");
