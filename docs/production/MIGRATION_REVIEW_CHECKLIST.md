# Migration Review Checklist

Use this checklist before merging any migration to `main`.

## Pre-merge checklist

- [ ] **Schema diff reviewed**: `prisma migrate diff` shows only additive changes (new columns, new tables, new indexes). No destructive drops.
- [ ] **Data backfill**: If the migration modifies existing data (UPDATE/DELETE), document:
  - Data scope: which rows affected
  - Idempotency guard: can it be re-run safely?
  - Rollback: how to undo without data loss
- [ ] **NULL/default**: New columns have explicit `DEFAULT` or `NULL`. No NOT NULL without migration-friendly defaults.
- [ ] **Index/lock**: New indexes are reviewed for performance impact on write-heavy tables (Outbox, CodeEvent, LedgerEntry). No lock-heavy DDL on tenant-scoped tables without confirmation.
- [ ] **Tenant scope**: Every new table includes `tenantId`. No cross-tenant data leakage in queries.
- [ ] **Concurrency**: No `ALTER TABLE ... LOCK` or `CREATE INDEX CONCURRENTLY` without explicit approval.
- [ ] **Rehearsal**: Migration tested on disposable PostgreSQL 16 database from clean state. Apply succeeds, `migrate status` is clean.
- [ ] **No secret material**: Migration contains no credentials, API keys, or hardcoded tenant data.
- [ ] **Provider match**: If schema is PG, migration goes to `pg/migrations/`. If SQLite, `migrations/`. Never mix.
- [ ] **Backward compatibility**: Migration can be applied to a database that has all previous migrations. No assumptions about partial application.

## Post-merge verification

- [ ] `npm run db:migrate:status:pg` reports "up to date"
- [ ] `npm test` passes with the new schema
- [ ] No regression in existing test fixtures or seed data
- [ ] Rollback note documented in commit message if data migration involved
