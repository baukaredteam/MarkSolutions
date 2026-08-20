# Migration Operations (W0-02R)

## Canonical schema

`packages/db/prisma/schema.prisma` is the **single canonical schema** (`provider = "postgresql"`).
SQLite is no longer a runtime option (ADR-015 superseded). There is exactly ONE generated
Prisma client (`node_modules/.prisma/client`) targeting PostgreSQL. The historical SQLite
migrations are archived read-only under `packages/db/prisma/migrations_sqlite_archived/` and
are not used by any command.

## Command reference

### Generate (one canonical client)

| Command               | Purpose                               |
| --------------------- | ------------------------------------- |
| `npm run db:generate` | Generate the PostgreSQL Prisma client |

### Development (dev-only, guarded)

| Command                    | Purpose                                                                    | Guard                                            |
| -------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| `npm run db:migrate:dev`   | Create + apply a new migration (`migrate dev`)                             | blocked in stage/prod by `scripts/db-guard.mjs`  |
| `npm run db:seed`          | Seed demo data into the configured PostgreSQL DB                           | blocked in production unless `SEED_ENABLED=true` |
| `npm run db:bootstrap:dev` | Full dev bootstrap: install → generate → migrate:dev → seed → build shared | inherits above guards                            |

### Production / Stage (deploy path only)

| Command                     | Purpose                                      |
| --------------------------- | -------------------------------------------- |
| `npm run db:migrate:deploy` | Apply committed migrations non-interactively |
| `npm run db:migrate:status` | Check migration status                       |

### Validation & quality gate

| Command               | Purpose                                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:validate` | Self-contained PG check: requires `TEST_DATABASE_URL`, creates an isolated schema, runs `migrate deploy` + `migrate status` + a capability assertion, then drops **only** that schema. |
| `npm run verify`      | Full gate: generate → build shared → typecheck → lint → secret-scan → tests                                                                                                            |

## Test database safety policy

- All integration/API tests run against a **disposable PostgreSQL 16** database via the shared
  harness (`apps/api/test/harness.ts`, `packages/db/src/test-harness.ts`).
- The harness reads **`TEST_DATABASE_URL` only** (never ambient `DATABASE_URL`). It rejects
  `file:`, non-PostgreSQL URLs, and URLs without the `markflow_test` marker (unless
  `ALLOW_TEST_DB_RESET=true`).
- Each spec gets an **isolated schema** (`s_<random>`); cleanup drops only that schema.
- No spec may mutate `DATABASE_URL` outside the harness `beforeAll`.

## Dangerous commands (NEVER in stage/production)

| Command                    | Why blocked                                                          |
| -------------------------- | -------------------------------------------------------------------- |
| `npm run db:migrate:dev`   | Generates new migrations; guarded to dev/test only.                  |
| `npm run db:seed`          | Writes demo data; guarded (production requires `SEED_ENABLED=true`). |
| `npx prisma migrate reset` | Drops and recreates the entire database.                             |
| `npx prisma db push`       | Schema push without migration history.                               |

`db-guard.mjs` enforces the stage/production rejection for `migrate-dev` and `seed`.

## Rollback / forward-fix policy

1. **Never edit committed migrations.** If a migration is wrong, add a new corrective migration.
2. **Forward-fix only.** A wrong column → new migration that corrects it.
3. **No rollback script.** A new reverse migration is required; committed history is immutable.
4. **Emergency:** restore from the last known-good backup and replay migrations from that point.
   (Backup/restore drill is a separate W0 work package — not in W0-02R scope.)

## Expand / contract

1. **Expand:** add nullable columns / new tables with defaults; existing code keeps working.
2. **Deploy:** release code reading/writing the new columns.
3. **Contract:** in a later migration, add constraints (NOT NULL, UNIQUE) after confirming no
   legacy data violates them.

## Test lifecycle (local development)

### Prerequisites

PostgreSQL 16 running locally. Supported options:

- **Docker (recommended):** `docker run -d --name markflow-pg -e POSTGRES_USER=markflow -e POSTGRES_PASSWORD=markflow -e POSTGRES_DB=markflow_test -p 5432:5432 postgres:16`
- **Native install:** PostgreSQL 16 with `markflow` user and `markflow_test` database.

### Up

```bash
# validate migration chain against disposable schema
TEST_DATABASE_URL=postgresql://markflow:markflow@localhost:5432/markflow_test npm run db:validate

# run full test suite (all specs use isolated schemas, auto-cleaned)
TEST_DATABASE_URL=postgresql://markflow:markflow@localhost:5432/markflow_test npm test
```

### Down

No manual cleanup needed. The test harness creates isolated schemas (`s_<random>`) and drops them in `afterAll`. The base `markflow_test` database remains intact.

### Adding a new migration (PostgreSQL)

```bash
# on a disposable/local PostgreSQL 16:
TEST_DATABASE_URL=postgresql://markflow:markflow@localhost:5432/markflow_test \
  npm run db:migrate:dev
# → commits a new SQL file under packages/db/prisma/migrations/
```

Do **not** edit `migration_lock.toml` or prior migration SQL.
