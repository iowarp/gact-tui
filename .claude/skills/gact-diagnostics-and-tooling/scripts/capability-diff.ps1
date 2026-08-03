# capability-diff.ps1 — fetch GET /v1/capabilities from two GACT backends and
# print a field-level diff. This is the cross-surface parity primitive: run it
# emulator-vs-clio (or clio-vs-clio across versions) before trusting that a
# capability-gated feature behaves the same on both.
#
# Usage (Windows PowerShell 5.1):
#   .\capability-diff.ps1 -BackendA http://127.0.0.1:7777 -BackendB http://127.0.0.1:17801
#   .\capability-diff.ps1 -BackendA ... -BackendB ... -All   # show SAME rows too
#
# Exit codes: 0 = no differences, 1 = differences found, 2 = fetch failure.
param(
    [Parameter(Mandatory = $true)][string]$BackendA,
    [Parameter(Mandatory = $true)][string]$BackendB,
    [switch]$All
)

$ErrorActionPreference = "Stop"

function Get-Caps([string]$backend) {
    try {
        return Invoke-RestMethod -Uri "$backend/v1/capabilities" -TimeoutSec 15
    }
    catch {
        Write-Error "GET $backend/v1/capabilities failed: $($_.Exception.Message)"
        exit 2
    }
}

# Flatten a PSCustomObject tree into path -> scalar-or-compact-JSON leaves.
function Flatten($node, [string]$prefix, [hashtable]$acc) {
    if ($null -eq $node) { $acc[$prefix] = "null"; return }
    if ($node -is [System.Management.Automation.PSCustomObject]) {
        $props = $node.PSObject.Properties
        if (-not ($props | Select-Object -First 1)) { $acc[$prefix] = "{}"; return }
        foreach ($p in $props) {
            $key = if ($prefix) { "$prefix.$($p.Name)" } else { $p.Name }
            Flatten $p.Value $key $acc
        }
        return
    }
    if ($node -is [System.Array]) {
        $acc[$prefix] = ($node | ConvertTo-Json -Compress -Depth 20)
        return
    }
    if ($node -is [bool]) { $acc[$prefix] = $node.ToString().ToLower(); return }
    $acc[$prefix] = "$node"
}

$capsA = Get-Caps $BackendA
$capsB = Get-Caps $BackendB

$flatA = @{}; Flatten $capsA "" $flatA
$flatB = @{}; Flatten $capsB "" $flatB

$keys = ($flatA.Keys + $flatB.Keys) | Sort-Object -Unique
$rows = @()
foreach ($k in $keys) {
    $inA = $flatA.ContainsKey($k); $inB = $flatB.ContainsKey($k)
    $va = if ($inA) { $flatA[$k] } else { "(absent)" }
    $vb = if ($inB) { $flatB[$k] } else { "(absent)" }
    $status = if (-not $inA) { "ONLY_B" }
              elseif (-not $inB) { "ONLY_A" }
              elseif ($va -ceq $vb) { "SAME" }
              else { "DIFF" }
    $rows += [pscustomobject]@{ Field = $k; A = $va; B = $vb; Status = $status }
}

$diffs = @($rows | Where-Object { $_.Status -ne "SAME" })

Write-Host "A = $BackendA"
Write-Host "B = $BackendB"
Write-Host ("fields: {0} total, {1} differ" -f $rows.Count, $diffs.Count)

# @() wrapper: in PowerShell 5.1 a single PSCustomObject has no .Count property,
# so an unwrapped one-row result would silently print "no differences".
$show = @(if ($All) { $rows } else { $diffs })
if ($show.Count -gt 0) {
    $show | Format-Table -AutoSize Field, A, B, Status | Out-String -Width 400 | Write-Host
}
elseif (-not $All) {
    Write-Host "no differences"
}

if ($diffs.Count -gt 0) { exit 1 } else { exit 0 }
