# W0-03 Local Stack Plan

**Branch:** `w0-03-local-stack-fix` (from `4ce34b5`)
**Goal:** Build a reproducible local production-like integration stack for development and W0-03a validation.
**Strictly local:** Never described as production. Never exposes ports to the internet.

---

## Image versions (pinned digests)

| Service       | Image                    | Digest                                                                    |
| ------------- | ------------------------ | ------------------------------------------------------------------------- |
| PostgreSQL 16 | `postgres:16-alpine`     | `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685` |
| MinIO         | `minio/minio:latest`     | `sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e` |
| OpenBao       | `openbao/openbao:latest` | `sha256:11fd73a2102cda9c55d5d881a8c3210303146a7ec1e8ac76f526e175c6d24641` |

## Port table

| Service       | Internal port | Host bind | Host access URL                                                | Purpose                      |
| ------------- | ------------- | --------- | -------------------------------------------------------------- | ---------------------------- |
| PostgreSQL 16 | 5432          | 127.0.0.1 | `postgresql://markflow:markflow@127.0.0.1:5433/markflow_local` | Transactional database       |
| MinIO API     | 9000          | 127.0.0.1 | `http://127.0.0.1:9000`                                        | S3-compatible object storage |
| MinIO Console | 9001          | 127.0.0.1 | `http://127.0.0.1:9001`                                        | MinIO web UI (admin only)    |
| OpenBao       | 8200          | 127.0.0.1 | `http://127.0.0.1:8200`                                        | KMS Transit engine           |

## Data persistence model

| Data                   | Survives `up`/`down`?             | Removed by `down -v`? | Removed by reset? |
| ---------------------- | --------------------------------- | --------------------- | ----------------- |
| PostgreSQL data        | Yes (named volume `pgdata`)       | Yes                   | Yes               |
| MinIO data             | Yes (named volume `miniodata`)    | Yes                   | Yes               |
| OpenBao data           | Yes (named volume `openbao-data`) | Yes                   | Yes               |
| `.env.local`           | Yes (host filesystem)             | No                    | Yes               |
| OpenBao dev root token | In-memory only (dev mode)         | N/A                   | N/A               |
| OpenBao derived token  | Written to `openbao-data` volume  | Yes                   | Yes               |

**Note:** OpenBao runs in `-dev` mode which uses in-memory storage. The `openbao-data` volume exists but OpenBao `-dev` does not persist to disk. `down -v` removes the volume; `up -d` creates a fresh one. There is no data persistence across `down -v` for OpenBao.

## Files

| File                                 | Purpose                                                  |
| ------------------------------------ | -------------------------------------------------------- |
| `compose.local.yml`                  | Docker Compose for PG16, MinIO, OpenBao (all 127.0.0.1)  |
| `.env.local.example`                 | Placeholder variable names (no values, no secrets)       |
| `scripts/local-stack-up.sh`          | Start services + generate secrets + bootstrap OpenBao    |
| `scripts/local-stack-down.sh`        | Stop and remove volumes                                  |
| `scripts/local-stack-status.sh`      | Health check all services                                |
| `scripts/local-stack-reset.sh`       | Destroy data (requires CONFIRM_LOCAL_DATA_DELETION=YES)  |
| `scripts/local-smoke.sh`             | PG connection, MinIO bucket, OpenBao Transit round-trip  |
| `scripts/local-openbao-bootstrap.sh` | Dev-only: transit mount + key + policy + ephemeral token |

## Safety model

- All services bind to `127.0.0.1` only (never `0.0.0.0`).
- No public domains, ingress, reverse proxy, or TLS termination.
- Secrets generated at first start into `.env.local` (gitignored).
- `.env.local.example` contains placeholder names only — never real values.
- OpenBao runs in dev mode only (no HA, no auto-unseal, in-memory storage).
- Root token never printed to stdout; derived token written to volume file only.
- MinIO uses `markflow-local` bucket (never `markflow-prod`).
- Smoke command redacts all sensitive output; exits nonzero on any failure.
- Reset requires `CONFIRM_LOCAL_DATA_DELETION=YES`; exits nonzero on cleanup failure.
- All image tags pinned to immutable digests for reproducibility.

## Non-production limitations

- OpenBao dev mode: no HA, no auto-unseal, no audit to SIEM, in-memory storage.
- MinIO: no SSE-KMS (placeholder only), no lifecycle/retention.
- No TLS (HTTP only on loopback).
- No backup/restore (ephemeral volumes).
- No correlation with owner decisions (still pending).
- PostgreSQL port 5433 (host) to avoid conflict with existing PG on 5432.
