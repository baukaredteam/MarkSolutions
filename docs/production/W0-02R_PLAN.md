# W0-02R Plan — Corrective: PostgreSQL-only deterministic bootstrap

**Role:** staff database reliability engineer · **Type:** corrective (not W0-03) · **Base:** commit `5f98f5e`
**Date:** 2026-08-20

## 0. Blocker being fixed

`npm run db:generate:pg && npm test` fails:
`PrismaClientInitializationError: The Driver Adapter @prisma/adapter-libsql, based on sqlite, is not compatible with the provider postgres specified in the Prisma schema.`
Root cause: two provider-specific schemas share one `node_modules/.prisma/client`; the PG generate overwrites the SQLite client used by API specs. CI reproduces it (generates PG client, then `npm test`).

## 1. Architecture decision (resolves provider/client strategy)

**Preferred option selected: PostgreSQL is the single canonical database for dev, test, stage, prod.**

- `packages/db/prisma/schema.prisma` becomes the ONE canonical schema (`provider = "postgresql"`).
- Delete duplicate `packages/db/prisma/schema.pg.prisma` and `packages/db/prisma/pg/schema.prisma`.
- Remove `PrismaLibSQL` usage from `PrismaService`, `seed.ts`, `outbox.poller.spec.ts`, `catalog-migration.spec.ts`; always `new PrismaClient()`.
- Drop `@prisma/adapter-libsql` and `@libsql/client` dependencies.
- Exactly ONE generated client (from canonical PG schema). The overwrite blocker is structurally impossible: there is no second schema/client to overwrite.
- SQLite is removed as a runtime option (supersedes ADR-015; ROADMAP §2/§4 name PostgreSQL as source of truth). No provider-specific duplicate remains.

## 2. Migration layout

- SQLite history archived (not edited) → `packages/db/prisma/migrations_sqlite_archived/`.
- Canonical PG baseline moved → `packages/db/prisma/migrations/20260820104120_baseline/` (from `pg/migrations/`); `migration_lock.toml` = `provider = "postgresql"`.
- `migrate deploy` / `migrate status` target this directory. `migrate dev` is dev-only (renamed + guarded).

## 3. Test harness (behavioral — items 1,4)

New `apps/api/test/harness.ts` + `packages/db/src/test-harness.ts` (same logic):

- `requireTestDatabaseUrl()` — rejects `file:`, non-postgres, and URLs missing the `markflow_test` marker (unless `ALLOW_TEST_DB_RESET=true`).
- `createTestDatabase()` — creates an isolated `markflow_test_<uuid>` **schema** under `TEST_DATABASE_URL`, runs `prisma migrate deploy`, returns `{ databaseUrl, cleanup }`. `cleanup` drops **only** that isolated schema (CASCADE), guarded by the marker.
- All 25 `apps/api/test/*.spec.ts`, `outbox.poller.spec.ts`, `catalog-migration.spec.ts` bootstrap via harness (no `mkdtemp`+`file:`).
- `db-bootstrap.spec.ts` static text assertions replaced with behavioral tests executing the harness against disposable PG (deploy + `migrate status` + capability assertion: create/read a `Tenant`).
- `fileParallelism: false` retained (sequential determinism; no spec mutates `DATABASE_URL` outside the harness `beforeAll`).

## 4. Scripts (items 2,3)

- `db:generate` → generate canonical PG client (single client now).
- `db:migrate` → `db:migrate:dev` (clearly dev-only) → `prisma migrate dev`, guarded to reject stage/prod via `scripts/db-guard.mjs`.
- Remove `db:generate:pg`, `db:migrate:pg`, `db:migrate:deploy:pg`, `db:migrate:status:pg` (redundant once canonical is PG).
- `db:bootstrap` → `db:bootstrap:dev` (dev-only; targets local PG).
- `db:validate:pg` → `db:validate` — self-contained: requires `TEST_DATABASE_URL`; creates isolated resource; `migrate deploy` + `migrate status` + capability assertion + cleanup; **fails** if `TEST_DATABASE_URL` absent/unsafe (no ambient `DATABASE_URL` fallback).
- `scripts/db-guard.mjs` — code-level guard rejecting stage/prod for `migrate dev`/`seed`/`reset`.

## 5. CI (final order)

1. `npm ci`
2. PostgreSQL 16 service container (already configured)
3. `npm run db:generate` (single PG client)
4. `npm run build:cjs --workspace @markflow/shared`
5. typecheck → lint → secret-scan
6. `npm run db:validate` (deploy+status+capability on disposable PG)
7. `npm test` (all specs against disposable PG via harness)
8. dependency audit (strict, no `|| true`)

## 6. Dependency audit (item 5)

- Remove `npm audit --audit-level=high || true`.
- `npm audit --audit-level=high` (fail-closed). Add `docs/production/DEPENDENCY_AUDIT_EXCEPTIONS.md` (owner + expiry) — empty initially; any unavoidable exception is documented there, never via `|| true`.

## 7. Docs (item 6)

- Update `MIGRATION_OPERATIONS.md`, `MIGRATION_REVIEW_CHECKLIST.md`, `W0-02_EVIDENCE.md` (final command order, DB safety policy, forward-fix/rollback limits).
- New `W0-02R_EVIDENCE.md` with literal command outputs and gate results.

## 8. Local PG test dependency start (gate #2)

- `scripts/test-pg-start.mjs` (uses `embedded-postgres`) creates the `markflow_test` base DB for local runs; README documents native `pg_ctl` / `docker run postgres:16` alternatives.

## 9. Prohibitions (strict)

- No destructive call to stage/prod (marker check + `db-guard`); no `test.markirovka.kz`; no SQLite/MinIO/S3/OpenBao/queue/MPT/billing/UI/business changes.

## 10. Verification gates (fresh clone)

1. `npm ci` 2. start PG16 3. `db:generate` 4. `db:validate` (deploy+status+capability) 5. `npm test` (post-PG-generate) 6. typecheck+lint+secret-scan+strict audit 7. open-code-review (Blocker/High resolved) 8. `W0-02R_EVIDENCE.md` with literal outputs.

**Risk:** business queries that passed on SQLite may need dialect fixes on PG. Mitigation: validate approach on one spec against embedded-postgres before rolling out to all 25.
