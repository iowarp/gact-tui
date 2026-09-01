[CmdletBinding()]
param(
    [string]$DevRoot = "D:\Libraries\Documents\projects\clio_develop_workspace",
    [string[]]$ExpectedPaths = @(),
    [string[]]$ForbiddenLegacyRoots = @(
        "D:\tmp",
        "D:\relay-local",
        "D:\ws",
        "D:\clio-workspace"
    )
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ClioDevCleanup.ps1")
$expectedRoot = [System.IO.Path]::GetFullPath(
    "D:\Libraries\Documents\projects\clio_develop_workspace"
)
$devRootFull = [System.IO.Path]::GetFullPath($DevRoot)

if (-not $devRootFull.Equals($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "The CLIO development root drifted from '$expectedRoot' to '$devRootFull'."
}

$containedRoots = @(
    "worktrees",
    "runtime",
    "workspaces",
    "logs",
    "temp",
    "cache",
    "tools",
    "config"
) | ForEach-Object { Join-Path $devRootFull $_ }

foreach ($path in @($containedRoots + $ExpectedPaths)) {
    $fullPath = [System.IO.Path]::GetFullPath($path)
    if (-not $fullPath.StartsWith(
            "$devRootFull\",
            [System.StringComparison]::OrdinalIgnoreCase
        )) {
        throw "Generated path escapes the owned CLIO development root: $fullPath"
    }
}

# A legacy root only fails the audit when it is provably OURS — it carries the
# generation state this tooling writes. `D:\tmp` and friends are generic names;
# their mere existence proves nothing, and failing on it aborts a deployment
# over a directory the tooling never created and cannot clean up.
$legacyPresent = @($ForbiddenLegacyRoots | Where-Object { Test-Path -LiteralPath $_ })
$legacyResidue = @($legacyPresent | Where-Object { Test-ClioDevOwnedResidue -Path $_ })
$unownedLegacyPaths = @($legacyPresent | Where-Object { $_ -notin $legacyResidue })
if ($legacyResidue.Count -gt 0) {
    throw "Legacy CLIO runtime roots still exist outside the owned root: $($legacyResidue -join ', ')."
}
foreach ($path in $unownedLegacyPaths) {
    Write-Warning "Legacy root name '$path' exists but carries no CLIO generation state; recorded as unrelated residue, not treated as a stale CLIO root."
}

[pscustomobject]@{
    contained = $true
    root = $devRootFull
    checked_paths = $containedRoots
    forbidden_roots_absent = @($ForbiddenLegacyRoots | Where-Object { $_ -notin $legacyPresent })
    unowned_legacy_paths = $unownedLegacyPaths
} | ConvertTo-Json -Depth 3
