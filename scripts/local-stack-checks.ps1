# W0-03: Static checks for local stack correctness.
# Proves: no latest tags, no host bao, no || true in PS1 scripts, no secrets in committed files.
# Only checks PowerShell scripts (authoritative Windows path).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ROOT_DIR = Split-Path $PSScriptRoot -Parent
Set-Location $ROOT_DIR

$PASS = 0; $FAIL = 0

function Check($name, $result) {
    if ($result -eq 0) { Write-Host "  [PASS] $name"; $script:PASS++ }
    else { Write-Host "  [FAIL] $name"; $script:FAIL++ }
}

Write-Host "=== Local Stack Static Checks ==="
Write-Host ""

# 1. No floating image tags in compose.local.yml
$hasLatest = Select-String -Path compose.local.yml -Pattern ":latest" -Quiet
Check "No ':latest' tags in compose.local.yml" $(if ($hasLatest) { 1 } else { 0 })

# 2. No host bao invocation in PowerShell scripts (reject standalone 'bao' not inside docker exec)
$psFiles = Get-ChildItem scripts/*.ps1 -ErrorAction SilentlyContinue
$hasHostBao = $false
foreach ($f in $psFiles) {
    $content = Get-Content $f.FullName -Raw
    if ($content -match '\bbao\b' -and $content -notmatch 'docker exec') { $hasHostBao = $true }
}
Check "No host bao invocation in PowerShell scripts" $(if ($hasHostBao) { 1 } else { 0 })

# 3. No || true in critical PS1 scripts
$criticalFiles = @("scripts/local-stack-up.ps1", "scripts/local-stack-reset.ps1", "scripts/local-smoke.ps1")
$hasOrTrue = $false
foreach ($f in $criticalFiles) {
    if (Test-Path $f) {
        $content = Get-Content $f -Raw
        if ($content -match '\|\|\s*true') { $hasOrTrue = $true }
    }
}
Check "No '|| true' in critical PS1 scripts" $(if ($hasOrTrue) { 1 } else { 0 })

# 4. No secret values in committed docs/evidence
$docFiles = Get-ChildItem docs/production/W0-03_LOCAL_STACK_*.md -ErrorAction SilentlyContinue
$hasSecret = $false
foreach ($f in $docFiles) {
    $content = Get-Content $f.FullName -Raw
    if ($content -match 'postgresql://[^:]+:[^CHANGEME][^@]+@') { $hasSecret = $true }
}
Check "No real secret values in committed docs" $(if ($hasSecret) { 1 } else { 0 })

# 5. compose.local.yml has no openbao-data volume (ignore comments)
$composeContent = Get-Content compose.local.yml | Where-Object { $_ -notmatch '^\s*#' }
$hasOpenbaoVol = ($composeContent | Select-String -Pattern "openbao-data" -Quiet)
Check "No openbao-data volume in compose" $(if ($hasOpenbaoVol) { 1 } else { 0 })

# 6. No legacy .sh scripts remain
$shFiles = @(Get-ChildItem scripts/*.sh -ErrorAction SilentlyContinue)
Check "No legacy .sh scripts remain" $(if ($shFiles.Count -gt 0) { 1 } else { 0 })

# Summary
Write-Host ""
Write-Host "=== Results: $PASS passed, $FAIL failed ==="
if ($FAIL -gt 0) { exit 1 }
