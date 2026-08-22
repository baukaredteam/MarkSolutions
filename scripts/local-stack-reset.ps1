# W0-03: Destroy all local stack data (PowerShell).
# Requires CONFIRM_LOCAL_DATA_DELETION=YES. Refuses non-local endpoints.
# Exits nonzero if any cleanup step fails.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($env:CONFIRM_LOCAL_DATA_DELETION -ne "YES") {
    Write-Host "ERROR: Set `$env:CONFIRM_LOCAL_DATA_DELETION = 'YES' to confirm local data deletion."
    Write-Host "This will destroy ALL data in the local stack (PostgreSQL, MinIO, OpenBao)."
    exit 1
}

$ROOT_DIR = Split-Path $PSScriptRoot -Parent
Set-Location $ROOT_DIR

# Refuse non-local endpoints
if (Test-Path .env.local) {
    $content = Get-Content .env.local -Raw
    if ($content -match "localhost|127\.0\.0\.1" -or $content -match "LOCAL_") {
        Write-Host "[local-stack] Confirmed local endpoints."
    } else {
        Write-Host "ERROR: .env.local does not contain local endpoints. Refusing to destroy."
        exit 1
    }
}

Write-Host "[local-stack] Destroying all local data..."

# Stop and remove volumes — capture exit code
docker compose -f compose.local.yml --env-file .env.local down -v --remove-orphans
if ($LASTEXITCODE -ne 0) {
    Write-Host "[local-stack] FAIL: docker compose down failed (exit code $LASTEXITCODE)"
    exit 1
}

# Remove .env.local
Remove-Item .env.local -Force -ErrorAction SilentlyContinue

Write-Host "[local-stack] All local data destroyed."
