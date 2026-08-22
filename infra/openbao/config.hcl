# OpenBao — production-режим (C-02: замена заглушки VaultKmsAdapter).
# Хранилище: file backend (/bao/data, named volume openbao-data).
# Не dev-режим: данные переживают перезапуск контейнера.
# Unseal-ключи генерируются один раз скриптом infra/openbao/init.sh и хранятся
# в /bao/data/unseal-keys.json (демо-компромисс: ключи на том же volume;
# для боевого прод — auto-unseal через внешний KMS/транзит, см. комментарий ниже).

storage "file" {
  path = "/bao/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
  # Прод: включить TLS (tls_cert_file/tls_key_file) за reverse-proxy, не здесь.
}

# Адрес, который OpenBao отдаёт клиентам (нужен для seal_status/HA).
api_addr = "http://127.0.0.1:8200"

# Веб-UI (http://localhost:8200/ui) — удобно для отладки ключей/политик.
ui = true

# mlock включён (безопаснее); контейнеру выдан cap_add: IPC_LOCK.
# Если на Windows Docker Desktop mlock падает с EPERM — установить disable_mlock = true.
