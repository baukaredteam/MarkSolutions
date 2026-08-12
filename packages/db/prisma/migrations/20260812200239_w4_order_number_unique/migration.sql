-- UI-06a: unique-номер заказа (гонка max+1 при параллельных create → P2002, retry в коде).
-- Backfill: заказам с number=0 (созданы до UI-05) назначаем последовательные номера.

-- SQLite: временная таблица с новыми номерами для нулей (rowid-порядок стабилен)
CREATE TEMP TABLE _order_num AS
  SELECT rowid AS _rid, ROW_NUMBER() OVER (ORDER BY "createdAt", rowid) + (SELECT COALESCE(MAX("number"), 0) FROM "Order") AS _num
  FROM "Order" WHERE "number" = 0;
UPDATE "Order" SET "number" = (SELECT _num FROM _order_num WHERE _order_num._rid = "Order".rowid)
  WHERE "number" = 0;
DROP TABLE _order_num;

-- уникальность на number (PG-порт: ALTER ... ADD CONSTRAINT работает идентично)
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");
