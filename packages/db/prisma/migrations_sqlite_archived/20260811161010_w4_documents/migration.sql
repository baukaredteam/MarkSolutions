-- W4-04: ImportDocument, WithdrawalDocument, AggregationUnit, AggregationMember

-- CreateTable
CREATE TABLE "ImportDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customsDate" TEXT NOT NULL,
    "customsNumber" TEXT NOT NULL,
    "authorityCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'EXPECTED',
    "rejectReason" TEXT,
    "externalDocumentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    CONSTRAINT "ImportDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportDocument_tenantId_customsNumber_key" ON "ImportDocument"("tenantId", "customsNumber");

-- CreateTable
CREATE TABLE "WithdrawalDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "codes" JSONB NOT NULL,
    "withdrawalType" TEXT NOT NULL,
    "withdrawalReason" TEXT NOT NULL,
    "comment" TEXT,
    "childrenWriteOff" BOOLEAN NOT NULL DEFAULT false,
    "primaryDocument" JSONB,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "rejectReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    CONSTRAINT "WithdrawalDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MptDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "codes" JSONB NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'IN_PROCESS',
    "rejectReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "MptDocument_documentId_key" ON "MptDocument"("documentId");

-- CreateTable
CREATE TABLE "AggregationUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "sscc" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "sealedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AggregationUnit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AggregationUnit_sscc_key" ON "AggregationUnit"("sscc");

-- CreateTable
CREATE TABLE "AggregationMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "unitId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codeKey" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT NOT NULL,
    CONSTRAINT "AggregationMember_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "AggregationUnit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AggregationMember_unitId_codeKey_key" ON "AggregationMember"("unitId", "codeKey");
