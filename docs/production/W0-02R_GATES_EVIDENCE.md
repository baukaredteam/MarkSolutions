# W0-02R Gates Evidence

**Date:** 2026-08-20
**Branch:** `fix/w0-02r-gates` (from `68e1099`)
**PostgreSQL:** 18.4 on x86_64-windows (local); CI uses `postgres:16` service container

---

## 1. Fresh clone gate sequence

```bash
# 1. npm ci
npm ci
# → exit 0

# 2. db:generate (single canonical PG client)
npm run db:generate
# → Generated Prisma Client (v6.19.3)

# 3. db:validate (deploy + status + capability on disposable schema)
TEST_DATABASE_URL=postgresql://markflow:markflow@localhost:5432/markflow_test npm run db:validate
# → db:validate: PASSED

# 4. full test suite
TEST_DATABASE_URL=postgresql://markflow:markflow@localhost:5432/markflow_test npm test
# → Test Files  51 passed (51)
#    Tests  314 passed | 1 skipped (315)

# 5. typecheck
npm run typecheck
# → exit 0

# 6. lint
npm run lint
# → exit 0

# 7. secret-scan
npm run secret-scan
# → exit 0

# 8. dependency audit
node scripts/audit-policy.mjs
# → audit-policy: PASS — no non-exempt high/critical vulnerabilities
```

## 2. PostgreSQL version

```
PostgreSQL 18.4 on x86_64-windows, compiled by msvc-19.44.35227, 64-bit
```

CI uses `postgres:16` Docker image (verified in `.github/workflows/ci.yml`).

## 3. Formerly failing tests — root-cause fixes

### http.spec.ts — `app` undefined in afterAll

**Root cause:** Missing `import { createTestDatabase, teardownTestDatabase, type TestDb } from "./harness"`. The bulk transform script only added imports for specs that import `PrismaService`; `http.spec.ts` does not.

**Fix:** Added the missing import. `beforeAll` now creates testDb and assigns `app` correctly.

### templates.spec.ts — `app` undefined in afterAll + `execSync is not defined`

**Root cause:** Same missing harness import, plus the transform removed the `execSync` import (from `node:child_process`) which is still used for the redundant migrate deploy in `beforeAll`.

**Fix:** Added both missing imports: `createTestDatabase/teardownTestDatabase/TestDb` from `./harness` and `execSync` from `node:child_process`.

### mpt-http.spec.ts — `MptPermanentError: MPT authenticate failed: 503`

**Root cause:** The Stage contract test activated when `MPT_BASE_URL`, `MPT_LOGIN`, `MPT_PASSWORD` were all set (CI sets them to `httpbin.org`). The test used real `globalThis.fetch` against an external service.

**Fix:** Gated behind `RUN_MPT_STAGE_CONTRACT=true` (opt-in). `npm test` never depends on external availability.

### order.spec.ts — `[201, 500]` instead of `[201, 402]` and `[201, 201]`

**Root cause:** `PrismaClientKnownRequestError` P2002 has `meta.target = null` on PG. The catch block did `target?.includes("number")` — `null?.includes()` throws TypeError → unhandled → 500.

**Fix:**

1. Added `Array.isArray(target)` guard before `.includes()` calls.
2. Treat all P2002 with null target as retryable (up to 5 attempts with backoff).
3. Added `HttpException` early-return in catch block so business exceptions (402, 409) propagate correctly.
4. Increased retry limit from 2 to 5 to handle PG READ COMMITTED stale reads on `max(number)`.

## 4. No tracked PostgreSQL runtime directory

```bash
git status --short | grep -E "\.pgdata|pgdata|\.pid"
# → (empty — no tracked PG artifacts)
```

`.pgdata/`, `pgdata/`, `*.pid` added to `.gitignore`. `test-pg-start.mjs` uses OS temp directory.

## 5. ALLOW_TEST_DB_RESET removed

The harness now always requires `markflow_test` in `TEST_DATABASE_URL`. No bypass flag.

## 6. embedded-postgres removed from devDeps

Not in `package.json`. Documented local PostgreSQL setup in `MIGRATION_OPERATIONS.md`.

## 7. Audit policy

4 exemptions documented in `scripts/audit-exceptions.json` (deepmerge-ts, @prisma/config, prisma, nanoid) — all DEV-ONLY transitive deps, not in production runtime. Expiry: 2026-11-30.
