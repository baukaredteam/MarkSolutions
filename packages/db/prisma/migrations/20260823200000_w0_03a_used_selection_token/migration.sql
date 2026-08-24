-- W0-03a (ADR-027): durable selection-token store — hashed, user/tenant-bound.
CREATE TABLE "UsedSelectionToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsedSelectionToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsedSelectionToken_tokenHash_key" ON "UsedSelectionToken"("tokenHash");
CREATE INDEX "UsedSelectionToken_userId_createdAt_idx" ON "UsedSelectionToken"("userId", "createdAt");
