-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "bin" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "refOrderId" TEXT,
    "ref1c" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tariff" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "pricePerCodeKZT" BIGINT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'KM',
    "currency" TEXT NOT NULL DEFAULT 'KZT',
    "productGroup" TEXT,
    "vatIncluded" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productGroup" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" BIGINT NOT NULL,
    "sumWithoutVat" BIGINT NOT NULL,
    "vat" BIGINT NOT NULL,
    "sumWithVat" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "paymentRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "vatRatePct" INTEGER NOT NULL DEFAULT 16,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tnved" TEXT NOT NULL,
    "gtin" TEXT,
    "attributes" JSONB,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roles" TEXT NOT NULL DEFAULT '[]',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "bin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "consentDocument" TEXT NOT NULL,
    "consentAcceptedAt" TIMESTAMP(3) NOT NULL,
    "consentSubject" TEXT NOT NULL,
    "ecomStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "ecomRetries" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "operatorId" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "aggregate" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCard" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "gtin" TEXT,
    "ntin" TEXT,
    "attributes" JSONB NOT NULL,
    "audit" JSONB NOT NULL DEFAULT '[]',
    "fieldReasons" JSONB NOT NULL DEFAULT '{}',
    "rejectedAttributes" JSONB,
    "ordersBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtinCache" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "gtin" TEXT NOT NULL,
    "gcp" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REAL',
    "brand" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ig',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GtinCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftProposal" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT,
    "source" TEXT NOT NULL,
    "proposed" JSONB NOT NULL,
    "missing" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "audit" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "number" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT NOT NULL,
    "cardId" TEXT,
    "gtin" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "businessPlaceId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "orderId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "gtin" TEXT NOT NULL,
    "places" INTEGER NOT NULL,
    "unitsPerPlace" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalPrice" BIGINT NOT NULL,
    "cisType" TEXT NOT NULL DEFAULT 'UNIT',
    "serialNumberType" TEXT NOT NULL DEFAULT 'OPERATOR',
    "tariffId" TEXT NOT NULL,
    "pricePerCodeKZT" BIGINT NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MptOrder" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "gtin" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MptOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MptCode" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "mptOrderId" TEXT NOT NULL,
    "gtin" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "ai91" TEXT,
    "ai92" TEXT,
    "form" TEXT NOT NULL DEFAULT 'base',
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MptCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MptUtilisation" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "reportId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sntins" JSONB NOT NULL,
    "releaseType" TEXT NOT NULL,
    "expirationDate" TEXT NOT NULL,
    "productionDate" TEXT NOT NULL,
    "manufacturerCountry" TEXT NOT NULL,
    "businessPlaceId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'IN_PROCESS',
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MptUtilisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeVault" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "orderId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT,
    "gtin" TEXT NOT NULL,
    "mask" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "ciphertext" TEXT NOT NULL,
    "labelKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeVault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeEvent" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "reasonCode" TEXT,
    "comment" TEXT,
    "relatedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsscCounter" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "nextSeq" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsscCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultExport" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UtilisationReport" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtilisationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UtilisationAlert" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "daysLeft" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "firedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UtilisationAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportDocument" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customsDate" TEXT NOT NULL,
    "customsNumber" TEXT NOT NULL,
    "authorityCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'EXPECTED',
    "rejectReason" TEXT,
    "externalDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "ImportDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalDocument" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "codes" JSONB NOT NULL,
    "withdrawalType" TEXT NOT NULL,
    "withdrawalReason" TEXT NOT NULL,
    "comment" TEXT,
    "childrenWriteOff" BOOLEAN NOT NULL DEFAULT false,
    "primaryDocument" JSONB,
    "aggregateUnits" JSONB,
    "externalDocumentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "WithdrawalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MptDocument" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "codes" JSONB NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'IN_PROCESS',
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MptDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregationUnit" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "sscc" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "sealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AggregationUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregationMember" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "unitId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codeKey" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT NOT NULL,

    CONSTRAINT "AggregationMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_bin_key" ON "Tenant"("bin");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_ref1c_key" ON "LedgerEntry"("ref1c");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_refOrderId_kind_key" ON "LedgerEntry"("refOrderId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "Application_bin_key" ON "Application"("bin");

-- CreateIndex
CREATE INDEX "ProductCard_tenantId_gtin_idx" ON "ProductCard"("tenantId", "gtin");

-- CreateIndex
CREATE UNIQUE INDEX "GtinCache_gtin_key" ON "GtinCache"("gtin");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "MptOrder_externalId_key" ON "MptOrder"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "MptCode_gtin_serial_key" ON "MptCode"("gtin", "serial");

-- CreateIndex
CREATE UNIQUE INDEX "MptUtilisation_reportId_key" ON "MptUtilisation"("reportId");

-- CreateIndex
CREATE INDEX "CodeVault_tenantId_gtin_idx" ON "CodeVault"("tenantId", "gtin");

-- CreateIndex
CREATE INDEX "CodeEvent_tenantId_codeId_idx" ON "CodeEvent"("tenantId", "codeId");

-- CreateIndex
CREATE INDEX "CodeEvent_tenantId_event_idx" ON "CodeEvent"("tenantId", "event");

-- CreateIndex
CREATE UNIQUE INDEX "SsscCounter_tenantId_key" ON "SsscCounter"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UtilisationReport_idempotencyKey_key" ON "UtilisationReport"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "UtilisationReport_reportId_key" ON "UtilisationReport"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportDocument_tenantId_customsNumber_key" ON "ImportDocument"("tenantId", "customsNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MptDocument_documentId_key" ON "MptDocument"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "AggregationUnit_sscc_key" ON "AggregationUnit"("sscc");

-- CreateIndex
CREATE UNIQUE INDEX "AggregationMember_unitId_codeKey_key" ON "AggregationMember"("unitId", "codeKey");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCard" ADD CONSTRAINT "ProductCard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftProposal" ADD CONSTRAINT "DraftProposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftProposal" ADD CONSTRAINT "DraftProposal_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "ProductCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MptOrder" ADD CONSTRAINT "MptOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MptCode" ADD CONSTRAINT "MptCode_mptOrderId_fkey" FOREIGN KEY ("mptOrderId") REFERENCES "MptOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeVault" ADD CONSTRAINT "CodeVault_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeEvent" ADD CONSTRAINT "CodeEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeEvent" ADD CONSTRAINT "CodeEvent_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "CodeVault"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsscCounter" ADD CONSTRAINT "SsscCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultExport" ADD CONSTRAINT "VaultExport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilisationReport" ADD CONSTRAINT "UtilisationReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilisationAlert" ADD CONSTRAINT "UtilisationAlert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportDocument" ADD CONSTRAINT "ImportDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalDocument" ADD CONSTRAINT "WithdrawalDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AggregationUnit" ADD CONSTRAINT "AggregationUnit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AggregationMember" ADD CONSTRAINT "AggregationMember_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "AggregationUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
