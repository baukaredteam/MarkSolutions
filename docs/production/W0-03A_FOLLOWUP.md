# W0-03a Follow-up map — remaining non-production limitations

Status: `CHANGES_REQUIRED — PENDING_DOCKER_EVIDENCE`. This is NOT a merge/approval
checkpoint. The corrective W0-03a work below is done; the remaining slices are
tracked here and are still blocking for production.

## Delivered (this branch `fix/w0-03a-real-foundation-gates`)

- Reproducibility: `@aws-sdk/client-s3` added to `apps/api` manifest + lockfile; clean
  `npm ci` → `db:generate` → shared build → `typecheck` → `lint` → `secret-scan` all pass.
- Single typed `APP_CONFIG` (profiles `test|local|stage|production`; unknown/empty rejected;
  `NODE_ENV=development`→`local` compat only when `APP_ENV` absent). DI factories for JWT,
  MPT, KMS, storage and readiness inject `APP_CONFIG`; no raw `process.env`/`ConfigService` selection.
- `MinioStorageAdapter` + `OpenBaoTransitKmsAdapter` registered in DI; `VaultKmsAdapter` stub removed;
  readiness invokes real adapter `healthCheck()`.
- `EnvelopeCodec` (MFV1): length-prefixed binary, `cipher.setAAD`/`decipher.setAAD` with canonical
  AAD bytes, persisted keyName/keyVersion/AAD-hash/createdAt, strict parse, zeroize, key-version verify.
- `MptWritePolicy` (`MPT_WRITE_ENABLED=false` default, fail-closed, `WriteDisabledError`) guarding
  `createOrder`/`submitUtilisation`/`submitImport`/`submitWithdrawal` before network I/O.
- `LegalEntity` (Tenant 1:N) + `UserLegalEntityMembership` + `legalEntityId` on 16 protected objects,
  deterministic backfill migration (`le_`+tenant.id), validated by `db:validate`.
- `VaultService` seal/open use the stable `CodeVault.id` as objectId (consistent metadata).

## Blocking follow-ups (each is an explicit slice)

1. **`test:local-adapters` — PENDING_DOCKER_EVIDENCE.** The fail-closed runner
   (`scripts/test-local-adapters.mjs`), integration suite (`apps/api/test/local-adapters.e2e.ts`)
   and PowerShell smoke (`scripts/local-stack-smoke.ps1`) are committed but UNEXECUTED: this machine
   has no Docker/WSL2 (`docs/INFRA-NEW-LAPTOP.md`). Must be run with zero skips on a Docker-capable
   Windows host or CI runner. Evidence is not fabricated.
2. **`legalEntityId` NOT NULL (contract phase).** The column is nullable (expand phase) so reachable
   flows keep compiling. Threading a real `legalEntityId` through every service `create()` and making
   the FK mandatory is a follow-up. The deterministic backfill already populates existing rows.
3. **Auth context (ADR-026 Q3).** `activeLegalEntityId` JWT claim + `UserLegalEntityMembership`
   validation in `TenantGuard` + request-context scope (no fallback `tenantId`→`legalEntityId`,
   zero memberships → 403). Not yet wired; `VaultService` currently resolves the backfilled entity.
4. **Onboarding creates a `LegalEntity` row** for every new Tenant (mirroring the backfill), so the
   FK can be enforced for new data.
5. **Cross-org / cross-legal-entity e2e tests** against the wired auth context (schema-level scope
   tests exist; auth-context-level deny tests are in `test:local-adapters` and the auth slice).
