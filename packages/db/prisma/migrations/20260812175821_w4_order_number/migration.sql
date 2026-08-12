-- UI-05: Order.number (номер заказа KM-2026-NNNNNN), инкремент в коде (портабельно SQLite/PG)

ALTER TABLE "Order" ADD COLUMN "number" INTEGER NOT NULL DEFAULT 0;
