# OpenBao least-privilege policy for the local adapter (W0-03a, ADR-026).
# The restricted token may only transit-encrypt/decrypt/datakey for the local
# key `markflow-local`. It cannot read secrets, create/delete keys, or use the
# root namespace. Application/Nest tests use ONLY this token.

path "transit/encrypt/markflow-local" {
  capabilities = ["create", "update"]
}

path "transit/decrypt/markflow-local" {
  capabilities = ["create", "update"]
}

path "transit/datakey/plaintext/markflow-local" {
  capabilities = ["create", "update"]
}

path "transit/keys/markflow-local" {
  capabilities = ["read"]
}
