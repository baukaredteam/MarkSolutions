# Migration Operations

## Commands reference

### Development (SQLite)

| Command               | Purpose                                    | Lock file                                 |
| --------------------- | ------------------------------------------ | ----------------------------------------- |
| `npm run db:generate` | Generate Prisma client for SQLite          | `migrations/migration_lock.toml` (sqlite) |
| `npm run db:migrate`  | Create + apply new migration (interactive) | `migrations/migration_lock.toml` (sqlite) |
| `npm run db:seed`     | Seed demo data into SQLite dev.db          | —                                         |

### Production/Stage (PostgreSQL)

| Command                        | Purpose                                       | Lock file                                        |
| ------------------------------ | --------------------------------------------- | ------------------------------------------------ |
| `npm run db:generate:pg`       | Generate Prisma client for PostgreSQL         | `pg/migrations/migration_lock.toml` (postgresql) |
| `npm run db:migrate:pg`        | Create new PG migration (interactive)         | `pg/migrations/migration_lock.toml` (postgresql) |
| `npm run db:migrate:deploy:pg` | Apply pending PG migrations (non-interactive) | `pg/migrations/migration_lock.toml` (postgresql) |
| `npm run db:migrate:status:pg` | Check PG migration status                     | `pg/migrations/migration_lock.toml` (postgresql) |

### Bootstrap & validation

| Command                  | Purpose                                                                      |
| ------------------------ | ---------------------------------------------------------------------------- |
| `npm run db:bootstrap`   | Full dev bootstrap: install → generate → migrate → seed → build shared       |
| `npm run db:validate:pg` | Validate PG schema compiles and migrations are up to date                    |
| `npm run verify`         | Full quality gate: generate → build → typecheck → lint → secret-scan → tests |

### Dangerous commands (NEVER in production)

| Command                    | Purpose                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `npm run db:migrate`       | Interactive migration — dev only, generates new migrations |
| `npx prisma migrate reset` | Drops and recreates entire database — dev only             |
| `npx prisma db push`       | Push schema without migration — dev only                   |

## Rollback policy

1. **Never edit committed migrations.** If a migration causes issues, create a new corrective migration.
2. **Forward-fix only.** If a column was added incorrectly, add a new migration that drops/recreates it.
3. **Data backfill rollback:** If a backfill migration corrupted data, restore from backup before the migration. The migration itself cannot be "undone" — a new reverse migration is needed.
4. **Emergency:** If the production database is corrupted, restore from the last known-good backup and replay migrations from that point.

## Expand/contract policy

1. **Expand:** Add new columns/tables as nullable or with defaults. Existing code continues to work.
2. **Deploy:** Release the code that reads/writes the new columns.
3. **Contract:** In a subsequent migration, add constraints (NOT NULL, UNIQUE) after confirming no legacy data exists.

## Backup/restore prerequisite

Before applying any migration to production:

1. Verify backup exists and is restorable
2. Test restore on a disposable database
3. Document the migration's expected effect on query performance
