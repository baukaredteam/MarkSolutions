# W0-02R Final Plan — close remaining correctness gaps

**Branch:** `fix/w0-02r-final` from `f791fd6`
**Objective:** Close 2 High correctness gaps + cleanup. No adapters/KMS/storage/queue/MPT/billing/UI changes.

---

## Gap 1: Duplicated TEST_DATABASE_URL validators → one shared helper

**Current state:** 3 copies of `requireTestDatabaseUrl()`:

- `apps/api/test/harness.ts` (TS)
- `packages/db/src/test-harness.ts` (TS)
- `scripts/db-validate.mjs` (JS)

All use substring matching (`url.includes("markflow_test")`), no URL parsing, no stage/prod rejection.

**Fix:**

1. Create `scripts/db-url-validator.mjs` — single source of truth for URL validation.
2. Parse with `new URL()`; validate protocol (`postgresql://` or `postgres://`); extract database pathname; reject if not exactly `markflow_test` (exact match, not substring); reject if `NODE_ENV` is `production` or `stage`; no override flag.
3. `scripts/db-validate.mjs` imports the validator.
4. TS harnesses use dynamic `import()` to load the validator.
5. Tests in `db-bootstrap.spec.ts` exercise the validator against all rejection paths.

## Gap 2: Schema cleanup `finally`-safe

**Current state:** `createTestDatabase()` creates schema, runs `migrate deploy`. If `migrate deploy` fails, the schema is never cleaned up (no `finally` block around the full flow).

**Fix:**

1. Wrap the full `createTestDatabase()` flow in try/catch/finally: on any error after schema creation, drop the schema before re-throwing.
2. Same pattern in `db-validate.mjs`: wrap the full flow so the schema is always dropped.
3. Add a test: "failure path cleans schema" — intentionally fail `migrate deploy` on a bad schema, verify the schema is dropped.

## Gap 3: Order number via PostgreSQL sequence

**Current state:** `MAX(number)+1` with P2002 retry loop (5 attempts). Under PG READ COMMITTED, stale reads cause spurious conflicts.

**Fix:**

1. New migration: `CREATE SEQUENCE order_number_seq; SELECT setval(..., MAX+1); ALTER TABLE "Order" ALTER COLUMN "number" SET DEFAULT nextval('order_number_seq'::regclass);`
2. Schema: change `number Int @unique @default(0)` → `number Int @unique @default(dbgenerated("nextval('order_number_seq'::regclass)"))`.
3. OrderService: remove the `for (attempt...)` retry loop and `aggregate({ _max })` logic. The number comes from the sequence automatically. Keep only idempotencyKey collision handling (P2002 on idempotencyKey → return existing order).
4. Remove the `HttpException` import if no longer needed (check).
5. Update tests: UI-06a now tests that concurrent creates get unique numbers without any retry logic visible.

## Gap 4: Integration tests for validation + concurrency

**Add to `db-bootstrap.spec.ts`:**

1. "rejects stage/production NODE_ENV" — set `NODE_ENV=production`, verify rejection.
2. "failure path cleans schema" — createTestDatabase with invalid schema name, verify cleanup.
3. "20-50 concurrent order creates produce unique numbers" — parallel POST /orders, verify all get unique numbers, correct reserve/ledger invariants.
4. "same-key idempotency returns existing order" — parallel POST with same Idempotency-Key.

## Gap 5: Documentation

- MIGRATION_OPERATIONS.md: already has test lifecycle docs. Verify no `.pgdata` under repo, no embedded-postgres in mandatory deps.
- Add sequence ownership note to migration docs.

---

## Implementation order

| #   | What                                              | Files                                        | Risk   |
| --- | ------------------------------------------------- | -------------------------------------------- | ------ |
| 1   | Shared URL validator                              | scripts/db-url-validator.mjs                 | Low    |
| 2   | Refactor harnesses + db-validate to use validator | harness.ts, test-harness.ts, db-validate.mjs | Low    |
| 3   | finally-safe cleanup in harnesses                 | harness.ts, test-harness.ts, db-validate.mjs | Low    |
| 4   | Order number sequence migration                   | packages/db/prisma/migrations/               | Medium |
| 5   | Schema: @default(dbgenerated(...))                | schema.prisma                                | Medium |
| 6   | OrderService: remove retry loop                   | order.service.ts                             | Medium |
| 7   | Integration tests                                 | db-bootstrap.spec.ts, order.spec.ts          | Medium |
| 8   | Verify all gates                                  | typecheck, lint, tests, db:validate          | —      |
| 9   | Evidence doc                                      | W0-02R_FINAL_EVIDENCE.md                     | —      |
| 10  | Commit + push                                     | —                                            | —      |
