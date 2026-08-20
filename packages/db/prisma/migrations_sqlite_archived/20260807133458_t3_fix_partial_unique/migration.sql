-- F1: partial unique index на (tenantId, gtin) для статусов != 'ARCHIVED'.
-- Валиден в SQLite И PostgreSQL (синтаксис WHERE в CREATE INDEX общий).
-- Значение статуса — 'ARCHIVED' (uppercase, как в schema и коде).
CREATE UNIQUE INDEX "uniq_card_tenant_gtin_active"
ON "ProductCard" ("tenantId", "gtin")
WHERE "status" != 'ARCHIVED';
