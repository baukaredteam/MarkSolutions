# W0-02 Precheck — Evidence Table

**Date:** 2026-08-20
**Commit baseline:** e22d4ac + a23ecc1 (main)

## 1. DATABASE_URL and SQLite/libSQL usage

| Path                                                | Observation                                                                                                                                           | Production risk                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/prisma/schema.prisma:10`               | `provider = "sqlite"`                                                                                                                                 | **Blocker.** Production target is PostgreSQL 16. Schema must switch to `postgresql`.                                                          |
| `packages/db/prisma/migrations/migration_lock.toml` | `provider = "sqlite"`                                                                                                                                 | **Blocker.** Prisma refuses to run `migrate deploy` if current provider ≠ lock provider. All 25 migrations are locked to SQLite.              |
| `apps/api/src/prisma.service.ts:1-17`               | `PrismaLibSQL` adapter hardcoded; `DEFAULT_DB` resolves to `packages/db/prisma/dev.db` via `file:///` URL                                             | **Blocker.** Production requires direct `PrismaClient` with PostgreSQL connection string. No adapter needed for PG.                           |
| `apps/api/src/prisma.service.ts:22-23`              | `super({ adapter: new PrismaLibSQL({ url }) })` — reads `DATABASE_URL` or falls back to `DEFAULT_DB`                                                  | Adapter-based routing must be removed or gated; PG does not need libSQL.                                                                      |
| `apps/api/src/config-validation.ts`                 | `buildAppConfig()` validates `DATABASE_URL` starts with `postgresql://` in production/stage                                                           | Good. Validates URL scheme but does not gate runtime adapter selection.                                                                       |
| `.env.example:2`                                    | `DATABASE_URL="file:./dev.db"`                                                                                                                        | Local dev default. Must have separate test/stage/prod examples.                                                                               |
| `packages/db/package.json` scripts                  | `generate: prisma generate`; `migrate: prisma migrate dev`; `seed: tsx src/seed.ts`                                                                   | `migrate dev` is interactive (generates new migrations). Production uses `migrate deploy`.                                                    |
| `apps/api/test/*.spec.ts` (all 25 spec files)       | Each creates `mkdtemp()`, sets `process.env.DATABASE_URL = file:${dbPath}`, runs `npx prisma migrate deploy`, creates `PrismaService` via `AppModule` | **Blocker for PG.** Test bootstrap assumes file-based SQLite DB. For PG, tests need `TEST_DATABASE_URL` pointing to a disposable PG database. |

## 2. Migration inventory and PostgreSQL compatibility

| Migration                                 | SQLite-compatible SQL                                                  | PostgreSQL concern                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260806124013_init`                     | `TEXT NOT NULL PRIMARY KEY`, `INTEGER`, `DATETIME`, `BOOLEAN`, `JSONB` | `TEXT PRIMARY KEY` = implicit rowid in SQLite. PG needs explicit `TEXT NOT NULL DEFAULT gen_random_uuid()` or `SERIAL`. **Not directly deployable to PG.** |
| `20260806171702_t1_onboarding`            | `ALTER TABLE "Product" ADD COLUMN ...`                                 | ALTER syntax is compatible. Column types added by Prisma.                                                                                                  |
| `20260807081431_t3_catalog`               | Table creation with `JSONB`, `TEXT`                                    | Same init migration concern: autoincrement defaults differ.                                                                                                |
| `20260807114626_t3_import_index`          | `CREATE UNIQUE INDEX`                                                  | Compatible.                                                                                                                                                |
| `20260807115824_t3_audit`                 | JSONB columns                                                          | Compatible.                                                                                                                                                |
| `20260807133458_t3_fix_partial_unique`    | `CREATE UNIQUE INDEX ... WHERE`                                        | SQLite supports partial indexes. PG also supports them. Compatible.                                                                                        |
| `20260807170000_t3_moderation`            | Table creation                                                         | Compatible types (TEXT, JSONB, INTEGER).                                                                                                                   |
| `20260809214353_w3_ledger_tariff`         | Table creation                                                         | Compatible.                                                                                                                                                |
| `20260810063731_w3_order`                 | Table creation                                                         | Compatible.                                                                                                                                                |
| `20260810171130_w3_mpt_simulator`         | Table creation                                                         | Compatible.                                                                                                                                                |
| `20260810201429_w3_code_vault`            | Table creation                                                         | Compatible.                                                                                                                                                |
| `20260811001232_w3_utilisation`           | Table creation                                                         | Compatible.                                                                                                                                                |
| `20260811130629_w4_code_event`            | Table creation                                                         | Compatible.                                                                                                                                                |
| `20260811142805_w4_label_key`             | `ALTER TABLE`                                                          | Compatible.                                                                                                                                                |
| `20260811161010_w4_documents`             | Table creation + ALTER                                                 | Compatible.                                                                                                                                                |
| `20260811171313_w4_alert_fired_at`        | `ALTER TABLE`                                                          | Compatible.                                                                                                                                                |
| `20260812175821_w4_order_number`          | `ALTER TABLE`                                                          | Compatible.                                                                                                                                                |
| `20260812200239_w4_order_number_unique`   | `CREATE UNIQUE INDEX`                                                  | Compatible.                                                                                                                                                |
| `20260813200957_w5_tyyn_money`            | `UPDATE ... SET balance = balance * 100`                               | **Data backfill migration.** Must run exactly once; idempotency guard needed for PG baseline.                                                              |
| `20260813201100_w5_tariff_group`          | `ALTER TABLE`                                                          | Compatible.                                                                                                                                                |
| `20260813201200_w5_invoice`               | Table creation                                                         | Compatible.                                                                                                                                                |
| `20260814120000_mpt02_async_docs`         | `ALTER TABLE` + `CREATE UNIQUE INDEX`                                  | Compatible.                                                                                                                                                |
| `20260814140000_mpt03_finances`           | `ALTER TABLE`                                                          | Compatible.                                                                                                                                                |
| `20260814141000_mpt03_util_businessplace` | `ALTER TABLE`                                                          | Compatible.                                                                                                                                                |

**Conclusion:** 25 SQLite migrations. Core table CREATEs use `TEXT NOT NULL PRIMARY KEY` (implicit rowid) which differs from PG conventions. The w5_tyyn_money migration is a destructive backfill (`balance * 100`) that cannot be re-run safely on PG. **Historical migrations are NOT PostgreSQL-compatible as-is.** A PG rebaseline is required.

## 3. Clean checkout bootstrap path

| Step            | Command                                          | Observed result                                             | Issue                                                 |
| --------------- | ------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------- |
| 1. Install      | `npm install`                                    | Installs @prisma/adapter-libsql, @prisma/client, prisma     | OK                                                    |
| 2. Generate     | `npx prisma generate`                            | Generates client with SQLite adapter                        | **Blocks typecheck** if PG provider expected          |
| 3. Build shared | `npm run build:cjs --workspace @markflow/shared` | Generates CJS dist                                          | Depends on @prisma/client types                       |
| 4. Migrate      | `npx prisma migrate deploy`                      | **Fails if no dev.db exists**                               | No documented way to bootstrap                        |
| 5. Typecheck    | `npm run typecheck`                              | **Passes only if .prisma/client exists**                    | Silent dependency on step 2                           |
| 6. Tests        | `npm test`                                       | Each test creates mkdtemp + migrate deploy against file: DB | Works with SQLite; **needs TEST_DATABASE_URL for PG** |

**No single documented command** achieves steps 1-6 from a clean checkout. The README shows manual `npm install → db:generate → dev` but does not cover: (a) first-time `prisma migrate deploy` against a fresh DB, (b) seed, or (c) test bootstrap.

## 4. CI configuration

| Artifact             | Status                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `.github/workflows/` | **Does not exist**                                                                       |
| `.github/actions/`   | **Does not exist**                                                                       |
| `.husky/pre-commit`  | Runs: `npx lint-staged` → `npm run typecheck` → `npm run secret-scan`                    |
| `scripts/*.mjs`      | demo-reset, demo-smoke, e2e-browser, guard-push, secret-scan, shell-screenshot, ui*-diff |

**No CI pipeline exists.** Only a local Husky pre-commit hook. There is no GitHub Actions, CircleCI, or any other CI definition. The pre-commit hook does NOT run tests — only lint-staged (prettier + eslint) + typecheck + secret-scan.

## 5. Production data presence

| Evidence                       | Finding                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/seed.ts`      | Creates demo users (operator, admin), GTINs (RAVENOL, codes_success), and a default tariff (100 KZT). All marked `demo` or `seed`. |
| `apps/api/src/seed.service.ts` | Creates `operator@markflow` user + GTIN cache entries.                                                                             |
| `packages/db/prisma/dev.db`    | Local development database (not in git).                                                                                           |
| `.env.example`                 | Default `DATABASE_URL="file:./dev.db"`                                                                                             |

**Verdict: No production data exists in the repository.** All data is demo/dev. Production data would only exist on deployed instances. This is confirmed by:

- `dev.db` is gitignored
- Seed creates demo users and demo GTINs
- No backup/restore scripts exist
- No production connection strings committed

**Owner decision required:** Is there any production data on any live instance? If so, migration strategy must account for data preservation. If not (confirmed by owner), historical SQLite migrations can be archived/replaced with a PG baseline.

## 6. fileParallelism and test isolation

| File               | Setting                                                  | Observation                                                                                                                                             |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest.config.ts` | `fileParallelism: false`                                 | Tests run sequentially, one spec at a time. This prevents SQLite concurrent-write issues but means test files mutate the shared `process.env` serially. |
| Each spec          | `beforeAll: mkdtemp + set DATABASE_URL + migrate deploy` | Each spec creates its own temp directory and fresh DB. Good isolation, but assumes `migrate deploy` is fast and deterministic against file: database.   |

**fileParallelism: false** is correct for SQLite (SQLite locks the whole DB for writes). For PostgreSQL with separate schemas/databases per spec, parallelism could be enabled, but that is a future optimization.
