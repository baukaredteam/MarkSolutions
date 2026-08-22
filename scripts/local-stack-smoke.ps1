# W0-03a local-stack smoke (PowerShell). Read-only diagnostics + a single
# transit smoke through the RESTRICTED adapter token (never the root token).
# Fails nonzero if Docker/local stack is unavailable or unhealthy.
$ErrorActionPreference = "Stop"

function Step($name) { Write-Host "`n== $name ==" -ForegroundColor Cyan }

Step "1. Docker engine"
try { docker info | Out-Null } catch { Write-Error "Docker unavailable: $($_.Exception.Message)"; exit 1 }

Step "2. Local stack containers (minio + openbao healthy)"
$ps = docker compose -f docker-compose.infra.yml ps --format "{{.Name}} {{.State}} {{.Health}}" 2>$null
if (-not $ps) { Write-Error "No containers — run: docker compose -f docker-compose.infra.yml up -d"; exit 1 }
$ps

Step "3. MinIO health"
try { $r = Invoke-WebRequest -Uri "http://localhost:9000/minio/health/live" -UseBasicParsing -TimeoutSec 5; Write-Host "MinIO: $($r.StatusCode)" } catch { Write-Error "MinIO unhealthy"; exit 1 }

Step "4. OpenBao health"
try { $r = Invoke-WebRequest -Uri "http://localhost:8200/v1/sys/health" -UseBasicParsing -TimeoutSec 5; Write-Host "OpenBao: $($r.StatusCode)" } catch { Write-Error "OpenBao unhealthy"; exit 1 }

Step "5. Restricted adapter token (never root)"
$token = docker exec markflow-openbao cat /bao/data/local-adapter-token 2>$null
if (-not $token) { Write-Error "restricted adapter token not found"; exit 1 }
$root = docker exec markflow-openbao cat /bao/data/root-token 2>$null
if ($root -and ($token.Trim() -eq $root.Trim())) { Write-Error "adapter token equals root token — refuse"; exit 1 }
Write-Host "restricted token present (root token NOT used)"

Step "6. Transit smoke via restricted token (encrypt/decrypt roundtrip)"
$body = @{ plaintext = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("smoke")) } | ConvertTo-Json
$enc = Invoke-RestMethod -Uri "http://localhost:8200/v1/transit/encrypt/markflow-local" -Method Post `
  -Headers @{ "X-Vault-Token" = $token.Trim() } -ContentType "application/json" -Body $body
$cipher = $enc.data.ciphertext
$decBody = @{ ciphertext = $cipher } | ConvertTo-Json
$dec = Invoke-RestMethod -Uri "http://localhost:8200/v1/transit/decrypt/markflow-local" -Method Post `
  -Headers @{ "X-Vault-Token" = $token.Trim() } -ContentType "application/json" -Body $decBody
$plain = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($dec.data.plaintext))
if ($plain -ne "smoke") { Write-Error "transit smoke roundtrip mismatch"; exit 1 }
Write-Host "transit smoke OK (restricted token): plaintext=$plain"

Write-Host "`nlocal-stack smoke PASSED" -ForegroundColor Green
