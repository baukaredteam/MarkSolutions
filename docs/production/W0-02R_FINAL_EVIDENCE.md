# W0-02R Final Evidence

**Date:** 2026-08-21
**Branch:** `fix/w0-02r-final` (from `f791fd6`)
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
#    Tests  319 passed | 1 skipped (320)

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

## 2. What changed in W0-02R-final

### Unified URL validator (`scripts/db-url-validator.mjs`)

- Single source of truth for TEST_DATABASE_URL validation.
- Parses with `new URL()`; validates protocol (`postgresql://`/`postgres://`).
- Extracts decoded database name; exact-match against approved list (`markflow_test`).
- Rejects stage/production `NODE_ENV` regardless of URL.
- Rejects `?schema=` parameter (harness sets it internally).
- Both harnesses (`apps/api/test/harness.ts`, `packages/db/src/test-harness.ts`) use identical inline logic; `scripts/db-validate.mjs` imports the validator.

### finally-safe schema cleanup

- `createTestDatabase()` wraps full flow in try/catch: if schema creation succeeds but `migrate deploy` fails, the schema is dropped before re-throwing.
- `db-validate.mjs` has the same finally-safe pattern.
- New test: "failure path cleans schema" verified.

### Order number via PostgreSQL sequence (`order_number_seq`)

- New migration `20260820120000_order_number_sequence`: `CREATE SEQUENCE`, `setval(MAX+1)`, `ALTER COLUMN SET DEFAULT nextval(...)`.
- Schema: `number Int @unique @default(dbgenerated("nextval('order_number_seq'::regclass)"))`.
- OrderService: removed `for(attempt...)` retry loop and `aggregate({ _max })`. Number comes from PG sequence atomically. IdempotencyKey P2002 still handled (return existing order).

### Integration tests (14 total in db-bootstrap.spec.ts)

- URL safety: file:, non-postgres, missing marker, stage/prod rejection, ?schema= rejection, invalid URL.
- Canonical artifacts: lock file, baseline+sequence migrations, no duplicate schemas.
- Harness behavioral: create isolated schema, migrate, write, cleanup.
- Sequence: 30 concurrent creates produce unique numbers.

## 3. Order concurrency strategy (W0-02R-final)

| Concern               | Before (W0-02R-gates)         | After (W0-02R-final)                      |
| --------------------- | ----------------------------- | ----------------------------------------- |
| Number allocation     | `MAX(number)+1` in app code   | PG sequence `order_number_seq`            |
| Concurrent uniqueness | P2002 retry loop (5 attempts) | Atomic `nextval()` — no conflict possible |
| Idempotency           | P2002 catch + findUnique      | Same (unchanged)                          |
| Balance reserve       | CAS with version bump         | Same (unchanged)                          |
| Retry scope           | Number + idempotency          | Idempotency only                          |

## 4. No leaked schemas / no PG artifacts

After `npm test`, all `s_<random>` schemas are dropped by harness `afterAll`. The base `markflow_test` database remains intact. No `.pgdata/` under repo.

## 5. Local PostgreSQL prerequisite

Documented in `MIGRATION_OPERATIONS.md`:

- Docker: `docker run -d --name markflow-pg -e POSTGRES_USER=markflow -e POSTGRES_PASSWORD=markflow -e POSTGRES_DB=markflow_test -p 5432:5432 postgres:16`
- Native: PostgreSQL 16 with `markflow` user and `markflow_test` database.
- No embedded-postgres mandatory dependency. No `.pgdata` under repo.

## 6. Commit SHA

```
f791fd6 W0-02R gates: 0-test-failure, all gates green
```

(Branch `fix/w0-02r-final` will be committed after this evidence doc.)
