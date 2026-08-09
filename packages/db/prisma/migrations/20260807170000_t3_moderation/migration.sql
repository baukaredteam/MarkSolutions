-- T3-moderation (CAT-013): аудит переходов, fieldReasons, ordersBlocked на карточке;
-- GtinCache — трёхслойный справочник GTIN (GtinResolver Q6).

-- RedefineTables: ProductCard + audit + fieldReasons + ordersBlocked
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProductCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductCard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProductCard" ("createdAt", "gtin", "id", "ntin", "status", "tenantId", "updatedAt", "version", "attributes")
SELECT "createdAt", "gtin", "id", "ntin", "status", "tenantId", "updatedAt", "version", "attributes" FROM "ProductCard";
DROP TABLE "ProductCard";
ALTER TABLE "new_ProductCard" RENAME TO "ProductCard";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex (восстанавливаем после RedefineTables)
CREATE UNIQUE INDEX "uniq_card_tenant_gtin_active"
ON "ProductCard" ("tenantId", "gtin")
WHERE "status" != 'ARCHIVED';

-- обычный индекс (т3_import_index) тоже теряется при DROP TABLE — восстанавливаем
CREATE INDEX "ProductCard_tenantId_gtin_idx" ON "ProductCard"("tenantId", "gtin");

-- CreateTable
CREATE TABLE "GtinCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "gtin" TEXT NOT NULL,
    "gcp" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REAL',
    "brand" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ig',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "GtinCache_gtin_key" ON "GtinCache"("gtin");
