# W0-03 Local Stack Plan

**Branch:** `w0-03-local-stack` (from `main` / `af3e1b5`)
**Goal:** Build a reproducible local production-like integration stack for development and W0-03a validation.
**Strictly local:** Never described as production. Never exposes ports to the internet.

---

## Port table

| Service       | Internal port | Host bind | Host access URL                                                | Purpose                      |
| ------------- | ------------- | --------- | -------------------------------------------------------------- | ---------------------------- |
| PostgreSQL 16 | 5432          | 127.0.0.1 | `postgresql://markflow:markflow@127.0.0.1:5432/markflow_local` | Transactional database       |
| MinIO API     | 9000          | 127.0.0.1 | `http://127.0.0.1:9000`                                        | S3-compatible object storage |
| MinIO Console | 9001          | 127.0.0.1 | `http://127.0.0.1:9001`                                        | MinIO web UI (admin only)    |
| OpenBao       | 8200          | 127.0.0.1 | `http://127.0.0.1:8200`                                        | KMS Transit engine           |

## Files to create

| File                                            | Purpose                                                 |
| ----------------------------------------------- | ------------------------------------------------------- |
| `compose.local.yml`                             | Docker Compose for PG16, MinIO, OpenBao (all 127.0.0.1) |
| `.env.local.example`                            | Placeholder variable names (no values, no secrets)      |
| `scripts/local-stack-up.sh`                     | Start services + generate secrets + bootstrap OpenBao   |
| `scripts/local-stack-down.sh`                   | Stop and remove volumes                                 |
| `scripts/local-stack-status.sh`                 | Health check all services                               |
| `scripts/local-stack-reset.sh`                  | Destroy data (requires CONFIRM_LOCAL_DATA_DELETION=YES) |
| `scripts/local-smoke.sh`                        | PG connection, MinIO bucket, OpenBao Transit round-trip |
| `scripts/local-openbao-bootstrap.sh`            | Dev-only: init + transit mount + key + ephemeral token  |
| `docs/production/W0-03_LOCAL_STACK_PLAN.md`     | This document                                           |
| `docs/production/W0-03_LOCAL_STACK_EVIDENCE.md` | Command outputs and verification                        |

## Safety model

- All services bind to `127.0.0.1` only (never `0.0.0.0`).
- No public domains, ingress, reverse proxy, or TLS termination.
- Secrets generated at first start into `.env.local` (gitignored).
- `.env.local.example` contains placeholder names only — never real values.
- OpenBao runs in dev mode only (no HA, no auto-unseal).
- MinIO uses `markflow-local` bucket (never `markflow-prod`).
- Smoke command redacts all sensitive output.
- Reset requires `CONFIRM_LOCAL_DATA_DELETION=YES`.

## Non-production limitations

- OpenBao dev mode: no HA, no auto-unseal, no audit to SIEM.
- MinIO: no SSE-KMS (placeholder only), no lifecycle/retention.
- No TLS (HTTP only on loopback).
- No backup/restore (ephemeral volumes).
- No correlation with owner decisions (still pending).
