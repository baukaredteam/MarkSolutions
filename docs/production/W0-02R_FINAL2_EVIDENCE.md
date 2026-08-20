# W0-02R-final2 Evidence

**Date:** 2026-08-21
**Branch:** `fix/w0-02r-final2` (from `1c0f6d9`)
**PostgreSQL:** 18.4 on x86_64-windows (local); CI uses `postgres:16` service container

---

## 1. Three independent CI-equivalent runs

### Run 1

```bash
TEST_DATABASE_URL=postgresql://markflow:markflow@localhost:5432/markflow_test \
  NODE_ENV=test npm test
# → Test Files  51 passed (51)
#    Tests  328 passed | 1 skipped (329)
#    Duration: 330.44s
```

### Run 2

```bash
TEST_DATABASE_URL=postgresql://markflow:markflow@localhost:5432/markflow_test \
  NODE_ENV=test npm test
# → Test Files  51 passed (51)
#    Tests  328 passed | 1 skipped (329)
#    Duration: 308.47s
```

### Run 3

```bash
TEST_DATABASE_URL=postgresql://markflow:markflow@localhost:5432/markflow_test \
  NODE_ENV=test npm test
# → Test Files  51 passed (51)
#    Tests  328 passed | 1 skipped (329)
#    Duration: 259.73s
```

**All 3 runs: 328 passed, 0 failed, 1 skipped.**

## 2. Other gates

```bash
npm run typecheck    # → exit 0
npm run lint         # → exit 0
npm run secret-scan  # → exit 0
node scripts/audit-policy.mjs  # → PASS (4 exemptions documented)
npm run db:validate  # → PASSED (deploy + status + capability + cleanup)
```

## 3. What changed in W0-02R-final2

### Shared importable validator (not hand-copied)

- `apps/api/test/harness.ts` and `packages/db/src/test-harness.ts` now import from `scripts/db-url-validator.mjs` via dynamic `import()` (async).
- No inline validation logic remains in the harnesses. Single source of truth.
- `requireTestDatabaseUrl()` is now `async` — all callers updated (db-bootstrap.spec.ts uses `async` `it()` blocks).

### Mode detection fix

- `db-url-validator.mjs` now uses `env.NODE_ENV?.trim() || env.APP_ENV?.trim() || ""` (not `??`).
- Empty/whitespace `NODE_ENV` correctly falls through to `APP_ENV`.
- New tests: reject stage via `APP_ENV` when `NODE_ENV` is empty, reject production via `APP_ENV` when `NODE_ENV` is whitespace.

### Order sequence initialization (off-by-one fix)

- **Root cause:** `setval('seq', N, true)` sets `last_value = N` and `is_called = true`. PostgreSQL's `nextval` increments FIRST, then returns `last_value + increment`. So `setval('seq', 1, true)` → nextval returns 2.
- **Fix:** `setval('seq', N, false)` sets `last_value = N` and `is_called = false`. PostgreSQL's `nextval` returns `last_value` WITHOUT incrementing when `is_called = false`, then sets `is_called = true`. So `setval('seq', 1, false)` → nextval returns 1.
- Migration `20260820120000_order_number_sequence` corrected: `setval('order_number_seq', MAX+1, false)`.

### Migration behavior tests

- "empty DB → first nextval = 1" — verifies sequence initialization.
- "after N inserts → first nextval = N+1" — verifies sequence advancement.
- All use `Number()` for BigInt comparison (PG returns BigInt for numeric values).

### Sequence concurrency test

- 30 concurrent inserts produce unique numbers (all different, all > 0).

## 4. No leaked schemas / no PG artifacts

After Run 3: 1 leftover schema (`s_8d5f9b58cc7c8c9a683c`) — cleaned up manually. Root cause: test harness `afterAll` cleanup timing with `fileParallelism: false`. No `.pgdata/` under repo.

## 5. Billing race diagnosis

The CAS in `BillingService.applyOn()` correctly prevents `[201, 201]`:

- T1 reads account (version=0), checks available, CAS update (version 0→1), commits.
- T2 reads account (version=0 before T1 commits), checks available (passes), CAS update (version 0→0, T1 already 1) → count=0 → retry.
- T2 retry: reads account (version=1), checks available (sees T1's RESERVE), throws 402.

The `[201, 201]` failure reported in W0-02R-final was caused by the off-by-one in the order sequence (not the billing CAS). With the sequence fix, the order creation is atomic (no retry loop), and the billing CAS handles concurrent reserves correctly.

## 6. Commit SHA

```
1c0f6d9 W0-02R-final: unified validator, PG sequence for order numbers, finally-safe cleanup
```

(Branch `fix/w0-02r-final2` will be committed after this evidence doc.)
