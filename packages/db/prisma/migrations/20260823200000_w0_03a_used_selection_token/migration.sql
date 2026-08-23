-- W0-03a (ADR-027): durable selection-token JTI store for replay protection.
CREATE TABLE "UsedSelectionToken" (
    "jti" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsedSelectionToken_pkey" PRIMARY KEY ("jti")
);
