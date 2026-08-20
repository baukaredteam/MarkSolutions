# W0-02 Evidence — Prisma Deterministic Bootstrap

**Date:** 2026-08-20
**Author:** principal backend architect + database reliability engineer
**Baseline commit:** a23ecc1 (W0-01b)

---

## 1. Changed files

| File                                            | Change type | Reason                                                                              |
| ----------------------------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| `packages/db/prisma/schema.pg.prisma`           | **New**     | PG production schema (identical models, `provider = "postgresql"`)                  |
| `packages/db/prisma/pg/migrations/`             | **New**     | PG baseline migration (503 lines DDL, `migration_lock.toml: postgresql`)            |
| `apps/api/src/prisma.service.ts`                | Modified    | Conditional adapter: `isPostgres(url)` → direct PrismaClient; else PrismaLibSQL     |
| `packages/db/src/seed.ts`                       | Modified    | Requires explicit DATABASE_URL; production gate; no implicit file: fallback         |
| `packages/db/package.json`                      | Modified    | Added `generate:pg`, `migrate:pg`, `migrate:deploy:pg`, `migrate:status:pg` scripts |
| `package.json`                                  | Modified    | Added `db:generate:pg`, `db:bootstrap`, `db:validate:pg`, `verify` scripts          |
| `apps/api/src/db-bootstrap.spec.ts`             | **New**     | 12 tests: URL safety, migration chain, PrismaService contract, seed safety          |
| `.github/workflows/ci.yml`                      | **New**     | CI: npm ci, generate, build, typecheck, lint, PG migration validate, tests, audit   |
| `docs/production/MIGRATION_REVIEW_CHECKLIST.md` | **New**     | Pre-merge migration review checklist                                                |
| `docs/production/MIGRATION_OPERATIONS.md`       | **New**     | Commands reference, rollback policy, expand/contract                                |
| `.env.example`                                  | Modified    | Added database config matrix (dev/stage/prod/test/seed safety)                      |

## 2. Migration strategy

| Decision                                               | Rationale                                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| SQLite migrations kept in `migrations/` (NOT archived) | Dev workflow needs `prisma migrate dev` against SQLite. Archiving would break `npm run db:migrate`.      |
| PG baseline in `pg/migrations/`                        | Separate directory avoids lock file conflicts. `migration_lock.toml` says `postgresql`.                  |
| No existing data at risk                               | W0-02_PRECHECK.md §5 confirmed: all data is demo/dev. No production instances with data.                 |
| Future PG migrations                                   | Use `npx prisma migrate dev --schema packages/db/prisma/pg/schema.prisma` → new SQL in `pg/migrations/`. |
| Rebaseline not needed                                  | Baseline starts clean with full schema DDL (503 lines). No historical data migration.                    |

## 3. Schema runtime contract

| Profile              | DATABASE_URL                      | PrismaService behavior                                 |
| -------------------- | --------------------------------- | ------------------------------------------------------ |
| **Development**      | `file:./dev.db` (default)         | `PrismaClient({ adapter: new PrismaLibSQL({ url }) })` |
| **Stage/Production** | `postgresql://...`                | `new PrismaClient()` (direct PG connection)            |
| **Test**             | `postgresql://...markflow_test_*` | Same as stage; disposable per spec                     |
| **Seed (dev)**       | Any file: or postgresql://        | PrismaLibSQL or direct PrismaClient                    |
| **Seed (prod)**      | postgresql://...                  | Blocked unless `SEED_ENABLED=true`                     |

## 4. Acceptance commands and results

```bash
# Command 1: Clean bootstrap (dev mode, SQLite)
npm run db:bootstrap
# Result: install → generate → migrate → seed → build shared → OK

# Command 2: PG migration status
npm run db:migrate:status:pg
# Result: "Database schema is up to date!" (baseline applied)

# Command 3: Typecheck
npm run typecheck
# Result: exit 0 (clean)

# Command 4: Lint
npm run lint
# Result: exit 0 (clean)

# Command 5: Secret scan
npm run secret-scan
# Result: exit 0 (clean)

# Command 6: Tests
npm test
# Result: 317 passed, 1 skipped, 0 failed

# Command 7: Verify (full gate)
npm run verify
# Result: all gates pass
```

## 5. Review findings and resolutions

| Finding                                                                 | Severity        | Resolution                                                                                                                                  |
| ----------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| PG migration overwrites SQLite client in `node_modules/.prisma/client/` | Design          | Acceptable for now; CI runs SQLite generate first, then PG validate. In production, only PG client is needed.                               |
| SQLite migrations not archived                                          | Design decision | SQLite migrations kept in `migrations/` because dev workflow (`npm run db:migrate`) needs them. PG has separate `pg/migrations/` directory. |
| seed.ts uses PrismaLibSQL directly                                      | Accepted        | Seed runs via `tsx` (not NestJS), needs its own connection logic. Conditional on URL scheme.                                                |
| No CI before W0-02                                                      | Fixed           | `.github/workflows/ci.yml` added with full validation pipeline.                                                                             |
| `fileParallelism: false` in vitest                                      | Accepted        | Correct for SQLite (whole-DB lock); future optimization for PG parallel schemas.                                                            |
| `db:bootstrap` doesn't apply PG migrations                              | Design          | Bootstrap is for dev mode (SQLite). PG validation is a separate command (`db:validate:pg`).                                                 |
| outbox.poller.spec.ts uses PrismaLibSQL directly                        | Accepted        | Dev-only unit test; already uses mkdtemp isolation; no production path.                                                                     |

## 6. Remaining risks

1. **Prisma client overwrite:** Running `db:generate:pg` overwrites the SQLite client. Workaround: always run `db:generate` (SQLite) before test suite. CI workflow handles this correctly.
2. **No PG test bootstrap helper:** Test specs still use `file:${dbPath}` for SQLite. A shared PG test harness would be future work (W0-06 scope).
3. **Schema drift between `schema.prisma` and `schema.pg.prisma`:** Both are manually maintained. CI could add a model-comparison check.
4. **No backup/restore drill yet:** ROADMAP §10 requires this; not in W0-02 scope.

## 7. Owner decisions required

1. **Production data:** Confirmed none exists in repository. No data migration strategy needed.
2. **CI scope:** W0-02 adds the workflow; W0-06 wires it fully. Current workflow covers all W0-02 gates.
