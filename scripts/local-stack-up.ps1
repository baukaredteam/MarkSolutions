# W0-03: Start local integration stack (PowerShell — Windows authoritative path).
# Generates .env.local with random secrets on first run.
# All services bind to 127.0.0.1 only.
# OpenBao bootstrap uses docker exec with -e BAO_TOKEN (no host bao, no temp scripts).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ROOT_DIR = Split-Path $PSScriptRoot -Parent
$ENV_LOCAL = Join-Path $ROOT_DIR ".env.local"

Set-Location $ROOT_DIR

# ─── Generate .env.local on first run ───
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

# ─── Start services ───
Write-Host "[local-stack] Starting services..."
docker compose -f compose.local.yml --env-file .env.local up -d

# ─── Wait for all services to be healthy ───
Write-Host "[local-stack] Waiting for services to be healthy..."
$timeout = 120; $elapsed = 0
while ($elapsed -lt $timeout) {
    $psJson = docker compose -f compose.local.yml --env-file .env.local ps --format json 2>$null
    if ($psJson) {
        $ps = $psJson | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($ps) {
            $healthy = @($ps | Where-Object { $_.Status -match "healthy" }).Count
            if ($healthy -ge 2) { break }
        }
    }
    Start-Sleep -Seconds 3; $elapsed += 3
}

# ─── Bootstrap OpenBao ───
# Reads root token from .env.local; passes it via docker exec -e BAO_TOKEN.
# No temp scripts, no docker cp, no bao login, no token-helper state.
# Every error fails hard.
Write-Host "[local-stack] Bootstrapping OpenBao..."

$envVars = @{}
Get-Content $ENV_LOCAL | ForEach-Object {
    if ($_ -match "^([^#=]+)=(.*)$") { $envVars[$matches[1].Trim()] = $matches[2].Trim() }
}
$rootToken = $envVars["LOCAL_OPENBAO_ROOT_TOKEN"]
if ([string]::IsNullOrEmpty($rootToken)) {
    Write-Host "[local-stack] FAIL: LOCAL_OPENBAO_ROOT_TOKEN not set in .env.local"
    exit 1
}

# Helper: run bao via docker exec with explicit -e flags (no temp scripts).
# Returns @{ Output; ExitCode }. Returns exit code 1 on exception (never stale LASTEXITCODE).
function Invoke-Bao($baoArgs) {
    $dargs = @("exec", "-e", "BAO_ADDR=http://127.0.0.1:8200", "-e", "BAO_TOKEN=$rootToken",
               "markflow-local-openbao", "bao") + $baoArgs
    try { $output = & docker @dargs 2>&1 }
    catch { return @{ Output = $_.Exception.Message; ExitCode = 1 } }
    return @{ Output = ($output -join "`n"); ExitCode = $LASTEXITCODE }
}

# Verify Transit engine status (list mounts)
$mounts = Invoke-Bao @("secrets", "list")
if ($mounts.ExitCode -ne 0) {
    Write-Host "[local-stack] FAIL: Could not list secrets engines (exit $($mounts.ExitCode))"
    exit 1
}

# Enable Transit only if absent
if ($mounts.Output -notmatch '"transit/"') {
    Write-Host "[local-stack] Enabling Transit engine..."
    $enableResult = Invoke-Bao @("secrets", "enable", "-path=transit", "transit")
    if ($enableResult.ExitCode -ne 0) {
        Write-Host "[local-stack] FAIL: Could not enable Transit (exit $($enableResult.ExitCode))"
        exit 1
    }
} else {
    Write-Host "[local-stack] Transit engine already enabled."
}

# Read the markflow-local key
$keyResult = Invoke-Bao @("read", "transit/keys/markflow-local")
if ($keyResult.ExitCode -ne 0) {
    # Create key if absent
    Write-Host "[local-stack] Creating markflow-local key..."
    $keyCreate = Invoke-Bao @("write", "-f", "transit/keys/markflow-local")
    if ($keyCreate.ExitCode -ne 0) {
        Write-Host "[local-stack] FAIL: Could not create markflow-local key (exit $($keyCreate.ExitCode))"
        exit 1
    }
} else {
    Write-Host "[local-stack] markflow-local key already exists."
}

Write-Host ""
Write-Host "[local-stack] Services started and OpenBao bootstrapped."
Write-Host "[local-stack] Run 'powershell scripts/local-stack-status.ps1' to verify."
Write-Host "[local-stack] Run 'powershell scripts/local-smoke.ps1' to run smoke tests."
