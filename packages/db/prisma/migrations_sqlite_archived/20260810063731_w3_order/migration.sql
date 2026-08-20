-- W3: Order + OrderLine (заказ КМ, ADR-024)

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT NOT NULL,
    "cardId" TEXT,
    "gtin" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
