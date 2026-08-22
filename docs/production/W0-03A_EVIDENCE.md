# W0-03a Corrective, part 2 — Evidence (branch `fix/w0-03a-scope-auth-and-local-stack`)

Status: **`CHANGES_REQUIRED — PENDING_DOCKER_EVIDENCE`**. Not mergeable. All non-Docker gates
green below; `test:local-adapters` remains unexecuted on this Docker-less machine.

## Corrections vs part-1 evidence (62c175e)

- Part 1 stated "no committed artifact contains … MinIO credentials". That claim was WRONG at the
  time: the then-tracked `docker-compose.infra.yml` contained fixed RabbitMQ/MinIO credentials
  (`markflow` / `markflow123`). In this branch those artifacts are REMOVED (see Slice 4 below);
  with them removed, the repo again contains no service credentials, and `.env.local` is
  runtime-generated and gitignored.

## Gates (exact commands, this machine)

```
npm ci / db:generate / build:cjs(shared) / typecheck / lint / secret-scan   → all exit 0
TEST_DATABASE_URL=…markflow_test npm run db:validate                        → PASSED (3 migrations)
powershell -File scripts/check-status-vocabulary.ps1                        → PASS
TEST_DATABASE_URL=… npx vitest run                                          → see "Full suite" below
```

## Full suite

Latest run on this branch: **51 files passed / 4 failed → fixed iteratively; final state before
commit is re-run and recorded in the commit message.** The suite includes the new invariant tests
(`scope-fk.spec.ts`: cross-tenant composite-FK rejection, retention RESTRICT, zero-mismatch
verification query across 15 protected tables) and the red-repro suite (`w0-03a-scope.red.spec.ts`,
12/12 green after fixes).

## Slices delivered

1. **Identity/request scope**: JWT `activeLegalEntityId`; login issues scope only for exactly one
   membership (zero→403, >1→deterministic `legal-entity selection required`); async TenantGuard +
   Prisma-backed `ActiveScopeResolver` validates tenant+LE+membership per request and mounts a
   validated `{organizationId, legalEntityId}` value object; no headers, no `le_${tenantId}`
   fallback in production code, no operator bypass on customer data (`activeScopeOf`).
2. **Persistence/service scope**: provisioning creates LegalEntity + admin membership transactionally;
   orders/labels/files/w4-seed threaded via validated scope; `backfillLegalEntityId()` removed from
   production paths (migration-only helper); direct `tenantId, tenantId` storage calls eliminated.
3. **Expand-contract**: compound UNIQUE `(id, tenantId)` on LegalEntity; composite FKs from 15
   protected tables (`ON DELETE RESTRICT` — retention-safe); cross-tenant FK regression test;
   NOT NULL deferred (documented).
4. **Local stack restored to accepted design** (`6345c1f`): `compose.local.yml` + PowerShell-only
   lifecycle (up/down/status/reset/checks/smoke); loopback-only bindings; digest-pinned images;
   OpenBao `-dev` in-memory (no token-bearing volumes — root token exists only in process memory /
   gitignored `.env.local`); every bootstrap step checked, no `|| true`. Removed:
   `docker-compose.infra.yml`, `infra/openbao/init.sh`, `infra/openbao/config.hcl`.
5. **test:local-adapters**: fail-closed runner consumes ONLY a restricted token (minted in-memory,
   root never persisted), asserts MPT writes stay disabled, runs the Nest-DI e2e against real
   MinIO/OpenBao.

## Unexecuted gate (blocking)

`npm run test:local-adapters` cannot run here (no Docker/WSL2). No fabricated output.
Prereqs: Windows host with Docker; `powershell scripts/local-stack-up.ps1`; `npm run test:local-adapters`.

## Remaining (W0-03A_FOLLOWUP.md)

legalEntityId NOT NULL contract phase for the last not-yet-threaded writes; OrderLine composite-FK
variant; auth-context e2e denials inside local-adapters run.
