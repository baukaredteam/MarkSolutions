#!/bin/sh
# W0-03: Destroy all local stack data (volumes, .env.local, OpenBao tokens).
# Requires CONFIRM_LOCAL_DATA_DELETION=YES. Refuses non-local endpoints.

set -e

if [ "$CONFIRM_LOCAL_DATA_DELETION" != "YES" ]; then
  echo "ERROR: Set CONFIRM_LOCAL_DATA_DELETION=YES to confirm local data deletion."
  echo "This will destroy ALL data in the local stack (PostgreSQL, MinIO, OpenBao)."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

# Refuse non-local endpoints
if [ -f .env.local ]; then
  if grep -q "localhost\|127.0.0.1" .env.local || grep -q "LOCAL_" .env.local; then
    echo "[local-stack] Confirmed local endpoints."
  else
    echo "ERROR: .env.local does not contain local endpoints. Refusing to destroy."
    exit 1
  fi
fi

echo "[local-stack] Destroying all local data..."

# Stop and remove volumes
docker compose -f compose.local.yml --env-file .env.local down -v --remove-orphans 2>/dev/null || true

# Remove .env.local
rm -f .env.local

# Remove OpenBao data
rm -rf infra/local/openbao-data

echo "[local-stack] All local data destroyed."
