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

$legacyResidue = @(
    $ForbiddenLegacyRoots | Where-Object { Test-Path -LiteralPath $_ }
)
if ($legacyResidue.Count -gt 0) {
    throw "Legacy CLIO runtime roots still exist outside the owned root: $($legacyResidue -join ', ')."
}

[pscustomobject]@{
    contained = $true
    root = $devRootFull
    checked_paths = $containedRoots
    forbidden_roots_absent = $ForbiddenLegacyRoots
} | ConvertTo-Json -Depth 3
