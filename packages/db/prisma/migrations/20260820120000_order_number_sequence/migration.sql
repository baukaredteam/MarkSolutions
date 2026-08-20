-- W0-02R: Replace MAX(number)+1 with a PostgreSQL-owned sequence for order numbers.
-- This eliminates P2002 unique constraint conflicts under concurrent inserts.
-- Existing order numbers are preserved; the sequence starts at MAX(number)+1.

-- 1. Create the sequence
CREATE SEQUENCE IF NOT EXISTS order_number_seq;

-- 2. Initialize sequence to current max + 1 (idempotent: setval only advances)
SELECT setval('order_number_seq', COALESCE((SELECT MAX("number") FROM "Order"), 0) + 1);

-- 3. Alter the column default to use the sequence
ALTER TABLE "Order" ALTER COLUMN "number" SET DEFAULT nextval('order_number_seq'::regclass);
