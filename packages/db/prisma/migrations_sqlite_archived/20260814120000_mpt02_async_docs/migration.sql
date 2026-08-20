-- AlterTable (тикет MPT-02: async state machine документов)
ALTER TABLE "WithdrawalDocument" ADD COLUMN "aggregateUnits" TEXT;
ALTER TABLE "WithdrawalDocument" ADD COLUMN "externalDocumentId" TEXT;

-- CreateIndex (C-05: одна проводка вида на заказ; NULL refOrderId не конфликтует)
CREATE UNIQUE INDEX "LedgerEntry_refOrderId_kind_key" ON "LedgerEntry"("refOrderId", "kind");
