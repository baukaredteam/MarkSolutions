-- W0-03a pt3 (ADR-027) — contract phase: legalEntityId NOT NULL on all
-- dual-scoped models. Backfill verified by 20260822120000 + service threading
-- verified by suite; composite FKs already enforce LE∈Tenant.
-- OrderLine.tenantId was made NOT NULL in 20260823090000.

ALTER TABLE "Account" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "LedgerEntry" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "ProductCard" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "DraftProposal" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "OrderLine" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "CodeVault" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "CodeEvent" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "VaultExport" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "UtilisationReport" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "ImportDocument" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "WithdrawalDocument" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "AggregationUnit" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "AggregationMember" ALTER COLUMN "legalEntityId" SET NOT NULL;
