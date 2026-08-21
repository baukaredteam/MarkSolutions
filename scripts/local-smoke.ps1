# W0-03: Local smoke test — PG, MinIO, OpenBao Transit round-trip (PowerShell).
# Verifies all services are accessible and functional.
# Cleans up test objects. Redacts all sensitive output. Exits nonzero on failure.
#
# W0-03-smoke-fix: Previous run (5fc4335) failed due to:
#   1. OpenBao HTTPS-vs-HTTP: bao CLI defaults to HTTPS; container uses HTTP.
#   2. MinIO cleanup: || true masked bucket creation failure; cleanup not verified.
#   3. Missing diagnostic assertion before Transit operations.
# This run documents exact redacted command output.

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
$rootToken = ""
Get-Content .env.local | ForEach-Object {
    $line = $_.Trim()
    if ($line -match "^LOCAL_MINIO_ACCESS_KEY=(.+)$") { $minioAccess = $matches[1] }
    if ($line -match "^LOCAL_MINIO_SECRET_KEY=(.+)$") { $minioSecret = $matches[1] }
    if ($line -match "^LOCAL_OPENBAO_ROOT_TOKEN=(.+)$") { $rootToken = $matches[1] }
}

$PASS = 0; $FAIL = 0

function Check($name, $result) {
    if ($result -eq 0) { Write-Host "  [PASS] $name"; $script:PASS++ }
    else { Write-Host "  [FAIL] $name"; $script:FAIL++ }
}

# Docker exec helper — uses call operator with splatting
function Docker-Exec($container, $cmd) {
    $dargs = @("exec", $container, "sh", "-c", $cmd)
    $output = & docker @dargs 2>&1
    return @{ Output = ($output -join "`n"); ExitCode = $LASTEXITCODE }
}

# Run bao command via temp script (avoids PowerShell quoting issues)
# Uses unique temp file per call to avoid race conditions
function Run-Bao($cmd) {
    $scriptId = [System.IO.Path]::GetRandomFileName()
    $scriptFile = Join-Path $env:TEMP "bao-$scriptId.sh"
    $containerScript = "/tmp/bao-$scriptId.sh"
    $scriptContent = "export BAO_ADDR='http://127.0.0.1:8200'`n$cmd"
    [System.IO.File]::WriteAllText($scriptFile, $scriptContent, [System.Text.UTF8Encoding]::new($false))
    docker cp $scriptFile markflow-local-openbao:$containerScript 2>$null | Out-Null
    $output = docker exec markflow-local-openbao sh $containerScript 2>&1
    Remove-Item $scriptFile -Force -ErrorAction SilentlyContinue
    return @{ Output = ($output -join "`n"); ExitCode = $LASTEXITCODE }
}

Write-Host "=== Local Stack Smoke Test ==="
Write-Host ""

# ─── 1. PostgreSQL ───
Write-Host "PostgreSQL 16:"
$pgVer = Docker-Exec "markflow-local-pg" "psql -U markflow -d markflow_local -t -c 'SELECT version()'"
if ($pgVer.Output -match "PostgreSQL 16") { Check "PostgreSQL 16 version" 0 } else { Check "PostgreSQL 16 version" 1 }
$pgConn = Docker-Exec "markflow-local-pg" "psql -U markflow -d markflow_local -c 'SELECT 1'"
if ($pgConn.Output -match "1") { Check "PostgreSQL connection" 0 } else { Check "PostgreSQL connection" 1 }

# ─── 2. MinIO ───
Write-Host ""
Write-Host "MinIO:"
$aliasResult = Docker-Exec "markflow-local-minio" "mc alias set local http://127.0.0.1:9000 $minioAccess $minioSecret"
Check "MinIO alias set" $aliasResult.ExitCode

$mbResult = Docker-Exec "markflow-local-minio" "mc mb --ignore-existing local/markflow-local"
Check "MinIO bucket create (idempotent)" $mbResult.ExitCode

$testKey = "test-tenant-smoke/$(Get-Date -UFormat %s)-smoke"
$writeResult = Docker-Exec "markflow-local-minio" "echo smoke-test | mc pipe local/markflow-local/$testKey"
Check "MinIO write test object" $writeResult.ExitCode

$readResult = Docker-Exec "markflow-local-minio" "mc cat local/markflow-local/$testKey"
if ($readResult.Output -match "smoke-test") { Check "MinIO read test object" 0 } else { Check "MinIO read test object" 1 }

$rmResult = Docker-Exec "markflow-local-minio" "mc rm local/markflow-local/$testKey"
if ($rmResult.ExitCode -ne 0) { Check "MinIO cleanup (rm)" 1 } else {
    $statResult = Docker-Exec "markflow-local-minio" "mc stat local/markflow-local/$testKey 2>&1 || echo GONE"
    if ($statResult.Output -match "GONE|not found|NoSuchKey") { Check "MinIO cleanup verified (stat confirms gone)" 0 }
    else { Check "MinIO cleanup verified (stat confirms gone)" 1 }
}

# ─── 3. OpenBao Transit ───
Write-Host ""
Write-Host "OpenBao Transit:"

# Diagnostic: verify BAO_ADDR is correct before any bao command
$baoDiag = Run-Bao 'printf "%s" "$BAO_ADDR"'
if ($baoDiag.Output -eq "http://127.0.0.1:8200") { Check "BAO_ADDR diagnostic (http, not https)" 0 }
else { Check "BAO_ADDR diagnostic (http, not https)" 1 }

# Authenticate with root token from .env.local
if ([string]::IsNullOrEmpty($rootToken)) {
    Write-Host "  [FAIL] No root token in .env.local"
    $FAIL++
} else {
    $baoAuth = Run-Bao "bao login '$rootToken'"
    if ($baoAuth.Output -match "Success|already authenticated") { Check "OpenBao authentication" 0 }
    else { Check "OpenBao authentication" 1 }
}

# Check OpenBao status
$baoStatus = Run-Bao "bao status -format=json"
if ($baoStatus.Output -match '"initialized":\s*true') { Check "OpenBao initialized" 0 } else { Check "OpenBao initialized" 1 }

# Check Transit engine
$baoTransit = Run-Bao "bao secrets list -format=json"
if ($baoTransit.Output -match '"transit/"') { Check "Transit engine enabled" 0 } else { Check "Transit engine enabled" 1 }

# Encrypt round-trip
$pt = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("smoke-test-$(Get-Date -UFormat %s)"))
$encResult = Run-Bao "bao login '$rootToken' >/dev/null 2>&1 && bao write -format=json transit/encrypt/markflow-local plaintext=$pt"
$enc = ""
if ($encResult.Output -match '"ciphertext":"([^"]+)"') { $enc = $Matches[1] }
if ($enc) { Check "Transit encrypt" 0 } else { Check "Transit encrypt" 1 }

# Decrypt round-trip (only if encrypt succeeded)
if ($enc) {
    $decResult = Run-Bao "bao login '$rootToken' >/dev/null 2>&1 && bao write -format=json transit/decrypt/markflow-local ciphertext=$enc"
    $decB64 = ""
    if ($decResult.Output -match '"plaintext":"([^"]+)"') { $decB64 = $Matches[1] }
    if ($decB64) {
        $decText = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($decB64))
        $origText = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($pt))
        if ($decText -eq $origText) { Check "Transit decrypt round-trip" 0 } else { Check "Transit decrypt round-trip" 1 }
    } else {
        Write-Host "  [FAIL] Transit decrypt (could not parse ciphertext)"
        $FAIL++
    }
} else {
    Write-Host "  [SKIP] Transit decrypt (encrypt failed)"
}

# ─── Summary ───
Write-Host ""
Write-Host "=== Results: $PASS passed, $FAIL failed ==="
if ($FAIL -gt 0) { exit 1 }
