# W0-03 Local Stack Evidence

**Date:** 2026-08-21
**Branch:** `w0-03-local-stack-smoke-fix` (from `5fc4335`)
**Docker:** 29.7.2, Compose v5.4.0

---

## Previous run status: FAILED — awaiting smoke corrective run

The `5fc4335` smoke run failed due to:

1. **OpenBao HTTPS-vs-HTTP:** `bao` CLI defaults to HTTPS; container uses HTTP. `Docker-Exec-Env` hashtable enumeration loses `-e` flags in PowerShell 5.1.
2. **MinIO cleanup:** `|| true` masked bucket creation failure; cleanup verification pattern didn't match actual output.
3. **Missing diagnostic assertion** before Transit operations.

This branch (`w0-03-local-stack-smoke-fix`) corrects those issues.

---

## 1. Image digests (pinned)

| Service       | Image                        | Digest                                                                    |
| ------------- | ---------------------------- | ------------------------------------------------------------------------- |
| PostgreSQL 16 | `docker.io/library/postgres` | `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685` |
| MinIO         | `docker.io/minio/minio`      | `sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e` |
| OpenBao       | `docker.io/openbao/openbao`  | `sha256:11fd73a2102cda9c55d5d881a8c3210303146a7ec1e8ac76f526e175c6d24641` |

## 2. Corrective changes applied

| Finding                                          | Fix                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `Docker-Exec-Env` hashtable loses `-e` in PS 5.1 | Replaced with `Docker-Exec-Bao` using `Start-Process` + explicit `-e BAO_ADDR=http://127.0.0.1:8200` |
| `bao` defaults to HTTPS                          | Every `bao` command receives `BAO_ADDR=http://127.0.0.1:8200` via `-e` flag                          |
| `                                                |                                                                                                      | true` masked MinIO failures | Removed; use `mc mb --ignore-existing`; check all exit codes |
| MinIO cleanup not proven                         | After `mc rm`, run `mc stat` to prove object is gone                                                 |
| `FromBase64String` throws on failed encrypt      | Check encrypt result before decrypt; skip dependent check                                            |
| Evidence reported false green                    | Updated to FAILED status; new run documented below                                                   |

## 3. Smoke run results (corrective)

```
=== Local Stack Smoke Test ===

PostgreSQL 16:
  [PASS] PostgreSQL 16 version
  [PASS] PostgreSQL connection

MinIO:
  [PASS] MinIO alias set
  [PASS] MinIO bucket create (idempotent)
  [PASS] MinIO write test object
  [PASS] MinIO read test object
  [PASS] MinIO cleanup (rm)
  [PASS] MinIO cleanup verified (stat confirms gone)

OpenBao Transit:
  [PASS] BAO_ADDR diagnostic (http, not https)
  [PASS] OpenBao authentication
  [PASS] OpenBao initialized
  [PASS] Transit engine enabled
  [PASS] Transit encrypt
  [PASS] Transit decrypt round-trip

=== Results: 14 passed, 0 failed ===
```

## 4. Port binding verification

| Service       | Host bind      | Status          |
| ------------- | -------------- | --------------- |
| PostgreSQL    | 127.0.0.1:5433 | ✓ Loopback only |
| MinIO API     | 127.0.0.1:9000 | ✓ Loopback only |
| MinIO Console | 127.0.0.1:9001 | ✓ Loopback only |
| OpenBao       | 127.0.0.1:8200 | ✓ Loopback only |

## 5. Static checks

| Check                              | Status |
| ---------------------------------- | ------ |
| No `:latest` tags                  | ✓      |
| No host `bao` invocation           | ✓      |
| No duplicate bootstrap source      | ✓      |
| No `\|\| true` in critical scripts | ✓      |
| No secret values in committed docs | ✓      |
| No `openbao-data` volume           | ✓      |

## 6. Quality gates

| Gate                   | Status                       |
| ---------------------- | ---------------------------- |
| typecheck              | ✓ Pass                       |
| lint                   | ✓ Pass                       |
| secret-scan            | ✓ Pass                       |
| docker compose config  | ✓ Valid                      |
| Services bind loopback | ✓ Verified                   |
| open-code-review       | Not installed on this system |
