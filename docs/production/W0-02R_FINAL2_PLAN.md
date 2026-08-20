# W0-02R-final2 Plan — close remaining correctness gaps

**Branch:** `fix/w0-02r-final2` from `1c0f6d9`
**Root-cause hypotheses and reproducibility plans for each blocker.**

---

## Issue 1: Shared importable validator (not hand-copied)

**Root cause:** Both harnesses (`apps/api/test/harness.ts`, `packages/db/src/test-harness.ts`) have inline validation logic identical to `scripts/db-url-validator.mjs`. This violates "one shared helper" — it's 3 copies of the same logic with subtly different error messages.

**Hypothesis:** The `createRequire(import.meta.url)` approach failed in Vitest's ESM context because `import.meta.url` points to a virtual module. Dynamic `import()` is the correct ESM mechanism.

**Fix:**

1. Make `requireTestDatabaseUrl()` async in both harnesses.
2. Use `await import("../../../scripts/db-url-validator.mjs")` to load the shared validator.
3. Update `db-bootstrap.spec.ts` — 8 `it()` blocks become async, use `await expect(...).rejects.toThrow()`.
4. Verify: all three consumers (harness.ts, test-harness.ts, db-validate.mjs) use the same validation logic from one file.

**Reproducibility:** Run `grep -r "requireTestDatabaseUrl\|validateTestDatabaseUrl" --include="*.ts" --include="*.mjs"` — should show import from shared module, not inline copies.

## Issue 2: Sequence initialization correctness

**Root cause:** The migration `20260820120000_order_number_sequence` uses `CREATE SEQUENCE IF NOT EXISTS` + `setval`. On an empty DB: `CREATE SEQUENCE` sets current=1, `setval(seq, 1)` is a no-op (current already 1). First `nextval()` returns 1. After N inserts, first `nextval()` returns N+1. This is correct but untested.

**Hypothesis:** The sequence initialization is correct but the test only checks "30 concurrent inserts produce unique numbers" — it doesn't verify the exact starting value or the post-insert behavior.

**Fix:** Add a migration behavior test:

1. Create fresh schema, migrate, verify `nextval()` = 1 (empty DB).
2. Insert N rows, verify `nextval()` = N+1.
3. Verify `setval` idempotency: re-run migration SQL, verify sequence doesn't reset.

**Reproducibility:** Run the new test in isolation.

## Issue 3: Billing race condition

**Root cause:** The CAS in `BillingService.applyOn()` reads account, checks available, then CAS-updates. Under PG `READ COMMITTED`:

- T1: reads account (version=0), checks available (100000-0=100000 >= 60000 → true), CAS update (version 0→1), creates RESERVE.
- T2: reads account (version=0 before T1 commits), checks available (100000-0=100000 >= 60000 → true), CAS update (version 0→0, T1 already 1) → count=0 → retry.
- T2 retry: reads account (version=1), checks available (100000-60000=40000 >= 60000 → false) → 402.

This should prevent `[201, 201]`. But the user reports it failed. Possible causes:

1. Test environment contamination (residual data from previous test in same schema).
2. The CAS check reads `current.balance` instead of re-reading after CAS conflict.
3. The `activeReserve()` call within `$transaction` might not see T1's committed RESERVE due to PG isolation.

**Hypothesis:** The CAS retry loop re-reads `current` at the top of each iteration, but the `checkAvailable` closure captures `current.balance` and calls `activeReserve(db, tenantId)`. Under `READ COMMITTED`, `activeReserve` sees committed data. If T1 committed, T2 sees T1's RESERVE. This should work.

**Reproducibility:** Run `billing.spec.ts` and `order.spec.ts` concurrently 10 times. If any run produces `[201, 201]`, the CAS has a bug.

**Fix if CAS is correct:** Add a 30+ concurrent reserve regression test that proves `sum(active reserves) <= balance` and non-success = 402/409/503.

**Fix if CAS has a bug:** The issue is likely that `checkAvailable` reads `current.balance` (stale) instead of re-reading the account after CAS conflict. Fix: re-read account inside the retry loop.

---

## Implementation order

| #   | What                                | Files                                             |
| --- | ----------------------------------- | ------------------------------------------------- |
| 1   | Shared validator via dynamic import | harness.ts, test-harness.ts, db-bootstrap.spec.ts |
| 2   | Sequence behavior test              | db-bootstrap.spec.ts                              |
| 3   | Billing race regression test        | billing.spec.ts, order.spec.ts                    |
| 4   | Three CI-equivalent runs            | —                                                 |
| 5   | Evidence doc + commit               | W0-02R_FINAL2_EVIDENCE.md                         |
