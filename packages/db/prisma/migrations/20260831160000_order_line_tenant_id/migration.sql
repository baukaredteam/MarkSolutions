-- OrderLine: denormalized tenant_id for DB-level tenant guard (CAT/ORD skeleton).
ALTER TABLE "OrderLine" ADD COLUMN "tenantId" TEXT;

UPDATE "OrderLine" ol
SET "tenantId" = o."tenantId"
FROM "Order" o
WHERE ol."orderId" = o."id";

ALTER TABLE "OrderLine" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "OrderLine_tenantId_idx" ON "OrderLine"("tenantId");
