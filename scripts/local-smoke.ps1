# W0-03: Local smoke test — PG, MinIO, OpenBao Transit round-trip (PowerShell).
# Verifies all services are accessible and functional.
# Cleans up test objects. Redacts all sensitive output. Exits nonzero on failure.
#
# Root-token use is smoke-only. Root token must never be used by application
# adapters (W0-03a) or committed to Git.

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
# Does not throw on non-zero exit codes; caller checks ExitCode.
function Docker-Exec($container, $cmd) {
    $dargs = @("exec", $container, "sh", "-c", $cmd)
    try { $output = & docker @dargs 2>&1 }
    catch { $output = @($_.Exception.Message) }
    return @{ Output = ($output -join "`n"); ExitCode = $LASTEXITCODE }
}

# Invoke-Bao: PowerShell-safe Docker exec for OpenBao commands.
# Uses explicit argument arrays, never shell string interpolation.
# Passes BAO_ADDR and BAO_TOKEN via -e flags (no bao login needed).
# Root token use is smoke-only; forbidden for W0-03a application adapters.
# Does not throw on non-zero exit codes; caller checks ExitCode.
function Invoke-Bao($baoArgs) {
    $dargs = @("exec",
        "-e", "BAO_ADDR=http://127.0.0.1:8200",
        "-e", "BAO_TOKEN=$rootToken",
        "markflow-local-openbao",
        "bao") + $baoArgs
    try { $output = & docker @dargs 2>&1 }
    catch { $output = @($_.Exception.Message) }
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
if ($rmResult.ExitCode -ne 0) {
    Check "MinIO cleanup (rm)" 1
} else {
    # Verify absence: mc stat must return non-zero exit code after rm
    $statResult = Docker-Exec "markflow-local-minio" "mc stat local/markflow-local/$testKey"
    if ($statResult.ExitCode -ne 0) { Check "MinIO cleanup verified (stat confirms gone)" 0 }
    else { Check "MinIO cleanup verified (stat confirms gone)" 1 }
}

# ─── 3. OpenBao Transit ───
# Root token from .env.local is used directly via BAO_TOKEN -e flag.
# No bao login, no token-helper state, no printed tokens.
Write-Host ""
Write-Host "OpenBao Transit:"

# Diagnostic: verify BAO_ADDR is HTTP by checking bao status succeeds
# (HTTPS would fail with a connection error since server is HTTP-only)
$baoDiag = Invoke-Bao @("status")
if ($baoDiag.ExitCode -eq 0 -and $baoDiag.Output -match "Initialized") {
    Check "BAO_ADDR diagnostic (HTTP, not HTTPS)" 0
} else {
    Check "BAO_ADDR diagnostic (HTTP, not HTTPS)" 1
}

# Check Transit engine is enabled
$baoTransit = Invoke-Bao @("secrets", "list", "-format=json")
if ($baoTransit.Output -match '"transit/"') { Check "Transit engine enabled" 0 } else { Check "Transit engine enabled" 1 }

# Transit encrypt round-trip
$pt = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("smoke-test-$(Get-Date -UFormat %s)"))
$encResult = Invoke-Bao @("write", "-format=json", "transit/encrypt/markflow-local", "plaintext=$pt")
$encJson = $null
try { $encJson = $encResult.Output | ConvertFrom-Json } catch { }
$enc = ""
if ($encJson -and $encJson.data.ciphertext) { $enc = $encJson.data.ciphertext }
if ($enc) { Check "Transit encrypt" 0 } else { Check "Transit encrypt" 1 }

# Transit decrypt round-trip (only if encrypt succeeded)
if ($enc) {
    $decResult = Invoke-Bao @("write", "-format=json", "transit/decrypt/markflow-local", "ciphertext=$enc")
    $decJson = $null
    try { $decJson = $decResult.Output | ConvertFrom-Json } catch { }
    $decB64 = ""
    if ($decJson -and $decJson.data.plaintext) { $decB64 = $decJson.data.plaintext }
    if ($decB64) {
        $decText = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($decB64))
        $origText = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($pt))
        if ($decText -eq $origText) { Check "Transit decrypt round-trip" 0 } else { Check "Transit decrypt round-trip" 1 }
    } else {
        Write-Host "  [FAIL] Transit decrypt (could not parse response)"
        $FAIL++
    }
} else {
    Write-Host "  [SKIP] Transit decrypt (encrypt failed)"
}

# ─── Summary ───
Write-Host ""
Write-Host "=== Results: $PASS passed, $FAIL failed ==="
if ($FAIL -gt 0) { exit 1 }
