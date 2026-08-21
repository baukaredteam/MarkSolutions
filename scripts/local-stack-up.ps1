# W0-03: Start local integration stack (PowerShell — Windows authoritative path).
# Generates .env.local with random secrets on first run.
# All services bind to 127.0.0.1 only.
# OpenBao bootstrap runs via docker exec (no host bao required).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ROOT_DIR = Split-Path $PSScriptRoot -Parent
$ENV_LOCAL = Join-Path $ROOT_DIR ".env.local"

Set-Location $ROOT_DIR

# Generate .env.local on first run
if (!(Test-Path $ENV_LOCAL)) {
    Write-Host "[local-stack] Generating .env.local with random secrets..."
    $pgPass = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 20 | ForEach-Object { [char]$_ })
    $minioAccess = -join ((97..122) + (48..57) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    $minioSecret = -join ((65..90) + (97..122) + (48..57) + (33,43,45) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    $openbaoToken = -join ((97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
    $envContent = "LOCAL_PG_PASSWORD=$pgPass`nLOCAL_MINIO_ACCESS_KEY=$minioAccess`nLOCAL_MINIO_SECRET_KEY=$minioSecret`nLOCAL_OPENBAO_ROOT_TOKEN=$openbaoToken"
    $envContent | Set-Content -Encoding utf8 $ENV_LOCAL
    Write-Host "[local-stack] .env.local created (random secrets)."
}

# Start services
Write-Host "[local-stack] Starting services..."
docker compose -f compose.local.yml --env-file .env.local up -d

# Wait for all services to be healthy
Write-Host "[local-stack] Waiting for services to be healthy..."
$timeout = 120
$elapsed = 0
while ($elapsed -lt $timeout) {
    $psJson = docker compose -f compose.local.yml --env-file .env.local ps --format json 2>$null
    if ($psJson) {
        $ps = $psJson | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($ps) {
            $healthy = @($ps | Where-Object { $_.Status -match "healthy" }).Count
            if ($healthy -ge 2) { break }
        }
    }
    Start-Sleep -Seconds 3
    $elapsed += 3
}

# Bootstrap OpenBao via docker exec (no host bao required)
Write-Host "[local-stack] Bootstrapping OpenBao..."

# Parse .env.local for root token
$envVars = @{}
Get-Content $ENV_LOCAL | ForEach-Object {
    if ($_ -match "^([^#=]+)=(.*)$") {
        $envVars[$matches[1].Trim()] = $matches[2].Trim()
    }
}
$rootToken = $envVars["LOCAL_OPENBAO_ROOT_TOKEN"]
if ([string]::IsNullOrEmpty($rootToken)) {
    Write-Host "[local-stack] FAIL: LOCAL_OPENBAO_ROOT_TOKEN not set in .env.local"
    exit 1
}

# Write bootstrap script to temp file, docker cp into container, execute
# This avoids PowerShell quoting issues with docker exec arguments.
$bootstrapScript = @"
export BAO_ADDR='http://127.0.0.1:8200'
bao login $rootToken >/dev/null 2>&1
echo '[openbao-init] Authenticated.'
bao secrets enable -path=transit transit 2>/dev/null || echo '[openbao-init] Transit already enabled.'
bao write -f transit/keys/markflow-local 2>/dev/null || echo '[openbao-init] Key exists.'
bao policy write markflow-dev - 'path transit/encrypt/markflow-local { capabilities = [update] } path transit/decrypt/markflow-local { capabilities = [update] } path transit/keys/markflow-local { capabilities = [read] } path sys/health { capabilities = [read] }'
echo '[openbao-init] Bootstrap complete.'
"@
$bootstrapFile = Join-Path $env:TEMP "openbao-bootstrap.sh"
[System.IO.File]::WriteAllText($bootstrapFile, $bootstrapScript, [System.Text.UTF8Encoding]::new($false))
docker cp $bootstrapFile markflow-local-openbao:/tmp/bootstrap.sh
$proc = Start-Process -FilePath "docker" -ArgumentList @("exec", "-e", "BAO_ADDR=http://127.0.0.1:8200", "markflow-local-openbao", "sh", "/tmp/bootstrap.sh") -NoNewWindow -PassThru -Wait -RedirectStandardOutput "$env:TEMP\bootstrap-out.txt" -RedirectStandardError "$env:TEMP\bootstrap-err.txt"
$bootstrapOutput = Get-Content "$env:TEMP\bootstrap-out.txt" -ErrorAction SilentlyContinue
$bootstrapErr = Get-Content "$env:TEMP\bootstrap-err.txt" -ErrorAction SilentlyContinue
$bootstrapExit = $proc.ExitCode
Write-Host ($bootstrapOutput -join "`n")
if ($bootstrapErr) { Write-Host ($bootstrapErr -join "`n") }
Remove-Item $bootstrapFile -Force -ErrorAction SilentlyContinue

Write-Host $bootstrapOutput
if ($bootstrapExit -ne 0) {
    Write-Host "[local-stack] FAIL: OpenBao bootstrap failed (exit code $bootstrapExit)"
    exit 1
}

Write-Host ""
Write-Host "[local-stack] Services started and OpenBao bootstrapped."
Write-Host "[local-stack] Run 'powershell scripts/local-stack-status.ps1' to verify."
Write-Host "[local-stack] Run 'powershell scripts/local-smoke.ps1' to run smoke tests."
