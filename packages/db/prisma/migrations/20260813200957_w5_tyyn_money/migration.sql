-- W5-07 (ADR-016 апдейт): деньги = BigInt в тиынах (1 ₸ = 100 тиын).
-- Существующие целые тенге умножаем на 100 (1 ₸ → 100 тиын).

UPDATE "Account" SET "balance" = "balance" * 100;
UPDATE "LedgerEntry" SET "amount" = "amount" * 100;
UPDATE "Tariff" SET "pricePerCodeKZT" = "pricePerCodeKZT" * 100;
UPDATE "OrderLine" SET "totalPrice" = "totalPrice" * 100, "pricePerCodeKZT" = "pricePerCodeKZT" * 100;
