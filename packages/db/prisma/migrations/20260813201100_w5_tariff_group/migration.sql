-- W5-07: Tariff += productGroup (товарная группа) + vatIncluded (цена включает НДС).

ALTER TABLE "Tariff" ADD COLUMN "productGroup" TEXT;
ALTER TABLE "Tariff" ADD COLUMN "vatIncluded" BOOLEAN NOT NULL DEFAULT 1;
