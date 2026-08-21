# W0-03: Local smoke test — PG, MinIO, OpenBao Transit round-trip (PowerShell).
# Verifies all services are accessible and functional.
# Cleans up test objects. Redacts all sensitive output. Exits nonzero on failure.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ROOT_DIR = Split-Path $PSScriptRoot -Parent
Set-Location $ROOT_DIR

if (!(Test-Path .env.local)) {
    Write-Host "ERROR: .env.local not found. Run 'local-stack-up.ps1' first."
    exit 1
}

# Parse .env.local (PowerShell 5.1 compatible)
$minioAccess = ""
$minioSecret = ""
Get-Content .env.local | ForEach-Object {
    $line = $_.Trim()
    if ($line -match "^LOCAL_MINIO_ACCESS_KEY=(.+)$") { $minioAccess = $matches[1] }
    if ($line -match "^LOCAL_MINIO_SECRET_KEY=(.+)$") { $minioSecret = $matches[1] }
}

$PASS = 0; $FAIL = 0

function Check($name, $result) {
    if ($result -eq 0) { Write-Host "  [PASS] $name"; $script:PASS++ }
    else { Write-Host "  [FAIL] $name"; $script:FAIL++ }
}

function Docker-Exec($container, $cmd) {
    $args = @("exec", $container, "sh", "-c", $cmd)
    $output = & docker @args 2>&1
    return @{ Output = $output -join "`n"; ExitCode = $LASTEXITCODE }
}

Write-Host "=== Local Stack Smoke Test ==="
Write-Host ""

# PostgreSQL
Write-Host "PostgreSQL 16:"
$pgVer = Docker-Exec "markflow-local-pg" "psql -U markflow -d markflow_local -t -c 'SELECT version()'"
if ($pgVer.Output -match "PostgreSQL 16") { Check "PostgreSQL 16 version" 0 } else { Check "PostgreSQL 16 version" 1 }
$pgConn = Docker-Exec "markflow-local-pg" "psql -U markflow -d markflow_local -c 'SELECT 1'"
if ($pgConn.Output -match "1") { Check "PostgreSQL connection" 0 } else { Check "PostgreSQL connection" 1 }

# MinIO
Write-Host ""
Write-Host "MinIO:"
Docker-Exec "markflow-local-minio" "mc alias set local http://127.0.0.1:9000 $minioAccess $minioSecret" | Out-Null
Docker-Exec "markflow-local-minio" "mc mb local/markflow-local 2>/dev/null || true" | Out-Null
$testKey = "test-tenant-smoke/$(Get-Date -UFormat %s)-smoke"
Docker-Exec "markflow-local-minio" "echo smoke-test | mc pipe local/markflow-local/$testKey" | Out-Null
$readBack = Docker-Exec "markflow-local-minio" "mc cat local/markflow-local/$testKey"
if ($readBack.Output -match "smoke-test") { Check "MinIO write/read with tenant prefix" 0 } else { Check "MinIO write/read" 1 }
$rmResult = Docker-Exec "markflow-local-minio" "mc rm local/markflow-local/$testKey 2>&1"
if ($rmResult.ExitCode -eq 0) { Check "MinIO cleanup verified" 0 } else { Check "MinIO cleanup verified" 1 }

# OpenBao Transit (needs BAO_ADDR via -e flag and auth)
Write-Host ""
Write-Host "OpenBao Transit:"

function Docker-Exec-Env($container, $envVars, $cmd) {
    $dockerArgs = @("exec")
    foreach ($kv in $envVars.GetEnumerator()) {
        $dockerArgs += @("-e", "$($kv.Key)=$($kv.Value)")
    }
    $dockerArgs += @($container, "sh", "-c", $cmd)
    $output = & docker @dockerArgs 2>&1
    return @{ Output = $output -join "`n"; ExitCode = $LASTEXITCODE }
}

$baoEnv = @{ "BAO_ADDR" = "http://127.0.0.1:8200" }
$baoStatus = Docker-Exec-Env "markflow-local-openbao" $baoEnv "bao status -format=json"
if ($baoStatus.Output -match '"initialized":true') { Check "OpenBao initialized" 0 } else { Check "OpenBao initialized" 1 }

$baoTransit = Docker-Exec-Env "markflow-local-openbao" $baoEnv "bao login root >/dev/null 2>&1 && bao secrets list -format=json 2>/dev/null"
if ($baoTransit.Output -match '"transit/"') { Check "Transit engine enabled" 0 } else { Check "Transit engine" 1 }

$pt = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("smoke-test-$(Get-Date -UFormat %s)"))
$encOut = Docker-Exec-Env "markflow-local-openbao" $baoEnv "bao login root >/dev/null 2>&1 && bao write -format=json transit/encrypt/markflow-local plaintext=$pt 2>/dev/null"
$enc = ""
if ($encOut.Output -match '"ciphertext":"([^"]+)"') { $enc = $Matches[1] }
if ($enc) { Check "Transit encrypt" 0 } else { Check "Transit encrypt" 1 }

$decOut = Docker-Exec-Env "markflow-local-openbao" $baoEnv "bao login root >/dev/null 2>&1 && bao write -format=json transit/decrypt/markflow-local ciphertext=$enc 2>/dev/null"
$decB64 = ""
if ($decOut.Output -match '"plaintext":"([^"]+)"') { $decB64 = $Matches[1] }
$decText = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($decB64))
$origText = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($pt))
if ($decText -eq $origText) { Check "Transit decrypt round-trip" 0 } else { Check "Transit decrypt round-trip" 1 }

# Summary
Write-Host ""
Write-Host "=== Results: $PASS passed, $FAIL failed ==="
if ($FAIL -gt 0) { exit 1 }
