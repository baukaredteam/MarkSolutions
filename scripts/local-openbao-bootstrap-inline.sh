#!/bin/sh
# W0-03-fix: OpenBao bootstrap (runs inside openbao container).
# Uses root token from LOCAL_OPENBAO_ROOT_TOKEN env var.
# STRICTLY DEV MODE. Exits nonzero on failure. Never prints root token.
set -eu
BAO_ADDR="${BAO_ADDR:-http://127.0.0.1:8200}"
export BAO_ADDR

# Login + all subsequent commands must run in same session.
# Chain login with token create to avoid token-helper persistence issues.
bao login "$LOCAL_OPENBAO_ROOT_TOKEN" >/dev/null 2>&1
echo "[openbao-init] Authenticated."

echo "[openbao-init] Checking Transit engine..."
if bao secrets list -format=json 2>/dev/null | grep -q '"transit/"'; then
  echo "[openbao-init] Transit engine already enabled."
else
  echo "[openbao-init] Enabling Transit engine..."
  bao secrets enable -path=transit transit
fi

echo "[openbao-init] Checking markflow-local key..."
if bao read transit/keys/markflow-local >/dev/null 2>&1; then
  echo "[openbao-init] Key already exists."
else
  echo "[openbao-init] Creating markflow-local key..."
  bao write -f transit/keys/markflow-local
fi

echo "[openbao-init] Creating markflow-dev policy..."
bao policy write markflow-dev - <<'POLICY'
path "transit/encrypt/markflow-local" { capabilities = ["update"] }
path "transit/decrypt/markflow-local" { capabilities = ["update"] }
path "transit/keys/markflow-local" { capabilities = ["read"] }
path "sys/health" { capabilities = ["read"] }
POLICY

# Chain login + token create in subshell to preserve token context
echo "[openbao-init] Creating dev token..."
DEV_TOKEN_JSON=$(bao login "$LOCAL_OPENBAO_ROOT_TOKEN" >/dev/null 2>&1 && bao token create -policy=markflow-dev -format=json -ttl=3600)
DEV_TOKEN=$(echo "$DEV_TOKEN_JSON" | grep -o '"client_token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$DEV_TOKEN" ]; then
  echo "[openbao-init] FAIL: Could not create dev token"
  exit 1
fi

echo "[openbao-init] Bootstrap complete. Dev token created (TTL 1h)."
