#!/bin/sh
# W0-03: Check health of all local stack services.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

echo "=== Local Stack Status ==="
echo ""

# PostgreSQL
echo "PostgreSQL 16:"
docker compose -f compose.local.yml --env-file .env.local exec -T postgres pg_isready -U markflow -d markflow_local 2>/dev/null && echo "  ✓ Healthy" || echo "  ✗ Not ready"

# MinIO
echo "MinIO:"
docker compose -f compose.local.yml --env-file .env.local exec -T minio mc ready local 2>/dev/null && echo "  ✓ Healthy" || echo "  ✗ Not ready"

# OpenBao
echo "OpenBao:"
docker compose -f compose.local.yml --env-file .env.local exec -T openbao bao status 2>/dev/null && echo "  ✓ Healthy" || echo "  ✗ Not ready"

echo ""
echo "=== Container Status ==="
docker compose -f compose.local.yml --env-file .env.local ps
