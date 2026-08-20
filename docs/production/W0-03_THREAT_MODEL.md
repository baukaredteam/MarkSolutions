# W0-03 Threat Model

**Date:** 2026-08-21
**Scope:** W0-03 Storage/KMS + integration adapters. Read-only analysis.

---

## 1. Secrets and plaintext exposure

| Threat                                                 | Current risk                                                                                                         | Mitigation (W0-03)                                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| MPT credentials in process.env logged to stdout/stderr | Medium — HttpMptAdapter reads MPT_LOGIN/MPT_PASSWORD from ConfigService; if error path logs config, credentials leak | Ensure AllExceptionsFilter never logs request bodies or config values; redact Authorization headers in structured logs |
| OpenBao token in process.env                           | Medium — VaultKmsAdapter reads KMS_OPENBAO_TOKEN; if error path logs it, token leaks                                 | Same redaction policy; token must be in a secrets manager, not .env in prod                                            |
| MinIO credentials in process.env                       | Medium — future MinIOStorageAdapter reads MINIO_ACCESS_KEY/MINIO_SECRET_KEY                                          | Same redaction policy; use IAM roles or secrets manager in prod                                                        |
| JWT_SECRET in process.env                              | Low — validated at startup, never logged                                                                             | Already sanitized in health errors                                                                                     |
| Code Vault ciphertext in DB                            | Low — stored as base64(nonce\|\|tag\|ciphertext); plaintext never stored                                             | KMS encrypt/decrypt wraps the actual key; ciphertext is safe at rest if DB is encrypted                                |
| FileKmsAdapter AES key on disk                         | High — key stored at `KMS_FILE_DIR/aes256.key` with mode 0o600                                                       | File KMS is FORBIDDEN in production; config-validation blocks KMS_PROFILE=file in stage/prod                           |
| Base64-encoded document body in MPT requests           | Low — documentBody is base64(JSON A–Z) containing codes; sent over TLS to test.markirovka.kz                         | TLS protects in transit; codes are not plaintext (they're base64-encoded JSON)                                         |

## 2. Plaintext KM/code exposure

| Threat                                   | Current risk                                                                            | Mitigation                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Code Vault plaintext in logs             | Low — Prisma queries don't log column values; AllExceptionsFilter strips payloads       | Verify no `console.log(prisma.codeVault.find...)` in production code paths                                          |
| KMS decrypted code payload in memory     | Medium — decrypt returns plaintext Buffer; if process crashes, core dump may contain it | Ensure Node.js `--max-old-space-size` limits; consider `--max-semi-space-size` to limit heap; no core dumps in prod |
| Code export (CSV/ZIP) via LabelService   | Low — export requires tenant-scoped authorization + audit                               | Verify export endpoint checks tenant ownership and logs the export event                                            |
| Utilisation report contains code serials | Medium — sntins array contains serial numbers in plaintext                              | sntins are sent to MPT (Stage) which is TLS-protected; verify they're not logged                                    |

## 3. SSRF and endpoint injection

| Threat                    | Current risk                                                                                                                                        | Mitigation                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| MPT_BASE_URL injection    | Medium — HttpMptAdapter uses `config.get("MPT_BASE_URL")` to construct URLs; if an attacker can control this env var, they can redirect MPT traffic | config-validation rejects stage/prod with incomplete config; MPT_BASE_URL must be a valid URL; use allowlist of known Stage endpoints |
| MPT path injection        | Low — HttpMptAdapter constructs paths from method names (e.g., `/api/orders`), not user input                                                       | Verify no user input flows into URL path construction                                                                                 |
| MinIO endpoint injection  | Medium — future MinIOStorageAdapter uses MINIO_ENDPOINT; same SSRF risk                                                                             | Validate MINIO_ENDPOINT is a valid URL; use allowlist of known MinIO endpoints                                                        |
| OpenBao address injection | Low — KMS_OPENBAO_ADDR is read from env only                                                                                                        | Validate URL format                                                                                                                   |

## 4. Tenant isolation

| Threat                         | Current risk                                                                                              | Mitigation                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Cross-tenant code Vault access | Low — CodeVault queries include tenantId filter; VaultService checks tenant ownership                     | Verify every CodeVault query includes tenantId; no raw queries bypass the filter |
| Cross-tenant file access       | Low — FilesController checks tenant ownership via getOwnedCard                                            | Verify storage keys are tenant-scoped (currently UUID-based, no tenant prefix)   |
| Cross-tenant MPT operations    | Medium — HttpMptAdapter doesn't embed tenantId in MPT requests; tenant isolation is at the MarkFlow layer | Verify MPT operations are always initiated from tenant-scoped controllers        |
| Cross-tenant billing           | Low — BillingService queries include tenantId filter                                                      | Already verified in billing tests                                                |

## 5. Object-storage access control

| Threat                            | Current risk                                                                                                                   | Mitigation                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Storage key enumeration           | Low — keys are randomUUID(); no sequential enumeration possible                                                                | Continue using randomUUID for keys                                                                                          |
| Path traversal via storage key    | Low — LocalStorageAdapter.sanitize() blocks `..`, `/`, `\`, leading `.`                                                        | MinIOStorageAdapter must validate keys similarly                                                                            |
| Storage without tenant scoping    | Medium — storage keys are opaque UUIDs; no tenant prefix means accidental cross-tenant access is possible if DB is compromised | Consider tenant-prefixed keys in MinIO implementation (e.g., `{tenantId}/{uuid}`)                                           |
| No encryption-at-rest for storage | High — LocalStorageAdapter writes plaintext files; MinIO default is no encryption                                              | MinIOStorageAdapter MUST use SSE-KMS or SSE-S3 encryption; config-validation should require encryption config in stage/prod |

## 6. OpenBao authentication and key management

| Threat                                   | Current risk                                                                                                                 | Mitigation                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| OpenBao token in env                     | High — KMS_OPENBAO_TOKEN is in process.env; if process crashes, token may be in core dump                                    | Use OpenBao AppRole or Kubernetes auth instead of static token; rotate tokens regularly       |
| OpenBao token with excessive permissions | Medium — current stub doesn't validate token scope                                                                           | VaultKmsAdapter MUST use minimum-privilege policy (encrypt/decrypt only on specific key path) |
| Key rotation not implemented             | High — FileKmsAdapter has no key rotation; VaultKmsAdapter is a stub                                                         | W0-03 must implement key rotation metadata (key version in ciphertext header)                 |
| No key version in ciphertext             | High — FileKmsAdapter stores nonce\|\|tag\|ciphertext without key version; if key rotates, old ciphertext can't be decrypted | Add key version byte to ciphertext format; VaultKmsAdapter must include version in response   |
| OpenBao seal/unseal                      | Medium — if OpenBao seals, all encrypt/decrypt operations fail                                                               | Health check must detect sealed OpenBao; circuit breaker for KMS failures                     |

## 7. Replay and idempotency

| Threat                 | Current risk                                                                                          | Mitigation                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| MPT order replay       | Low — Idempotency-Key header sent with each createOrder; MPT server should deduplicate                | Verify MPT server respects Idempotency-Key; add client-side idempotency tracking in Outbox |
| MPT utilisation replay | Medium — util-Date.now() as operationId; if retry occurs, new timestamp = new operationId = duplicate | Use deterministic operationId (e.g., order ID + report type) instead of Date.now()         |
| MPT document replay    | Medium — wdr-Date.now() as operationId; same issue as utilisation                                     | Use deterministic operationId                                                              |
| Billing reserve replay | Low — Idempotent via (refOrderId, kind) unique constraint                                             | Already verified in billing tests                                                          |

## 8. Log redaction

| Threat                               | Current risk                                                            | Mitigation                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Connection strings in error messages | Low — sanitizeHealthError() strips them from health endpoints           | Verify AllExceptionsFilter also strips connection strings from all error responses        |
| MPT request/response bodies in logs  | Medium — no structured logging yet; if console.log is used, bodies leak | Implement structured logging with redaction middleware; never log request/response bodies |
| Code Vault ciphertext in logs        | Low — Prisma doesn't log column values by default                       | Verify no explicit logging of ciphertext                                                  |
| Authorization headers in logs        | Medium — request middleware may log headers including Authorization     | Redact Authorization header in all logging middleware                                     |

## 9. Local-to-stage migration risks

| Risk                               | Description                                | Mitigation                                                              |
| ---------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| Local dev uses FileKmsAdapter      | Stage/prod MUST use VaultKmsAdapter        | config-validation blocks KMS_PROFILE=file in stage/prod                 |
| Local dev uses LocalStorageAdapter | Stage/prod MUST use MinIOStorageAdapter    | config-validation blocks STORAGE_DIR in stage/prod                      |
| Local dev uses MockMptAdapter      | Stage/prod MUST use HttpMptAdapter         | config-validation blocks ADAPTERS_MPT=mock in stage/prod                |
| Local dev uses MockGs1/Nkt/Ecom    | Stage/prod MUST use real adapters          | config-validation blocks mock in stage/prod                             |
| .env.example has mock defaults     | Developers may copy defaults to stage/prod | .env.example must have clear comments marking which vars are dev-only   |
| No secrets manager in dev          | Developers use plaintext .env              | Document that stage/prod must use secrets manager (Vault, AWS SM, etc.) |
| No encryption-at-rest in dev       | LocalStorageAdapter writes plaintext       | Document that MinIOStorageAdapter MUST use encryption                   |
