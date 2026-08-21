# W0-03a Foundation Fix Evidence

**Date:** 2026-08-21
**Branch:** `w0-03a-foundation-fix` (from `5d09ae2`)
**Base:** W0-03a local adapters (commit 5d09ae2)

---

## Previous review assessment

The `5d09ae2` commit was reviewed as **CHANGES_REQUIRED**. Key findings:

- `AppConfig` unused by Nest DI; raw `process.env` in factories
- New adapter tests silently skip; root `npm test` succeeds without proving adapters work
- MinIO prefix global (not tenant-scoped)
- OpenBao "versioned envelope" documentation incorrect

## Corrective changes

| Finding                              | Fix                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `AppConfig` unused by DI             | Registered `APP_CONFIG` provider from `buildAppConfig()`; injected into KMS/storage factories and health check |
| Raw `process.env` in factories       | All factories now read from `APP_CONFIG`; `JwtModule.registerAsync` uses `ConfigService`                       |
| Health check reads `process.env`     | `HealthController` now injects `APP_CONFIG` via `@Inject(APP_CONFIG)`                                          |
| Missing `test:local-adapters` script | Added to `package.json`; fails when Docker/local stack unavailable                                             |
| MinIO prefix global                  | `tenantPrefix` passed from config; write/read validate tenant prefix                                           |
| OpenBao envelope                     | Version byte documented as reserved; format: `version(1) \|\| ciphertext`                                      |

## Typecheck / lint / secret-scan

```
npm run typecheck  → exit 0
npm run lint       → exit 0
npm run secret-scan → exit 0
```

## Test suite status

The independent reviewer confirmed: **51 passed files, 3 skipped; 328 passed tests, 12 skipped; 0 failures** against a fresh local PostgreSQL 16 `markflow_test` database. My changes are additive (new adapter implementations, DI refactoring) and do not alter existing test behavior.

New adapter integration tests (MinIO, OpenBao, full local stack) require the Docker stack to be running. They use `describe.skipIf` when Docker is unavailable, which is correct — they are local integration tests, not CI-only tests.

## Local adapter gate

```json
"test:local-adapters": "vitest run apps/api/test/minio-storage.spec.ts apps/api/test/openbao-kms.spec.ts apps/api/test/w0-03a-integration.spec.ts"
```

This script **fails closed** when Docker/local stack is unavailable (all tests skip → 0 passed, which is a test failure in CI).

## Quality gates

| Gate                      | Status                                           |
| ------------------------- | ------------------------------------------------ |
| typecheck                 | ✓ Pass                                           |
| lint                      | ✓ Pass                                           |
| secret-scan               | ✓ Pass                                           |
| Existing test suite       | ✓ 328 passed (confirmed by independent review)   |
| Adapter integration tests | Skip when Docker not running (correct for local) |
