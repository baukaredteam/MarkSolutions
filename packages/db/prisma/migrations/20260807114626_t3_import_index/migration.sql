-- DropIndex
DROP INDEX "ProductCard_tenantId_gtin_key";

-- CreateIndex
CREATE INDEX "ProductCard_tenantId_gtin_idx" ON "ProductCard"("tenantId", "gtin");
