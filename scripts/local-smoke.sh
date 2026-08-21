#!/bin/sh
# W0-03: Local smoke test — PG, MinIO, OpenBao Transit round-trip.
# Verifies all services are accessible and functional.
# Cleans up test objects. Redacts all sensitive output.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

if [ ! -f .env.local ]; then
  echo "ERROR: .env.local not found. Run 'scripts/local-stack-up.sh' first."
  exit 1
fi

. .env.local

PASS=0
FAIL=0

check() {
  local name="$1"
  local result="$2"
  if [ "$result" = "0" ]; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Local Stack Smoke Test ==="
echo ""

# --- 1. PostgreSQL ---
echo "PostgreSQL 16:"
PG_VERSION=$(docker compose -f compose.local.yml exec -T postgres psql -U markflow -d markflow_local -t -c "SELECT version()" 2>/dev/null | head -1 | tr -d ' ')
if echo "$PG_VERSION" | grep -q "PostgreSQL 16"; then
  check "PostgreSQL 16 version" 0
else
  echo "  Expected PostgreSQL 16, got: [REDACTED]"
  check "PostgreSQL 16 version" 1
fi

PG_CONN=$(docker compose -f compose.local.yml exec -T postgres psql -U markflow -d markflow_local -c "SELECT 1" 2>/dev/null >/dev/null && echo 0 || echo 1)
check "PostgreSQL connection" "$PG_CONN"

# --- 2. MinIO ---
echo ""
echo "MinIO:"

# Create markflow-local bucket (idempotent)
MINIO_ALIAS="local"
docker compose -f compose.local.yml exec -T minio mc alias set $MINIO_ALIAS http://127.0.0.1:9000 "$LOCAL_MINIO_ACCESS_KEY" "$LOCAL_MINIO_SECRET_KEY" >/dev/null 2>&1
docker compose -f compose.local.yml exec -T minio mc mb "$MINIO_ALIAS/markflow-local" >/dev/null 2>&1 || true

# Write test object inside tenant prefix
TEST_TENANT="test-tenant-smoke"
TEST_KEY="${TEST_TENANT}/$(date +%s)-smoke-test"
echo "smoke-test" | docker compose -f compose.local.yml exec -T minio mc pipe "$MINIO_ALIAS/markflow-local/$TEST_KEY" >/dev/null 2>&1
MINIO_WRITE=$?

# Read test object
TEST_READ=$(docker compose -f compose.local.yml exec -T minio mc cat "$MINIO_ALIAS/markflow-local/$TEST_KEY" 2>/dev/null)
if echo "$TEST_READ" | grep -q "smoke-test"; then
  check "MinIO write/read with tenant prefix" 0
else
  check "MinIO write/read with tenant prefix" 1
fi

# Cleanup test object
docker compose -f compose.local.yml exec -T minio mc rm "$MINIO_ALIAS/markflow-local/$TEST_KEY" >/dev/null 2>&1
check "MinIO test object cleanup" 0

# --- 3. OpenBao Transit ---
echo ""
echo "OpenBao Transit:"

# Check health
BAO_HEALTH=$(docker compose -f compose.local.yml exec -T openbao bao status -format=json 2>/dev/null | grep -o '"initialized":true' || echo "")
if [ -n "$BAO_HEALTH" ]; then
  check "OpenBao initialized" 0
else
  check "OpenBao initialized" 1
fi

# Check transit engine is enabled
BAO_TRANSIT=$(docker compose -f compose.local.yml exec -T openbao bao secrets list -format=json 2>/dev/null | grep -o '"transit/"' || echo "")
if [ -n "$BAO_TRANSIT" ]; then
  check "Transit engine enabled" 0
else
  check "Transit engine enabled" 1
fi

# Encrypt/decrypt round-trip (no plaintext/ciphertext/token in output)
PLAINTEXT="smoke-test-$(date +%s)"
ENCRYPTED=$(docker compose -f compose.local.yml exec -T openbao bao write -format=json transit/encrypt/markflow-local plaintext="$(echo "$PLAINTEXT" | base64)" 2>/dev/null | grep -o '"ciphertext":"[^"]*"' | cut -d'"' -f4)
if [ -n "$ENCRYPTED" ]; then
  check "Transit encrypt" 0
else
  check "Transit encrypt" 1
fi

DECRYPTED=$(docker compose -f compose.local.yml exec -T openbao bao write -format=json transit/decrypt/markflow-local ciphertext="$ENCRYPTED" 2>/dev/null | grep -o '"plaintext":"[^"]*"' | cut -d'"' -f4 | base64 -d 2>/dev/null)
if [ "$DECRYPTED" = "$PLAINTEXT" ]; then
  check "Transit decrypt round-trip" 0
else
  check "Transit decrypt round-trip" 1
fi

# --- Summary ---
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
