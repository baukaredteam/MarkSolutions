# W0-03a Local Adapters — Implementation Plan

**Branch:** `w0-03a-local-adapters` (from `main`)
**Date:** 2026-08-21
**Scope:** Typed config + MinIO/OpenBao adapters against approved local Docker stack.
**Not** Stage/production deployment. Owner decisions remain unapproved.

---

## Changed files

| File                                       | Action   | Reason                                       |
| ------------------------------------------ | -------- | -------------------------------------------- |
| `apps/api/src/minio-storage.adapter.ts`    | New      | S3-compatible MinIO storage adapter          |
| `apps/api/src/openbao-kms.adapter.ts`      | New      | OpenBao Transit KMS adapter via HTTP         |
| `apps/api/src/app.module.ts`               | Modified | DI refactor: typed config, adapter factories |
| `apps/api/src/config-validation.ts`        | Modified | Add MinIO/OpenBao config validation          |
| `apps/api/test/minio-storage.spec.ts`      | New      | MinIO adapter integration test               |
| `apps/api/test/openbao-kms.spec.ts`        | New      | OpenBao adapter integration test             |
| `apps/api/test/w0-03a-integration.spec.ts` | New      | Full local stack integration test            |
| `.env.example`                             | Modified | Add W0-03a config documentation              |
| `docs/production/W0-03A_LOCAL_PLAN.md`     | New      | This plan                                    |
| `docs/production/W0-03A_LOCAL_EVIDENCE.md` | New      | Gate evidence                                |

## Architecture

### Typed AppConfig (existing, extended)

The existing `AppConfig` in `config-validation.ts` already has typed fields for `kms`, `storage`, `adapters`. We extend it slightly:

```typescript
// Add to AppConfig.kms:
kms: {
  profile: string; // "file" | "openbao"
  fileDir: string;
  openbaoAddr: string;
  openbaoToken: string; // NEVER in production config
  openbaoMount: string; // NEW: Transit mount path
  openbaoKey: string; // NEW: Transit key name
  openbaoTimeoutMs: number; // NEW: HTTP timeout
}

// Add to AppConfig.storage:
storage: {
  local: boolean;
  dir: string;
  minioEndpoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  minioBucket: string;
  minioUseSsl: boolean; // NEW
  minioTimeoutMs: number; // NEW
  minioTenantPrefix: string; // NEW: object key prefix
}
```

### MinioStorageAdapter

- Implements `StorageAdapter` interface
- Uses `@aws-sdk/client-s3` (S3-compatible)
- Config: endpoint, credentials, bucket, path-style, timeout, tenant prefix
- `write(data)`: putObject with `tenantPrefix/uuid` key, returns key
- `read(key)`: getObject, validates key (no path traversal)
- Error handling: typed S3 errors mapped to application errors

### OpenBaoTransitKmsAdapter

- Implements `IKmsAdapter` interface
- Uses HTTP API (fetch-based, no CLI)
- Config: base URL, Transit mount, key name, token, timeout
- `encrypt(plaintext)`: POST to `/v1/{mount}/encrypt/{key}`, returns ciphertext with version metadata
- `decrypt(ciphertext)`: POST to `/v1/{mount}/decrypt/{key}`, returns plaintext
- Error handling: typed OpenBao errors, redacted in logs
- **No `bao login` in runtime** — token is ephemeral via config

### DI binding (app.module.ts)

```typescript
{
  provide: KMS_ADAPTER,
  useFactory: (config: ConfigService) => {
    const profile = config.get("KMS_PROFILE");
    if (profile === "openbao") return new OpenBaoTransitKmsAdapter(config);
    if (profile === "file") return new FileKmsAdapter();
    throw new Error(`Invalid KMS_PROFILE: ${profile}`);
  },
  inject: [ConfigService],
},
{
  provide: STORAGE_ADAPTER,
  useFactory: (config: ConfigService) => {
    if (config.get("STORAGE_DIR")) return new LocalStorageAdapter(config.get("STORAGE_DIR"));
    return new MinioStorageAdapter(config);
  },
  inject: [ConfigService],
},
```

### Validation additions (config-validation.ts)

For production/stage:

- `KMS_PROFILE` must be `openbao` (not `file`)
- `KMS_OPENBAO_ADDR` must be set
- `MINIO_ENDPOINT` must be set
- `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` must be set
- `MINIO_BUCKET` must be set
- `KMS_OPENBAO_TOKEN` must NOT be in config for production (use auth method instead)

## Risks

| Risk                                              | Mitigation                                                    |
| ------------------------------------------------- | ------------------------------------------------------------- |
| S3 SDK adds dependency                            | `@aws-sdk/client-s3` is well-maintained; use specific version |
| OpenBao HTTP client failures                      | Typed errors, circuit breaker pattern, timeout                |
| Local test uses dev token                         | Documented: smoke-only, never in production config            |
| Envelope format not compatible with future rewrap | Document format; include version byte in ciphertext           |

## Test strategy

1. **MinIO adapter unit test**: write/read/delete with local MinIO (Docker stack)
2. **OpenBao adapter unit test**: encrypt/decrypt round-trip with local OpenBao (Docker stack)
3. **Full integration test**: start Docker stack → adapter tests → verify Code Vault encrypt/decrypt → stop stack
4. **Existing test suite**: 319 tests remain green

## Rollback

- Revert to `FileKmsAdapter` + `LocalStorageAdapter` (current state)
- Remove MinIO/OpenBao env vars from config
- Remove adapter implementations
