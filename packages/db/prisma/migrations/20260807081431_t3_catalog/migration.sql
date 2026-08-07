-- CreateTable
CREATE TABLE "ProductCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "gtin" TEXT,
    "ntin" TEXT,
    "attributes" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductCard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DraftProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT,
    "source" TEXT NOT NULL,
    "proposed" JSONB NOT NULL,
    "missing" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DraftProposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DraftProposal_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "ProductCard" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductCard_tenantId_gtin_key" ON "ProductCard"("tenantId", "gtin");
