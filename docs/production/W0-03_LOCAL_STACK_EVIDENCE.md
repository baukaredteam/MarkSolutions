# W0-03 Local Stack Evidence

**Date:** 2026-08-21
**Branch:** `w0-03-local-stack-transit-fix` (from `bd376c3`)
**Docker:** 29.7.2, Compose v5.4.0

---

## Previous runs

| Branch    | Status | Root cause                                                                                |
| --------- | ------ | ----------------------------------------------------------------------------------------- |
| `5fc4335` | FAILED | OpenBao HTTPS-vs-HTTP; MinIO `\|\| true`; missing diagnostic assertion                    |
| `bd376c3` | FAILED | `Run-Bao()` temp-script approach had PowerShell output capture issues for Transit encrypt |

## Corrective changes in this branch

| Finding                                                      | Fix                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `Run-Bao()` temp-script approach fragile                     | Replaced with `Invoke-Bao()` using explicit Docker argument arrays  |
| `bao login` in each smoke command                            | Removed; token passed via `-e BAO_TOKEN` flag directly              |
| MinIO `mc stat` exit code caught by `$ErrorActionPreference` | `Docker-Exec` now wraps `& docker` in try/catch                     |
| MinIO cleanup regex didn't match                             | Use exit code check (`$statResult.ExitCode -ne 0`) instead of regex |
| Regex for `bao status` output                                | Use JSON parsing (`ConvertFrom-Json`) instead of fragile regex      |
| `bd376c3` evidence was false green                           | Marked FAILED; replaced with new run results                        |

## Image digests (pinned)

| Service       | Digest                                                                    |
| ------------- | ------------------------------------------------------------------------- |
| PostgreSQL 16 | `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685` |
| MinIO         | `sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e` |
| OpenBao       | `sha256:11fd73a2102cda9c55d5d881a8c3210303146a7ec1e8ac76f526e175c6d24641` |

## Live run results (all 12/12 pass)

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
  [PASS] MinIO cleanup verified (stat confirms gone)

OpenBao Transit:
  [PASS] BAO_ADDR diagnostic (HTTP, not HTTPS)
  [PASS] Transit engine enabled
  [PASS] Transit encrypt
  [PASS] Transit decrypt round-trip

=== Results: 12 passed, 0 failed ===
```

## Stack lifecycle commands (actual executed)

```powershell
powershell -ExecutionPolicy Bypass -File scripts/local-stack-down.ps1
# → Services stopped and volumes removed.

powershell -ExecutionPolicy Bypass -File scripts/local-stack-up.ps1
# → .env.local generated with random secrets (gitignored).
# → Services started; OpenBao bootstrapped via docker exec.

powershell -ExecutionPolicy Bypass -File scripts/local-stack-status.ps1
# → PostgreSQL: [PASS] Healthy
# → MinIO: [PASS] Healthy
# → OpenBao: [PASS] Initialized and unsealed

powershell -ExecutionPolicy Bypass -File scripts/local-smoke.ps1
# → 12/12 passed (see above)

powershell -ExecutionPolicy Bypass -File scripts/local-stack-down.ps1
# → Services stopped and volumes removed.
```

## Port binding verification

| Service       | Host bind      | Status        |
| ------------- | -------------- | ------------- |
| PostgreSQL    | 127.0.0.1:5433 | Loopback only |
| MinIO API     | 127.0.0.1:9000 | Loopback only |
| MinIO Console | 127.0.0.1:9001 | Loopback only |
| OpenBao       | 127.0.0.1:8200 | Loopback only |

## Token policy

- Root token from `.env.local` is used **only** for smoke verification via `BAO_TOKEN` env var.
- Root token is **never** printed to stdout, never written to token-helper state, never committed.
- Root token use is smoke-only; **forbidden** for W0-03a application adapters.
- OpenBao `-dev` mode: in-memory storage, Transit state resets on container recreation.

## Static checks

| Check                              | Status |
| ---------------------------------- | ------ |
| No `:latest` tags                  | ✓      |
| No host `bao` invocation           | ✓      |
| No duplicate bootstrap source      | ✓      |
| No `\|\| true` in critical scripts | ✓      |
| No secret values in committed docs | ✓      |
| No `openbao-data` volume           | ✓      |

## Quality gates

| Gate                  | Status                       |
| --------------------- | ---------------------------- |
| typecheck             | ✓ Pass                       |
| lint                  | ✓ Pass                       |
| secret-scan           | ✓ Pass                       |
| docker compose config | ✓ Valid                      |
| open-code-review      | Not installed on this system |
