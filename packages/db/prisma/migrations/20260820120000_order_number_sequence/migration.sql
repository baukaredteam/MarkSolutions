-- W0-02R: Replace MAX(number)+1 with a PostgreSQL-owned sequence for order numbers.
-- W0-02R-final2: setval with called=false so nextval returns the specified value
-- WITHOUT incrementing first. On empty DB: setval(1, false) → nextval=1.
-- After N rows: setval(MAX+1, false) → nextval=MAX+1.

-- 1. Create the sequence
CREATE SEQUENCE IF NOT EXISTS order_number_seq;

-- 2. Initialize: called=false → next nextval returns MAX(number)+1
SELECT setval('order_number_seq', COALESCE((SELECT MAX("number") FROM "Order"), 0) + 1, false);

-- 3. Alter the column default to use the sequence
ALTER TABLE "Order" ALTER COLUMN "number" SET DEFAULT nextval('order_number_seq'::regclass);
