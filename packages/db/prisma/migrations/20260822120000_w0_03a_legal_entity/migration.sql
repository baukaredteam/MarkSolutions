-- W0-03a (ADR-026): LegalEntity 1:N Tenant + UserLegalEntityMembership +
-- legalEntityId on protected objects. Expand-contract: columns are added
-- nullable, backfilled deterministically, then FK'd. The NOT NULL contract
-- (making legalEntityId mandatory at the app layer) is a tracked follow-up
-- (docs/production/W0-03A_FOLLOWUP.md).

-- 1. New tables -------------------------------------------------------------

CREATE TABLE "LegalEntity" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "bin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalEntity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserLegalEntityMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLegalEntityMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegalEntity_bin_key" ON "LegalEntity"("bin");
CREATE UNIQUE INDEX "UserLegalEntityMembership_userId_legalEntityId_key" ON "UserLegalEntityMembership"("userId", "legalEntityId");

-- 2. Add nullable legalEntityId to protected objects -------------------------

ALTER TABLE "Account" ADD COLUMN "legalEntityId" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "legalEntityId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "legalEntityId" TEXT;
ALTER TABLE "Product" ADD COLUMN "legalEntityId" TEXT;
ALTER TABLE "ProductCard" ADD COLUMN "legalEntityId" TEXT;
ALTER TABLE "DraftProposal" ADD COLUMN "legalEntityId" TEXT;
ALTER TABLE "Order" ADD COLUMN "legalEntityId" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "legalEntityId" TEXT;
ALTER TABLE "CodeVault" ADD COLUMN "legalEntityId" TEXT;
ALTER TABLE "CodeEvent" ADD COLUMN "legalEntityId" TEXT;
ALTER TABLE "VaultExport" ADD COLUMN "legalEntityId" TEXT;
ALTER TABLE "UtilisationReport" ADD COLUMN "legalEntityId" TEXT;
ALTER TABLE "ImportDocument" ADD COLUMN "legalEntityId" TEXT;
ALTER TABLE "WithdrawalDocument" ADD COLUMN "legalEntityId" TEXT;
ALTER TABLE "AggregationUnit" ADD COLUMN "legalEntityId" TEXT;
ALTER TABLE "AggregationMember" ADD COLUMN "legalEntityId" TEXT;

-- 3. Deterministic backfill: one LegalEntity per Tenant (id = 'le_' || tenant.id) ----

INSERT INTO "LegalEntity" ("id", "version", "tenantId", "bin", "name", "status", "createdAt", "updatedAt")
SELECT 'le_' || t."id", 0, t."id", t."bin", t."name", 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE NOT EXISTS (SELECT 1 FROM "LegalEntity" le WHERE le."id" = 'le_' || t."id");

UPDATE "Account"            SET "legalEntityId" = 'le_' || "tenantId" WHERE "legalEntityId" IS NULL;
UPDATE "LedgerEntry"        SET "legalEntityId" = 'le_' || "tenantId" WHERE "legalEntityId" IS NULL;
UPDATE "Invoice"            SET "legalEntityId" = 'le_' || "tenantId" WHERE "legalEntityId" IS NULL;
UPDATE "Product"            SET "legalEntityId" = 'le_' || "tenantId" WHERE "legalEntityId" IS NULL;
UPDATE "ProductCard"        SET "legalEntityId" = 'le_' || "tenantId" WHERE "legalEntityId" IS NULL;
UPDATE "DraftProposal"      SET "legalEntityId" = 'le_' || "tenantId" WHERE "legalEntityId" IS NULL;
UPDATE "Order"              SET "legalEntityId" = 'le_' || "tenantId" WHERE "legalEntityId" IS NULL;
-- OrderLine has no tenantId; derive from its parent Order (already backfilled).
UPDATE "OrderLine" ol SET "legalEntityId" = o."legalEntityId"
FROM "Order" o WHERE o."id" = ol."orderId" AND ol."legalEntityId" IS NULL;
UPDATE "CodeVault"          SET "legalEntityId" = 'le_' || "tenantId" WHERE "legalEntityId" IS NULL;
UPDATE "CodeEvent"          SET "legalEntityId" = 'le_' || "tenantId" WHERE "legalEntityId" IS NULL;
UPDATE "VaultExport"        SET "legalEntityId" = 'le_' || "tenantId" WHERE "legalEntityId" IS NULL;
UPDATE "UtilisationReport"  SET "legalEntityId" = 'le_' || "tenantId" WHERE "legalEntityId" IS NULL;
UPDATE "ImportDocument"     SET "legalEntityId" = 'le_' || "tenantId" WHERE "legalEntityId" IS NULL;
UPDATE "WithdrawalDocument" SET "legalEntityId" = 'le_' || "tenantId" WHERE "legalEntityId" IS NULL;
UPDATE "AggregationUnit"    SET "legalEntityId" = 'le_' || "tenantId" WHERE "legalEntityId" IS NULL;
UPDATE "AggregationMember"  SET "legalEntityId" = 'le_' || "tenantId" WHERE "legalEntityId" IS NULL;

-- 4. Foreign keys + indexes --------------------------------------------------

ALTER TABLE "LegalEntity" ADD CONSTRAINT "LegalEntity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserLegalEntityMembership" ADD CONSTRAINT "UserLegalEntityMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserLegalEntityMembership" ADD CONSTRAINT "UserLegalEntityMembership_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Account" ADD CONSTRAINT "Account_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductCard" ADD CONSTRAINT "ProductCard_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DraftProposal" ADD CONSTRAINT "DraftProposal_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CodeVault" ADD CONSTRAINT "CodeVault_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CodeEvent" ADD CONSTRAINT "CodeEvent_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VaultExport" ADD CONSTRAINT "VaultExport_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UtilisationReport" ADD CONSTRAINT "UtilisationReport_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImportDocument" ADD CONSTRAINT "ImportDocument_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WithdrawalDocument" ADD CONSTRAINT "WithdrawalDocument_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AggregationUnit" ADD CONSTRAINT "AggregationUnit_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AggregationMember" ADD CONSTRAINT "AggregationMember_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Account_legalEntityId_idx" ON "Account"("legalEntityId");
CREATE INDEX "CodeVault_legalEntityId_idx" ON "CodeVault"("legalEntityId");
CREATE INDEX "Order_legalEntityId_idx" ON "Order"("legalEntityId");
CREATE INDEX "ProductCard_legalEntityId_idx" ON "ProductCard"("legalEntityId");
