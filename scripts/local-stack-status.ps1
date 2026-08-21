# W0-03: Check health of all local stack services (PowerShell).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ROOT_DIR = Split-Path $PSScriptRoot -Parent
Set-Location $ROOT_DIR

Write-Host "=== Local Stack Status ==="
Write-Host ""

# PostgreSQL
Write-Host "PostgreSQL 16:"
$pgReady = docker exec markflow-local-pg pg_isready -U markflow -d markflow_local 2>&1
if ($LASTEXITCODE -eq 0) { Write-Host "  [PASS] Healthy" } else { Write-Host "  [FAIL] Not ready" }

# MinIO
Write-Host "MinIO:"
$minioReady = docker exec markflow-local-minio mc ready local 2>&1
if ($LASTEXITCODE -eq 0) { Write-Host "  [PASS] Healthy" } else { Write-Host "  [FAIL] Not ready" }

# OpenBao
Write-Host "OpenBao:"
$baoStatus = docker exec -e BAO_ADDR=http://127.0.0.1:8200 markflow-local-openbao bao status 2>&1
if ($baoStatus -match "Initialized.*true") { Write-Host "  [PASS] Initialized and unsealed" } else { Write-Host "  [FAIL] Not ready" }

Write-Host ""
Write-Host "=== Container Status ==="
docker compose -f compose.local.yml --env-file .env.local ps
