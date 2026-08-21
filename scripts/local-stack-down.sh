#!/bin/sh
# W0-03: Stop and remove local stack containers and volumes.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

echo "[local-stack] Stopping services and removing volumes..."
docker compose -f compose.local.yml --env-file .env.local down -v

echo "[local-stack] Services stopped and volumes removed."
