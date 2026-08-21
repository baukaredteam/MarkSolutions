#!/bin/sh
# W0-03-fix: OpenBao local dev bootstrap (runs from host, not container).
# Uses root token from LOCAL_OPENBAO_ROOT_TOKEN env var (sourced from .env.local).
# STRICTLY DEV MODE — never used in Stage/Production.
# Exits nonzero on any failure. Never prints the root token.

set -eu

BAO_ADDR="${BAO_ADDR:-http://127.0.0.1:8200}"
export BAO_ADDR

# Wait for OpenBao to be ready
echo "[openbao-init] Waiting for OpenBao at ${BAO_ADDR}..."
READY=0
for i in $(seq 1 30); do
  if bao status >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 2
done
if [ "$READY" -ne 1 ]; then
  echo "[openbao-init] FAIL: OpenBao not ready after 60s"
  exit 1
fi

# Authenticate with root token
if [ -z "${LOCAL_OPENBAO_ROOT_TOKEN:-}" ]; then
  echo "[openbao-init] FAIL: LOCAL_OPENBAO_ROOT_TOKEN not set"
  exit 1
fi
bao login "$LOCAL_OPENBAO_ROOT_TOKEN" >/dev/null 2>&1

# Enable Transit secrets engine (probe first, create only if absent)
echo "[openbao-init] Checking Transit engine..."
if bao secrets list -format=json 2>/dev/null | grep -q '"transit/"'; then
  echo "[openbao-init] Transit engine already enabled."
else
  echo "[openbao-init] Enabling Transit engine..."
  bao secrets enable -path=transit transit
fi

# Create encryption key (probe first, create only if absent)
echo "[openbao-init] Checking markflow-local key..."
if bao read transit/keys/markflow-local >/dev/null 2>&1; then
  echo "[openbao-init] Key already exists."
else
  echo "[openbao-init] Creating markflow-local key..."
  bao write -f transit/keys/markflow-local
fi

# Create a dev policy with minimal permissions
echo "[openbao-init] Creating markflow-dev policy..."
bao policy write markflow-dev - <<'EOF'
path "transit/encrypt/markflow-local" {
  capabilities = ["update"]
}
path "transit/decrypt/markflow-local" {
  capabilities = ["update"]
}
path "transit/keys/markflow-local" {
  capabilities = ["read"]
}
path "sys/health" {
  capabilities = ["read"]
}
EOF

# Create a dev token with the markflow-dev policy (1 hour TTL)
echo "[openbao-init] Creating dev token..."
DEV_TOKEN_JSON=$(bao token create -policy=markflow-dev -format=json -ttl=3600)
DEV_TOKEN=$(echo "$DEV_TOKEN_JSON" | grep -o '"client_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$DEV_TOKEN" ]; then
  echo "[openbao-init] FAIL: Could not create dev token"
  exit 1
fi

echo "[openbao-init] Bootstrap complete (dev token created, TTL 1h)."
