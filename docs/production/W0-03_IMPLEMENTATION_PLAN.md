# W0-03 Implementation Plan

**Date:** 2026-08-21
**Branch:** `w0-03-discovery` (from `af3e1b5`)
**Scope:** W0-03 Storage/KMS + integration adapters. Exactly 3 reviewable PRs.

---

## PR 03a: Typed config + MinIO/OpenBao foundation

### Goal

Replace raw `process.env` reads with a validated, typed config object. Implement production MinIO storage adapter and OpenBao KMS adapter with encryption, key rotation, and health checks.

### Acceptance tests

1. **Config validation**: `buildAppConfig()` rejects stage/prod with missing/invalid MinIO/OpenBao config.
2. **MinIO adapter**: `MinIOStorageAdapter.write()` uploads object with SSE-KMS encryption; `read()` retrieves with integrity check (SHA-256).
3. **OpenBao adapter**: `VaultKmsAdapter.encrypt()` wraps data key via OpenBao transit engine; `decrypt()` unwraps; key version is embedded in ciphertext header.
4. **Key rotation**: encrypt/decrypt work after key rotation (key version mismatch → re-wrap with current key).
5. **Health check**: `/health/ready` reports KMS and storage status correctly.
6. **Existing tests pass**: 328 tests remain green.

### Rollback

- Revert to `LocalStorageAdapter` + `FileKmsAdapter` (current state).
- Remove MinIO/OpenBao env vars from production config.

### Environment policy

- Stage/prod: MUST have MinIO and OpenBao configured; config-validation blocks startup without them.
- Dev/test: can use `LocalStorageAdapter` + `FileKmsAdapter` (current behavior).
- `KMS_PROFILE=file` and `STORAGE_DIR` are FORBIDDEN in stage/prod (already validated).

### Forbidden side effects

- No MPT calls.
- No code/order creation.
- No Stage writes.

---

## PR 03b: GS1/NKT/1ecom contract adapters

### Goal

Replace mock GS1, NKT, and 1ecom adapters with typed contract adapters that call real APIs (or structured test fixtures). Add circuit breaker, timeout, and retry policies.

### Acceptance tests

1. **GS1 adapter**: `Gs1Adapter.verify(gtin)` calls GS1 API with correct auth; maps response to `PENDING_REAL`/`REJECTED`; timeout and network errors are typed.
2. **NKT adapter**: `NktAdapter.submitProduct()` calls NKT API; `getStatus()` polls with backoff; `PROCESSING` → `REGISTERED` transition is verified.
3. **1ecom adapter**: `EcomAdapter.verify(bin)` calls 1ecom API; `resolve()` completes pending verification; `listProducts()` returns typed product catalog.
4. **Circuit breaker**: after N consecutive failures, adapter returns typed error without calling external API.
5. **Existing tests pass**: 328 tests remain green (mock adapters still work for non-http mode).

### Rollback

- Revert to mock adapters (already working).
- Remove new env vars from production config.

### Environment policy

- `ADAPTERS_GS1=http` / `ADAPTERS_NKT=http` / `ADAPTERS_1ECOM=http` require corresponding API credentials.
- Config-validation blocks stage/prod with `ADAPTERS_*=mock`.

### Forbidden side effects

- No MPT calls.
- No code/order creation.
- GS1/NKT/1ecom are read-only until W1 (catalog moderation).
- Do not submit real product registrations to NKT until W1 approval.

---

## PR 03c: MPT read-only contract verification

### Goal

Verify HttpMptAdapter against the official Stage contract using read-only operations. Do NOT create orders, codes, utilisation, or documents on Stage.

### Acceptance tests

1. **Auth contract**: `ensureToken()` authenticates against test.markirovka.kz; token refresh works; 401 handling is correct.
2. **Read-only GET operations**: `getOrder()` and `getCodes()` return typed responses; unknown order returns empty/default.
3. **Timeout/retry**: network timeout triggers retry with backoff; max retries exhausted → typed error.
4. **Idempotency key**: verify Idempotency-Key header is sent correctly in POST requests (even if POST is not executed).
5. **Existing tests pass**: 328 tests remain green.

### Rollback

- Disable `ADAPTERS_MPT=http` (revert to mock).
- Remove MPT test credentials from CI.

### Environment policy

- `RUN_MPT_STAGE_CONTRACT=true` required for Stage contract tests.
- Tests use read-only operations only (GET requests).
- MPT test credentials must be in a secrets manager, not hardcoded.

### Forbidden side effects

- NO createOrder calls to Stage.
- NO submitUtilisation, submitImport, submitWithdrawal calls to Stage.
- Read-only verification only.

---

## Dependencies between PRs

```
PR 03a (config + storage + KMS)
  ↓ no dependency
PR 03b (GS1/NKT/1ecom)
  ↓ no dependency
PR 03c (MPT read-only)
```

All three PRs are independent and can be reviewed in parallel. They share only the typed config from PR 03a.

---

## Future dependencies (not in W0-03 scope)

| Item                             | Blocked by            | Target |
| -------------------------------- | --------------------- | ------ |
| Outbox durability                | W0-04 (durable queue) | W0-04  |
| Worker scheduling                | W0-04 (durable queue) | W0-04  |
| Readiness endpoint semantics     | W0-05 (observability) | W0-05  |
| Billing production               | D-01/D-02 approved    | W0-03+ |
| UI real flows                    | W0-03 + W0-04 + W0-05 | W1     |
| Database migrations (new models) | W0-03 foundation      | W1     |
