-- W0-03a pt3 (ADR-027): OrderLine dual-scope hardening.
-- Adds tenantId (backfilled from the parent Order), makes it NOT NULL, and
-- replaces the simple legalEntityId FK with a composite FK so a mismatched
-- (legalEntityId, tenantId) pair is impossible in PostgreSQL.

ALTER TABLE "OrderLine" ADD COLUMN "tenantId" TEXT;

UPDATE "OrderLine" ol
SET "tenantId" = o."tenantId"
FROM "Order" o
WHERE o."id" = ol."orderId" AND ol."tenantId" IS NULL;

ALTER TABLE "OrderLine" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "OrderLine_tenantId_idx" ON "OrderLine"("tenantId");

ALTER TABLE "OrderLine" DROP CONSTRAINT IF EXISTS "OrderLine_legalEntityId_fkey";
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_le_scope_fkey"
  FOREIGN KEY ("legalEntityId", "tenantId") REFERENCES "LegalEntity"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
