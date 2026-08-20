-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DraftProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT,
    "source" TEXT NOT NULL,
    "proposed" JSONB NOT NULL,
    "missing" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "audit" JSONB NOT NULL DEFAULT [],
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DraftProposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DraftProposal_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "ProductCard" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DraftProposal" ("cardId", "createdAt", "demo", "id", "missing", "proposed", "source", "status", "tenantId", "updatedAt", "version") SELECT "cardId", "createdAt", "demo", "id", "missing", "proposed", "source", "status", "tenantId", "updatedAt", "version" FROM "DraftProposal";
DROP TABLE "DraftProposal";
ALTER TABLE "new_DraftProposal" RENAME TO "DraftProposal";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
