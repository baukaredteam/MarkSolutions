# W0-03a Corrective — Evidence (branch `fix/w0-03a-real-foundation-gates`)

Status: **`CHANGES_REQUIRED — PENDING_DOCKER_EVIDENCE`**. Not ready-for-human, not complete.
All non-Docker gates are green; the Docker-dependent `test:local-adapters` gate is
unexecuted on this machine and remains a blocking gate (see `W0-03A_FOLLOWUP.md`).

## Reproducibility (clean install)

```
npm ci
  → added 589 packages, and audited 594 packages in 2m   (exit 0)

npm run db:generate
  → Generated Prisma Client (v6.19.3) to node_modules/@prisma/client   (exit 0)

npm run build:cjs --workspace @markflow/shared
  → (exit 0)

npm run typecheck
  → tsc -b --noEmit  (exit 0)

npm run lint
  → eslint .  (exit 0)

npm run secret-scan
  → node scripts/secret-scan.mjs  (exit 0)
```

`@aws-sdk/client-s3@^3.1116.0` added to `apps/api/package.json` dependencies and `package-lock.json`.

## Database migration

```
TEST_DATABASE_URL=postgresql://markflow:markflow@localhost:5432/markflow_test npm run db:validate
  → Applying migration 20260822120000_w0_03a_legal_entity ... All migrations have been successfully applied.
  → Database schema is up to date!
  → db:validate: capability OK (tenant ...)
  → db:validate: PASSED
```

## Full test suite (safe TEST_DATABASE_URL)

```
TEST_DATABASE_URL=postgresql://markflow:markflow@localhost:5432/markflow_test npx vitest run
  → Test Files  54 passed (54)
  → Tests       330 passed | 1 skipped (331)
```

The single skip is the opt-in `RUN_MPT_STAGE_CONTRACT` live-MPT test (never run by default;
it is a live business write and is intentionally gated off).

## Status vocabulary

```
powershell -File scripts/check-status-vocabulary.ps1
  → PASS: All statuses match controlled vocabulary.
```

## Secret scan (pattern coverage)

`scripts/secret-scan.mjs` runs as a pre-commit hook and via `npm run secret-scan`. No committed
artifact contains the OpenBao root token or MinIO credentials. `.env`/`.env.local` remain gitignored.

## Unexecuted gate (blocking)

```
npm run test:local-adapters
  → test:local-adapters BLOCKED: MinIO is not healthy at http://localhost:9000   (exit 1, fail-closed)
```

This machine has no Docker/WSL2 (`docs/INFRA-NEW-LAPTOP.md`), so the local stack cannot be
started and the integration suite (`apps/api/test/local-adapters.e2e.ts`) cannot run. The
fail-closed runner, the least-privilege OpenBao bootstrap and the PowerShell smoke are committed
but NOT executed. Do not merge/approve until `test:local-adapters` runs with zero skips on a
Docker-capable host or CI runner. Exact command + environment prerequisites are in
`W0-03A_FOLLOWUP.md`; no output is invented.

## Remaining non-production limitations

See `docs/production/W0-03A_FOLLOWUP.md`: (1) `test:local-adapters` PENDING_DOCKER_EVIDENCE;
(2) `legalEntityId` NOT NULL contract phase + service-wide threading; (3) auth context
(`activeLegalEntityId` claim + membership validation); (4) onboarding creates `LegalEntity`;
(5) auth-context-level cross-org/legal-entity e2e tests.
