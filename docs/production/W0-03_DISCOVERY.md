# W0-03 Discovery — Adapters and Integration Contracts

**Date:** 2026-08-21
**Branch:** `w0-03-discovery` (from `af3e1b5`)
**Scope:** W0-03 Storage/KMS + integration adapters. No code changes.

---

## Adapter inventory

| #   | Adapter            | Injection token                | Current binding                                                                 | Real target implementation                                                                                                                               | Required configuration                                                                                                                                      | Missing contract/credential                                                                                            | State-changing operations                                                                                                  | Owner             |
| --- | ------------------ | ------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1   | **KMS**            | `KMS_ADAPTER`                  | `FileKmsAdapter` (dev) / `VaultKmsAdapter` (prod, stub)                         | OpenBao KV v2 via HTTP: encrypt/decrypt with transit-like wrapping                                                                                       | `KMS_PROFILE=openbao`, `KMS_OPENBAO_ADDR`, `KMS_OPENBAO_TOKEN`                                                                                              | OpenBao transit engine mount, token with encrypt/decrypt policy, key rotation schedule, audit policy                   | encrypt(plaintext)→ciphertext, decrypt(ciphertext)→plaintext                                                               | DRE + Security    |
| 2   | **Object Storage** | `STORAGE_ADAPTER`              | `LocalStorageAdapter` (always, regardless of env)                               | MinIO S3-compatible: putObject/getObject with bucket policy, encryption-at-rest, lifecycle rules                                                         | `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_USE_SSL`                                                                   | MinIO bucket creation policy, SSE-KMS encryption config, retention policy, lifecycle rules                             | write(data)→key, read(key)→data                                                                                            | DRE + SRE         |
| 3   | **MPT (IS MPT)**   | `MPT_ADAPTER`                  | `MockMptAdapter` (ADAPTERS_MPT≠"http") / `HttpMptAdapter` (ADAPTERS_MPT="http") | HttpMptAdapter: auth/refresh, createOrder, getOrder, getCodes, submitUtilisation, submitImport, submitWithdrawal, getDocument against test.markirovka.kz | `ADAPTERS_MPT=http`, `MPT_BASE_URL`, `MPT_LOGIN`, `MPT_PASSWORD`, `MPT_PRODUCT_GROUP`, `MPT_BUSINESS_PLACE_ID`, `MPT_MAX_RETRIES`, `MPT_REQUEST_TIMEOUT_MS` | Official Stage API contract (CONTRACT-IS-MPT.md), test credentials, businessPlaceId mapping, utilisation report schema | createOrder (writes Stage), submitUtilisation (writes Stage), submitImport (writes Stage), submitWithdrawal (writes Stage) | Integration owner |
| 4   | **GS1/GTIN**       | `IGS1_ADAPTER`                 | `MockGs1Adapter`                                                                | GS1 API: GTIN verification, product data retrieval                                                                                                       | `ADAPTERS_GS1=http`, GS1 API credentials, endpoint URL                                                                                                      | GS1 API contract, authentication method (OAuth2?), rate limits, response schema                                        | verify(gtin)→PENDING_REAL/REJECTED (read-only until confirmed)                                                             | Catalog owner     |
| 5   | **NKT**            | `NKT_ADAPTER`                  | `MockNktAdapter`                                                                | NKT/KMT API: product registration, status check                                                                                                          | `ADAPTERS_NKT=http`, NKT API credentials, endpoint URL                                                                                                      | NKT API contract, authentication method, submission schema, status polling interval                                    | submitProduct(ref)→ref, getStatus(ref)→REGISTERED/REJECTED/PROCESSING                                                      | Catalog owner     |
| 6   | **1ecom**          | `ECOM_ADAPTER`                 | `MockEcomAdapter`                                                               | 1ecom API: counterparty verification, product catalog sync                                                                                               | `ADAPTERS_1ECOM=http`, 1ecom API credentials, endpoint URL                                                                                                  | 1ecom API contract, authentication, product catalog schema, verification flow                                          | verify(bin)→PENDING_EXTERNAL/VERIFIED, resolve(bin,decision), listProducts()                                               | Catalog owner     |
| 7   | **Outbox**         | `OutboxPoller` (in-process)    | `OutboxPoller` (polling loop in AppModule constructor)                          | Durable queue: RabbitMQ or similar for async processing                                                                                                  | `RABBITMQ_URL` (configured but not connected)                                                                                                               | RabbitMQ connection policy, exchange/queue topology, DLQ configuration, retry policy                                   | pollAndProcess() → event handler dispatch                                                                                  | W0-04 scope       |
| 8   | **Valkey/Redis**   | Direct `process.env.REDIS_URL` | Not connected (env configured)                                                  | Valkey: distributed locks (Redlock), idempotency keys, cache                                                                                             | `REDIS_URL`                                                                                                                                                 | Connection policy, key naming, TTL, circuit breaker                                                                    | N/A (infrastructure only)                                                                                                  | W0-04 scope       |

---

## Configuration variables (complete inventory)

### Database

| Variable            | Required   | Stage/Prod validation                               | Current status |
| ------------------- | ---------- | --------------------------------------------------- | -------------- |
| `DATABASE_URL`      | Yes        | Must be `postgresql://`                             | ✅ Validated   |
| `TEST_DATABASE_URL` | Yes (test) | Must be `postgresql://` with `markflow_test` marker | ✅ Validated   |

### Auth

| Variable      | Required | Stage/Prod validation               | Current status |
| ------------- | -------- | ----------------------------------- | -------------- |
| `JWT_SECRET`  | Yes      | Must not be `dev-secret`, ≥20 chars | ✅ Validated   |
| `MFA_ENABLED` | No       | —                                   | ⚠️ Stub only   |

### KMS

| Variable            | Required   | Stage/Prod validation             | Current status            |
| ------------------- | ---------- | --------------------------------- | ------------------------- |
| `KMS_PROFILE`       | Yes        | Must not be `file` in stage/prod  | ✅ Validated              |
| `KMS_FILE_DIR`      | No         | —                                 | ✅ Used by FileKmsAdapter |
| `KMS_OPENBAO_ADDR`  | Yes (prod) | Required when KMS_PROFILE=openbao | ⚠️ Stub only              |
| `KMS_OPENBAO_TOKEN` | Yes (prod) | Required when KMS_PROFILE=openbao | ⚠️ Stub only              |

### Storage

| Variable           | Required   | Stage/Prod validation         | Current status |
| ------------------ | ---------- | ----------------------------- | -------------- |
| `MINIO_ENDPOINT`   | Yes (prod) | Required in prod              | ⚠️ Stub only   |
| `MINIO_ACCESS_KEY` | Yes (prod) | Required in prod              | ⚠️ Stub only   |
| `MINIO_SECRET_KEY` | Yes (prod) | Required in prod              | ⚠️ Stub only   |
| `MINIO_BUCKET`     | Yes (prod) | Required in prod              | ⚠️ Stub only   |
| `MINIO_USE_SSL`    | No         | —                             | ⚠️ Stub only   |
| `STORAGE_DIR`      | No         | Must NOT be set in stage/prod | ✅ Validated   |

### MPT

| Variable                 | Required   | Stage/Prod validation           | Current status         |
| ------------------------ | ---------- | ------------------------------- | ---------------------- |
| `ADAPTERS_MPT`           | Yes        | Must be `http` in stage/prod    | ✅ Validated           |
| `MPT_BASE_URL`           | Yes (http) | Required when ADAPTERS_MPT=http | ⚠️ Read-only in W0-03  |
| `MPT_LOGIN`              | Yes (http) | Required when ADAPTERS_MPT=http | ⚠️ Secret              |
| `MPT_PASSWORD`           | Yes (http) | Required when ADAPTERS_MPT=http | ⚠️ Secret              |
| `MPT_PRODUCT_GROUP`      | No         | —                               | ✅ Default: motor-oils |
| `MPT_BUSINESS_PLACE_ID`  | No         | —                               | ⚠️ Needs mapping       |
| `MPT_MAX_RETRIES`        | No         | —                               | ✅ Default: 2          |
| `MPT_REQUEST_TIMEOUT_MS` | No         | —                               | ✅ Default: 15000      |

### Other adapters

| Variable         | Required | Stage/Prod validation      | Current status |
| ---------------- | -------- | -------------------------- | -------------- |
| `ADAPTERS_GS1`   | Yes      | Must not be `mock` in prod | ⚠️ Stub only   |
| `ADAPTERS_NKT`   | Yes      | Must not be `mock` in prod | ⚠️ Stub only   |
| `ADAPTERS_1ECOM` | Yes      | Must not be `mock` in prod | ⚠️ Stub only   |
| `NKT_SLA_MS`     | No       | —                          | ⚠️ Mock-only   |

### Infrastructure

| Variable       | Required   | Stage/Prod validation | Current status                  |
| -------------- | ---------- | --------------------- | ------------------------------- |
| `REDIS_URL`    | No (W0-04) | —                     | ⚠️ Configured but not connected |
| `RABBITMQ_URL` | No (W0-04) | —                     | ⚠️ Configured but not connected |

---

## Secret fields (must never appear in logs/UI/APM)

| Field                 | Storage location                           | Masking policy                                           | Current status         |
| --------------------- | ------------------------------------------ | -------------------------------------------------------- | ---------------------- |
| `JWT_SECRET`          | process.env → JwtModule                    | Sanitized in health errors                               | ✅                     |
| `MPT_LOGIN`           | process.env → HttpMptAdapter               | Never returned in API responses                          | ✅                     |
| `MPT_PASSWORD`        | process.env → HttpMptAdapter               | Never returned in API responses                          | ✅                     |
| `KMS_OPENBAO_TOKEN`   | process.env → VaultKmsAdapter              | Never logged, never in DB                                | ✅                     |
| `MINIO_SECRET_KEY`    | process.env → (future MinIOStorageAdapter) | Never logged, never in DB                                | ⚠️ Not yet implemented |
| `DATABASE_URL`        | process.env → PrismaService                | Sanitized in health errors                               | ✅                     |
| Code Vault ciphertext | DB column `CodeVault.ciphertext`           | Base64(nonce\|\|tag\|ciphertext); plaintext never stored | ✅                     |

---

## Injection token map (app.module.ts DI)

| Token             | Provider                              | Factory                                                                                      | Injects                          |
| ----------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------- |
| `KMS_ADAPTER`     | `FileKmsAdapter` or `VaultKmsAdapter` | `useFactory: () => KMS_PROFILE === "openbao" ? new VaultKmsAdapter() : new FileKmsAdapter()` | —                                |
| `STORAGE_ADAPTER` | `LocalStorageAdapter`                 | `useFactory: () => new LocalStorageAdapter(STORAGE_DIR)`                                     | —                                |
| `ECOM_ADAPTER`    | `MockEcomAdapter`                     | `useClass: MockEcomAdapter`                                                                  | —                                |
| `IGS1_ADAPTER`    | `MockGs1Adapter`                      | `useClass: MockGs1Adapter`                                                                   | —                                |
| `NKT_ADAPTER`     | `MockNktAdapter`                      | `useClass: MockNktAdapter`                                                                   | —                                |
| `MPT_ADAPTER`     | `MockMptAdapter` or `HttpMptAdapter`  | `useFactory: (config, prisma) => createMptAdapter(config, prisma)`                           | `ConfigService`, `PrismaService` |
| `APP_GUARD`       | `TenantGuard`                         | `useClass`                                                                                   | —                                |
| `APP_GUARD`       | `RolesGuard`                          | `useClass`                                                                                   | —                                |
| `APP_FILTER`      | `AllExceptionsFilter`                 | `useClass`                                                                                   | —                                |

---

## Consumers of each adapter

| Adapter | Consumer files                                                                                            | State-changing?                                       |
| ------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| KMS     | `vault.service.ts` (encrypt/decrypt code payloads), `catalog.controller.ts` (encrypt card attributes)     | Yes — encrypts/decrypts sensitive data                |
| Storage | `files.controller.ts` (upload/download card files), `label.service.ts` (label generation)                 | Yes — writes/reads files to object storage            |
| MPT     | `outbox-poller.ts` (processes outbox events → MPT calls), `document.service.ts`, `utilisation.service.ts` | Yes — creates orders, documents, utilisation on Stage |
| GS1     | `gtin-resolver.ts` (GTIN verification)                                                                    | Read-only (verify only)                               |
| NKT     | `catalog.controller.ts` (product registration)                                                            | Read-only (submit + poll status)                      |
| 1ecom   | `ecom-products.controller.ts`, `onboarding.controller.ts` (counterparty verification)                     | Read-only (verify only)                               |
