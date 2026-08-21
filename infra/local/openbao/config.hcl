# W0-03: OpenBao local dev configuration.
# STRICTLY DEV MODE — no HA, no auto-unseal, no audit to SIEM.
# Never used in Stage/Production.

storage "file" {
  path = "/bao/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"  # container-internal; host bind is 127.0.0.1 via compose
  tls_disable = 1               # local only; no TLS needed
}

api_addr = "http://127.0.0.1:8200"
cluster_addr = "http://127.0.0.1:8200"

# Dev mode: no seal/unseal required, single-node, no HA.
disable_mlock = true

log_level = "info"
