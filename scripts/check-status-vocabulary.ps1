# W0-03: Status vocabulary alignment check.
# Extracts all unique values from the Status column of TRACEABILITY_MATRIX.md
# and proves every unique value appears in the controlled vocabulary.
# Fails if any undocumented status value is found.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ROOT_DIR = Split-Path $PSScriptRoot -Parent
$MATRIX = Join-Path $ROOT_DIR "docs\requirements\leadership-2026-08\TRACEABILITY_MATRIX.md"

if (!(Test-Path $MATRIX)) {
    Write-Host "ERROR: TRACEABILITY_MATRIX.md not found at $MATRIX"
    exit 1
}

$VOCABULARY = @(
    "verified-implemented",
    "partial",
    "demo-only",
    "mock-only",
    "development-only",
    "contract-stub",
    "missing",
    "conflict",
    "decision-needed",
    "unknown"
)

# Extract status values from the Status column (column 4 in pipe-delimited table)
$content = Get-Content $MATRIX -Raw
$statuses = @()
$inTable = $false
foreach ($line in ($content -split "`n")) {
    if ($line -match '^\| Req ID') { $inTable = $true; continue }
    if ($inTable -and $line -match '^\|[-\s|]+$') { continue } # skip separator
    if ($inTable -and $line -match '^\|') {
        $cols = $line -split '\|'
        if ($cols.Count -ge 5) {
            $status = $cols[4].Trim()
            if ($status -and $status -ne "Status" -and $status -ne "") {
                $statuses += $status
            }
        }
    }
}

$unique = @($statuses | Sort-Object -Unique)
$undocumented = @($unique | Where-Object { $_ -notin $VOCABULARY })

Write-Host "=== Status Vocabulary Check ==="
Write-Host "Unique statuses found: $($unique.Count)"
$unique | ForEach-Object { Write-Host "  $_" }
Write-Host ""
Write-Host "Controlled vocabulary: $($VOCABULARY.Count) values"
$VOCABULARY | ForEach-Object { Write-Host "  $_" }
Write-Host ""

if ($undocumented.Count -eq 0) {
    Write-Host "PASS: All statuses match controlled vocabulary."
    exit 0
} else {
    Write-Host "FAIL: Undocumented statuses found:"
    $undocumented | ForEach-Object { Write-Host "  $_" }
    exit 1
}
