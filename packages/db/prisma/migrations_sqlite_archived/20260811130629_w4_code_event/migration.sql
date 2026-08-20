-- W4: CodeEvent (append-only статусы КМ) + SsscCounter (тенант-счётчик SSCC)

-- CreateTable
CREATE TABLE "CodeEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "reasonCode" TEXT,
    "comment" TEXT,
    "relatedId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CodeEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CodeEvent_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "CodeVault" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CodeEvent_tenantId_codeId_idx" ON "CodeEvent"("tenantId", "codeId");
CREATE INDEX "CodeEvent_tenantId_event_idx" ON "CodeEvent"("tenantId", "event");

-- CreateTable
CREATE TABLE "SsscCounter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "nextSeq" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SsscCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SsscCounter_tenantId_key" ON "SsscCounter"("tenantId");
