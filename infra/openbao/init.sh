#!/bin/sh
# One-shot инициализация OpenBao (W0-03a, ADR-026). Запускается контейнером
# openbao-init ПОСЛЕ healthy сервера (depends_on: service_healthy).
#
# Идемпотентность: повторный `docker compose up` ничего не ломает.
#
# Least-privilege: создаёт только restricted token `markflow-local-adapter`,
# который умеет transit encrypt/decrypt/datakey для ключа `markflow-local`.
# ROOT token существует ТОЛЬКО в памяти этого процесса (переменная оболочки),
# никогда не пишется в файл/env приложения/фикстуры тестов.
set -e

echo "[openbao-init] waiting for OpenBao at ${BAO_ADDR:-http://127.0.0.1:8200}..."
until bao status -format=json >/dev/null 2>&1; do
  sleep 1
done

KEYS_FILE=/bao/data/unseal-keys.json

if [ ! -f "$KEYS_FILE" ]; then
  echo "[openbao-init] initializing (1/1 keys, demo threshold)..."
  bao operator init -key-shares=1 -key-threshold=1 -format=json >"$KEYS_FILE"
fi

# Root token читается в память из init-файла и НЕ персистится отдельно.
ROOT_TOKEN=$(grep -o '"root_token":"[^"]*"' "$KEYS_FILE" | sed 's/"root_token":"//; s/"$//')
export BAO_TOKEN="$ROOT_TOKEN"

SEALED=$(bao status -format=json | grep -o '"sealed":[a-z]*' | cut -d: -f2)
if [ "$SEALED" = "true" ]; then
  KEY=$(grep -o '"unseal_keys_b64":\["[^"]*"' "$KEYS_FILE" | sed 's/.*\["//')
  echo "[openbao-init] unsealing..."
  bao operator unseal "$KEY" >/dev/null
fi

echo "[openbao-init] enabling transit engine ..."
bao secrets enable transit 2>/dev/null || true

echo "[openbao-init] ensuring transit key markflow-local ..."
if ! bao read -format=json transit/keys/markflow-local >/dev/null 2>&1; then
  bao write -f transit/keys/markflow-local >/dev/null
fi

echo "[openbao-init] creating least-privilege policy markflow-local-adapter ..."
bao policy write markflow-local-adapter /init-policy.hcl >/dev/null

echo "[openbao-init] creating short-lived restricted adapter token (TTL 24h) ..."
RESTRICTED=$(bao token create -policy=markflow-local-adapter -ttl=24h -format=json \
  | grep -o '"token":"[^"]*"' | head -1 | sed 's/"token":"//; s/"$//')

# Только restricted token доступен приложению (НЕ root token).
echo "$RESTRICTED" > /bao/data/local-adapter-token
chmod 600 /bao/data/local-adapter-token
echo "[openbao-init] restricted token written to /bao/data/local-adapter-token"

# Очистить root token из памяти.
unset ROOT_TOKEN BAO_TOKEN
echo "[openbao-init] done"
