# W0-03: Stop and remove local stack containers and volumes (PowerShell).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ROOT_DIR = Split-Path $PSScriptRoot -Parent
Set-Location $ROOT_DIR

Write-Host "[local-stack] Stopping services and removing volumes..."
docker compose -f compose.local.yml --env-file .env.local down -v
if ($LASTEXITCODE -ne 0) {
    Write-Host "[local-stack] FAIL: docker compose down failed"
    exit 1
}
Write-Host "[local-stack] Services stopped and volumes removed."
