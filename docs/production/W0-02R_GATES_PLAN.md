# W0-02R Gates Plan — root causes and fixes

**Branch:** `fix/w0-02r-gates` from `68e1099`
**Objective:** 0-test-failure, fully green W0-02R gates on a fresh checkout with PG 16.

---

## 1. Root cause: http.spec.ts / templates.spec.ts — `app` undefined in afterAll

**Symptom:** `TypeError: Cannot read properties of undefined (reading 'close')` in afterAll.

**Root cause:** The bulk transform script (`transform-specs.cjs`) added the harness import only for specs that already import `PrismaService` (step 1: replace `import { PrismaService } ...`). `http.spec.ts` and `templates.spec.ts` do NOT import `PrismaService`, so the replacement never matched — `createTestDatabase`, `teardownTestDatabase`, and `TestDb` are used but never imported. beforeAll throws `ReferenceError` → `app` is never assigned → afterAll crashes.

**Fix:** Add the missing import to both files:

```ts
import {
  createTestDatabase,
  teardownTestDatabase,
  type TestDb,
} from "./harness";
```

---

## 2. Root cause: mpt-http.spec.ts — Stage contract test hits external service

**Symptom:** `MptPermanentError: MPT authenticate failed: 503`

**Root cause:** The Stage contract test (lines 361-393) activates when `MPT_BASE_URL && MPT_LOGIN && MPT_PASSWORD` are all set. CI sets all three (`https://httpbin.org`, `test`, `test`). The test creates `HttpMptAdapter` with real `globalThis.fetch` (no `setFetch()`) and sends POST to `httpbin.org/api/users/authenticate` → 503.

**Fix:** Gate the Stage contract test behind a dedicated opt-in flag `RUN_MPT_STAGE_CONTRACT=true`, separate from the MPT credentials used by mock-adapter tests. Change the condition:

```ts
const itStage = process.env.RUN_MPT_STAGE_CONTRACT === "true" ? it : it.skip;
```

This ensures `npm test` never depends on external availability.

---

## 3. Root cause: order.spec.ts — 500 instead of 402 under PG concurrency

**Symptom:** Two parallel order POSTs: `[201, 500]` instead of expected `[201, 402]` (balance exhaustion).

**Root cause:** Under PG `READ COMMITTED` with `$transaction`, the concurrent balance reservation path may throw a raw Prisma/DB error that isn't caught as a business `HttpException` with status 402. The order service's catch block (line 187-214) only handles P2002. Any other exception (e.g., lock timeout, serialization error) propagates as a 500.

**Fix approach:**

1. Ensure `billing.reserveOn()` throws a Nest `HttpException` (402) on insufficient balance, not a raw error.
2. Wrap the entire `$transaction` callback with a catch that maps Prisma/PG errors (e.g., `P2034` serialization failure) to appropriate HTTP exceptions.
3. Add a targeted regression test for the concurrent balance-reserve-then-order path under PG isolation.

---

## 4. Root cause: order.spec.ts UI-06a — 500 instead of 201 under PG P2002 retry

**Symptom:** Parallel order creates: one returns 201, the other 500 (expected both 201).

**Root cause:** Same mechanism as #3 — the retry path after P2002 on `number` re-enters the transaction, but `billing.reserveOn()` in the retry may encounter a lock-related error under PG that doesn't map to a clean exception.

**Fix:** Same as #3 — ensure all exception paths in the order creation transaction map to appropriate HTTP status codes.

---

## 5. .pgdata/ not in .gitignore

**Root cause:** `scripts/test-pg-start.mjs` uses `databaseDir: ".pgdata"` (repo-relative). The `.pgdata/` directory is not gitignored. After a local test run, it would be tracked/untracked in the repo.

**Fix:**

1. Add `.pgdata/`, `pgdata/`, and `*.pid` to `.gitignore`.
2. Change `test-pg-start.mjs` to use an OS-temp directory (`os.tmpdir()`) instead of repo-relative `.pgdata/`.
3. Clean up on normal exit.

---

## 6. embedded-postgres unreliable in npm ci

**Root cause:** `@embedded-postgres/windows-x64` has a postinstall script that downloads the PG binary. npm's `allowScripts` policy blocks it until explicitly approved. This makes `npm ci` unreliable for new contributors.

**Fix:** Remove `embedded-postgres` from `package.json` devDependencies. Document supported local PostgreSQL setup (native install or Docker) in README/MIGRATION_OPERATIONS. Keep `scripts/test-pg-start.mjs` as an optional helper that requires manual `npm install embedded-postgres` in the developer's environment.

---

## 7. ALLOW_TEST_DB_RESET too permissive

**Root cause:** `ALLOW_TEST_DB_RESET=true` bypasses the `markflow_test` marker check, allowing any URL (including stage/production) to be used as a test database.

**Fix:** Remove `ALLOW_TEST_DB_RESET` entirely. The harness always requires the `markflow_test` marker. If a developer needs a non-marker URL, they set `TEST_DATABASE_URL` to a URL containing `markflow_test` in the database name.

---

## 8. Test lifecycle documentation

**Missing:** No documented up/down commands for the local test lifecycle.

**Fix:** Add to MIGRATION_OPERATIONS.md:

- **Up:** `TEST_DATABASE_URL=postgresql://markflow:markflow@localhost:5432/markflow_test npm test`
- **Down:** schemas are auto-cleaned by the harness; no manual cleanup needed.
- **Local PG setup:** `docker run -d --name markflow-pg -e POSTGRES_USER=markflow -e POSTGRES_PASSWORD=markflow -e POSTGRES_DB=markflow_test -p 5432:5432 postgres:16`

---

## Implementation order

| #   | Fix                                           | Files                                                              | Risk   |
| --- | --------------------------------------------- | ------------------------------------------------------------------ | ------ |
| 1   | Add missing harness imports (http, templates) | http.spec.ts, templates.spec.ts                                    | Low    |
| 2   | Opt-in MPT Stage contract test                | mpt-http.spec.ts                                                   | Low    |
| 3   | .gitignore + test-pg-start.mjs temp dir       | .gitignore, test-pg-start.mjs                                      | Low    |
| 4   | Remove embedded-postgres from devDeps         | package.json, package-lock.json                                    | Low    |
| 5   | Remove ALLOW_TEST_DB_RESET                    | harness.ts, test-harness.ts, db-validate.mjs, db-bootstrap.spec.ts | Low    |
| 6   | Fix order concurrency (500→402)               | order.service.ts, billing.service.ts                               | Medium |
| 7   | Add order concurrency regression test         | order.spec.ts                                                      | Medium |
| 8   | Document test lifecycle                       | MIGRATION_OPERATIONS.md                                            | Low    |
| 9   | Full verification + evidence                  | all gates                                                          | —      |
| 10  | ocr-review + commit                           | —                                                                  | —      |
