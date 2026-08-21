# W0-03 Local Stack Evidence

**Date:** 2026-08-21
**Branch:** `w0-03-local-stack` (from `main` / `af3e1b5`)
**Docker:** 29.7.2, Compose v5.4.0

---

## 1. Docker prerequisites verified

```bash
docker version
# Client: 29.7.2, API 1.55
# Server: 29.7.2 (Docker Desktop)

docker compose version
# Docker Compose version v5.4.0

docker info
# Server Version: 29.7.2
# Operating System: Docker Desktop
# Docker Root Dir: /var/lib/docker
```

## 2. Services started and healthy

```bash
docker compose -f compose.local.yml --env-file .env.local up -d
# PostgreSQL 16: healthy (pg_isready)
# MinIO: healthy (mc ready local)
# OpenBao v2.6.2: initialized, unsealed (dev mode)
```

**Container status:**

| Container              | Image                  | Status                     |
| ---------------------- | ---------------------- | -------------------------- |
| markflow-local-pg      | postgres:16-alpine     | Up, healthy                |
| markflow-local-minio   | minio/minio:latest     | Up, healthy                |
| markflow-local-openbao | openbao/openbao:latest | Up (dev mode, initialized) |

## 3. Port binding verification

| Service       | Host bind      | Status          |
| ------------- | -------------- | --------------- |
| PostgreSQL    | 127.0.0.1:5433 | ✓ Loopback only |
| MinIO API     | 127.0.0.1:9000 | ✓ Loopback only |
| MinIO Console | 127.0.0.1:9001 | ✓ Loopback only |
| OpenBao       | 127.0.0.1:8200 | ✓ Loopback only |

**Note:** PostgreSQL uses port 5433 (host) → 5432 (container) to avoid conflict with existing PostgreSQL on port 5432.

## 4. Smoke test results

```
PostgreSQL 16:
  ✓ PostgreSQL 16 version
  ✓ PostgreSQL connection

MinIO:
  ✓ MinIO write/read with tenant prefix
  ✓ MinIO test object cleaned up

OpenBao Transit:
  ✓ OpenBao initialized
  ✓ Transit engine enabled
  ✓ Transit encrypt
  ✓ Transit decrypt round-trip
```

## 5. OpenBao bootstrap

- Dev mode: `bao server -dev` (auto-init, auto-unseal, root token printed to stdout)
- Transit engine enabled at `transit/`
- Key created: `transit/keys/markflow-local` (type: aes256-gcm96)
- Root token used for bootstrap only (never in application config)
- Dev policy `markflow-dev` created with encrypt/decrypt/read capabilities

## 6. Security verification

| Check                               | Status                            |
| ----------------------------------- | --------------------------------- |
| No secrets committed to git         | ✓ (.env.local is gitignored)      |
| No DB/MinIO/Vault data in git       | ✓                                 |
| Services bind to loopback only      | ✓                                 |
| OpenBao runs in dev mode only       | ✓ (root token for bootstrap only) |
| MinIO uses `markflow-local` bucket  | ✓                                 |
| Smoke test cleans up test objects   | ✓                                 |
| Smoke test redacts sensitive output | ✓                                 |

## 7. Quality gates

| Gate                | Status             |
| ------------------- | ------------------ |
| typecheck           | ✓ Pass             |
| lint                | ✓ Pass             |
| secret-scan         | ✓ Pass             |
| existing test suite | ✓ Pass (328 tests) |

## 8. Non-production limitations

- OpenBao: dev mode (no HA, no auto-unseal, in-memory storage, root token for bootstrap)
- MinIO: no SSE-KMS (placeholder), no lifecycle/retention, no versioning
- No TLS (HTTP only on loopback)
- No backup/restore (ephemeral volumes)
- Port 5433 used for PostgreSQL (avoids conflict with existing PG on 5432)

## 9. Files created

| File                                            | Purpose                                                 |
| ----------------------------------------------- | ------------------------------------------------------- |
| `compose.local.yml`                             | Docker Compose for PG16, MinIO, OpenBao                 |
| `.env.local.example`                            | Placeholder variable names                              |
| `.env.local`                                    | Generated secrets (gitignored)                          |
| `infra/local/openbao/config.hcl`                | OpenBao dev config                                      |
| `scripts/local-openbao-bootstrap.sh`            | Dev bootstrap (transit + key + policy + token)          |
| `scripts/local-stack-up.sh`                     | Start stack + generate secrets                          |
| `scripts/local-stack-down.sh`                   | Stop and remove volumes                                 |
| `scripts/local-stack-status.sh`                 | Health check all services                               |
| `scripts/local-stack-reset.sh`                  | Destroy data (requires CONFIRM_LOCAL_DATA_DELETION=YES) |
| `scripts/local-smoke.sh`                        | PG, MinIO, OpenBao round-trip verification              |
| `docs/production/W0-03_LOCAL_STACK_PLAN.md`     | Plan document                                           |
| `docs/production/W0-03_LOCAL_STACK_EVIDENCE.md` | This evidence document                                  |
