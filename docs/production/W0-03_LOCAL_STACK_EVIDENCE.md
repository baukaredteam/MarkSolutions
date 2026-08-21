# W0-03 Local Stack Evidence

**Date:** 2026-08-21
**Branch:** `w0-03-local-stack-bootstrap-hardening` (from `6554e66`)
**Docker:** 29.7.2, Compose v5.4.0

---

## Previous run assessment

The `6554e66` smoke test passed 12/12. However, the bootstrap path in `local-stack-up.ps1` was not hardened:

- Used temp scripts copied into the container via `docker cp`
- Bootstrap script used `|| echo` to hide Transit/key failures
- Root token remained in container after bootstrap
- Legacy `.sh` scripts with `|| true` and host `bao` still existed

This branch (`w0-03-local-stack-bootstrap-hardening`) corrects those bootstrap/security issues.

## Corrective changes

| Finding                                                     | Fix                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Bootstrap uses temp scripts + `docker cp` + `Start-Process` | Replaced with direct `Invoke-Bao` helper using `docker exec -e` argument arrays |
| `                                                           |                                                                                 | echo` hides Transit/key failures | Every bootstrap command checked for non-zero exit; any error fails `local-stack-up.ps1` |
| Root token in container `/tmp/bootstrap.sh`                 | Removed; token passed via `-e BAO_TOKEN` env var (ephemeral)                    |
| Legacy `.sh` scripts with `                                 |                                                                                 | true`                            | Removed from repository; static checks verify no `.sh` scripts remain                   |
| `$LASTEXITCODE` stale in catch blocks                       | Captured immediately after `& docker @dargs`; explicit `1` in catch             |
| Evidence claims false for checked-in tree                   | Updated; `6554e66` 12/12 noted but bootstrap hardening required                 |

## Image digests (pinned)

| Service       | Digest                                                                    |
| ------------- | ------------------------------------------------------------------------- |
| PostgreSQL 16 | `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685` |
| MinIO         | `sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e` |
| OpenBao       | `sha256:11fd73a2102cda9c55d5d881a8c3210303146a7ec1e8ac76f526e175c6d24641` |

## Live run results

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

=== Results: 11 passed, 0 failed ===
```

## Bootstrap verification

```powershell
# local-stack-up.ps1 bootstrap section:
# 1. Reads root token from .env.local (parsed, not printed)
# 2. Invoke-Bao: docker exec -e BAO_ADDR=... -e BAO_TOKEN=... bao secrets list
# 3. Invoke-Bao: docker exec -e BAO_ADDR=... -e BAO_TOKEN=... bao secrets enable (if absent)
# 4. Invoke-Bao: docker exec -e BAO_ADDR=... -e BAO_TOKEN=... bao read (key check)
# 5. Invoke-Bao: docker exec -e BAO_ADDR=... -e BAO_TOKEN=... bao write (key create if absent)
# Every step checks exit code; any failure exits 1 immediately.
# No temp scripts, no docker cp, no bao login, no token-helper state.
# Root token is ephemeral in docker exec -e; never written to container filesystem.
```

## Token policy

- Root token: read from `.env.local` (LOCAL_OPENBAO_ROOT_TOKEN); passed via `-e BAO_TOKEN` in `docker exec`; never printed, never written to container filesystem.
- Root token use is smoke/bootstrap only; **forbidden** for W0-03a application adapters.
- Docker administrator can observe transient `BAO_TOKEN` value in `docker exec -e` process arguments. This is a local-only residual risk documented here.

## Port bindings

| Service       | Host bind      | Status        |
| ------------- | -------------- | ------------- |
| PostgreSQL    | 127.0.0.1:5433 | Loopback only |
| MinIO API     | 127.0.0.1:9000 | Loopback only |
| MinIO Console | 127.0.0.1:9001 | Loopback only |
| OpenBao       | 127.0.0.1:8200 | Loopback only |

## Static checks

| Check                                  | Status |
| -------------------------------------- | ------ |
| No `:latest` tags                      | ✓      |
| No host `bao` invocation in PS1        | ✓      |
| No `\|\| true` in critical PS1 scripts | ✓      |
| No secret values in committed docs     | ✓      |
| No `openbao-data` volume               | ✓      |
| No legacy `.sh` scripts                | ✓      |

## Quality gates

| Gate                  | Status                       |
| --------------------- | ---------------------------- |
| typecheck             | ✓ Pass                       |
| lint                  | ✓ Pass                       |
| secret-scan           | ✓ Pass                       |
| docker compose config | ✓ Valid                      |
| open-code-review      | Not installed on this system |
