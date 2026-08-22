-- W0-03a pt2 (ADR-027): database-level scope invariants.
--
-- 1. Compound UNIQUE (id, tenantId) on LegalEntity enables composite FKs so a
--    row with tenant A + legal entity of tenant B can NEVER be persisted.
-- 2. Protected rows get composite FKs (legalEntityId, tenantId). Simple FKs
--    are replaced. OrderLine has no tenantId column (derived from Order) and
--    keeps its simple FK + application-level scope predicate (documented in
--    W0-03A_FOLLOWUP.md).
-- 3. Retention: ON DELETE SET NULL is replaced by RESTRICT — deleting/
--    deactivating a legal entity can never silently detach financial, audit
--    or Code Vault evidence. Lifecycle changes use status transitions.
--
-- legalEntityId NOT NULL (contract phase) remains deferred until every write
-- path is verified scoped; see W0-03A_FOLLOWUP.md.

CREATE UNIQUE INDEX IF NOT EXISTS "LegalEntity_id_tenantId_key"
  ON "LegalEntity"("id", "tenantId");

-- Account --------------------------------------------------------------------
ALTER TABLE "Account" DROP CONSTRAINT IF EXISTS "Account_legalEntityId_fkey";
ALTER TABLE "Account" ADD CONSTRAINT "Account_le_scope_fkey"
  FOREIGN KEY ("legalEntityId", "tenantId") REFERENCES "LegalEntity"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- LedgerEntry ----------------------------------------------------------------
ALTER TABLE "LedgerEntry" DROP CONSTRAINT IF EXISTS "LedgerEntry_legalEntityId_fkey";
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_le_scope_fkey"
  FOREIGN KEY ("legalEntityId", "tenantId") REFERENCES "LegalEntity"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invoice --------------------------------------------------------------------
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_legalEntityId_fkey";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_le_scope_fkey"
  FOREIGN KEY ("legalEntityId", "tenantId") REFERENCES "LegalEntity"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Product --------------------------------------------------------------------
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_legalEntityId_fkey";
ALTER TABLE "Product" ADD CONSTRAINT "Product_le_scope_fkey"
  FOREIGN KEY ("legalEntityId", "tenantId") REFERENCES "LegalEntity"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ProductCard ----------------------------------------------------------------
ALTER TABLE "ProductCard" DROP CONSTRAINT IF EXISTS "ProductCard_legalEntityId_fkey";
ALTER TABLE "ProductCard" ADD CONSTRAINT "ProductCard_le_scope_fkey"
  FOREIGN KEY ("legalEntityId", "tenantId") REFERENCES "LegalEntity"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- DraftProposal --------------------------------------------------------------
ALTER TABLE "DraftProposal" DROP CONSTRAINT IF EXISTS "DraftProposal_legalEntityId_fkey";
ALTER TABLE "DraftProposal" ADD CONSTRAINT "DraftProposal_le_scope_fkey"
  FOREIGN KEY ("legalEntityId", "tenantId") REFERENCES "LegalEntity"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Order ----------------------------------------------------------------------
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_legalEntityId_fkey";
ALTER TABLE "Order" ADD CONSTRAINT "Order_le_scope_fkey"
  FOREIGN KEY ("legalEntityId", "tenantId") REFERENCES "LegalEntity"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CodeVault ------------------------------------------------------------------
ALTER TABLE "CodeVault" DROP CONSTRAINT IF EXISTS "CodeVault_legalEntityId_fkey";
ALTER TABLE "CodeVault" ADD CONSTRAINT "CodeVault_le_scope_fkey"
  FOREIGN KEY ("legalEntityId", "tenantId") REFERENCES "LegalEntity"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CodeEvent ------------------------------------------------------------------
ALTER TABLE "CodeEvent" DROP CONSTRAINT IF EXISTS "CodeEvent_legalEntityId_fkey";
ALTER TABLE "CodeEvent" ADD CONSTRAINT "CodeEvent_le_scope_fkey"
  FOREIGN KEY ("legalEntityId", "tenantId") REFERENCES "LegalEntity"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- VaultExport ----------------------------------------------------------------
ALTER TABLE "VaultExport" DROP CONSTRAINT IF EXISTS "VaultExport_legalEntityId_fkey";
ALTER TABLE "VaultExport" ADD CONSTRAINT "VaultExport_le_scope_fkey"
  FOREIGN KEY ("legalEntityId", "tenantId") REFERENCES "LegalEntity"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- UtilisationReport ----------------------------------------------------------
ALTER TABLE "UtilisationReport" DROP CONSTRAINT IF EXISTS "UtilisationReport_legalEntityId_fkey";
ALTER TABLE "UtilisationReport" ADD CONSTRAINT "UtilisationReport_le_scope_fkey"
  FOREIGN KEY ("legalEntityId", "tenantId") REFERENCES "LegalEntity"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ImportDocument -------------------------------------------------------------
ALTER TABLE "ImportDocument" DROP CONSTRAINT IF EXISTS "ImportDocument_legalEntityId_fkey";
ALTER TABLE "ImportDocument" ADD CONSTRAINT "ImportDocument_le_scope_fkey"
  FOREIGN KEY ("legalEntityId", "tenantId") REFERENCES "LegalEntity"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- WithdrawalDocument ---------------------------------------------------------
ALTER TABLE "WithdrawalDocument" DROP CONSTRAINT IF EXISTS "WithdrawalDocument_legalEntityId_fkey";
ALTER TABLE "WithdrawalDocument" ADD CONSTRAINT "WithdrawalDocument_le_scope_fkey"
  FOREIGN KEY ("legalEntityId", "tenantId") REFERENCES "LegalEntity"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AggregationUnit ------------------------------------------------------------
ALTER TABLE "AggregationUnit" DROP CONSTRAINT IF EXISTS "AggregationUnit_legalEntityId_fkey";
ALTER TABLE "AggregationUnit" ADD CONSTRAINT "AggregationUnit_le_scope_fkey"
  FOREIGN KEY ("legalEntityId", "tenantId") REFERENCES "LegalEntity"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AggregationMember ----------------------------------------------------------
ALTER TABLE "AggregationMember" DROP CONSTRAINT IF EXISTS "AggregationMember_legalEntityId_fkey";
ALTER TABLE "AggregationMember" ADD CONSTRAINT "AggregationMember_le_scope_fkey"
  FOREIGN KEY ("legalEntityId", "tenantId") REFERENCES "LegalEntity"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
