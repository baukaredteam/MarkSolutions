# W0-03a Real Foundation Evidence

**Date:** 2026-08-21
**Branch:** `w0-03a-real-foundation` (from `aba8f18`)

---

## Changes

| Fix                         | Details                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **APP_CONFIG → JwtModule**  | `JwtModule.registerAsync` now reads from `APP_CONFIG` (typed config)                                             |
| **Tenant-scoped storage**   | `StorageAdapter.write/read` now require `tenantId`; MinIO keys are `tenantId/uuid`; cross-tenant access rejected |
| **Config validation**       | Stage/production reject `kms.profile=file`, `storage.profile=local`, `adapters.*=mock`                           |
| **Local adapter preflight** | `test:local-adapters` runs `require-local-stack.sh` before adapter tests                                         |
| **Test:local-adapters**     | Added to `package.json`; mandatory Docker-gated adapter tests                                                    |

## Storage interface change

```typescript
// Before:
write(data: Buffer): Promise<string>;
read(key: string): Promise<Buffer>;

// After:
write(tenantId: string, data: Buffer): Promise<string>;
read(tenantId: string, key: string): Promise<Buffer>;
```

Object keys: `{tenantId}/{server-uuid}` — callers cannot choose arbitrary S3 keys.

## Test results

| Test                    | Status                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| storage.adapter.spec.ts | ✓ 2/2 passed                                                      |
| db-bootstrap.spec.ts    | ✓ 18 passed                                                       |
| Full test suite         | 176 passed, 164 skipped (pre-existing: require TEST_DATABASE_URL) |
| typecheck               | ✓ Pass                                                            |
| lint                    | ✓ Pass                                                            |
| secret-scan             | ✓ Pass                                                            |
