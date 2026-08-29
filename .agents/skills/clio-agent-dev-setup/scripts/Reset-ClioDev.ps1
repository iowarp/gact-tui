[CmdletBinding(SupportsShouldProcess, ConfirmImpact = "High")]
param(
    [string]$DevRoot = "D:\Libraries\Documents\projects\clio_develop_workspace",
    [ValidateRange(1, 65535)]
    [int]$BackendPort = 8787,
    [ValidateRange(1, 65535)]
    [int]$WebPort = 5174,
    [ValidateRange(1, 65535)]
    [int]$CtePort = 9413,
    [switch]$RecreateRoot
)

$ErrorActionPreference = "Stop"
$expectedRoot = [System.IO.Path]::GetFullPath(
    "D:\Libraries\Documents\projects\clio_develop_workspace"
)
$devRootFull = [System.IO.Path]::GetFullPath($DevRoot)
$stopScript = Join-Path $PSScriptRoot "Stop-ClioDev.ps1"

if (-not $devRootFull.Equals($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to reset '$devRootFull'. The owned CLIO development root is '$expectedRoot'."
}

& $stopScript `
    -DevRoot $devRootFull `
    -BackendPort $BackendPort `
    -WebPort $WebPort `
    -CtePort $CtePort `
    -PreserveState

if (Test-Path -LiteralPath $devRootFull) {
    if (-not $PSCmdlet.ShouldProcess($devRootFull, "delete the complete disposable CLIO development root")) {
        return
    }

    try {
        [System.IO.Directory]::Delete($devRootFull, $true)
    }
    catch {
        throw @"
Failed to delete the owned CLIO development root '$devRootFull'.
Do not rename, quarantine, copy, or work around the remaining tree. Repair its ACLs with an
elevated Windows shell, delete the same exact root, and rerun reset. Original error:
$($_.Exception.Message)
"@
    }
}

if (Test-Path -LiteralPath $devRootFull) {
    throw "Reset verification failed: '$devRootFull' still exists."
}

if ($RecreateRoot) {
    New-Item -ItemType Directory -Path $devRootFull | Out-Null
}

[pscustomobject]@{
    clean = $true
    root = $devRootFull
    recreated = [bool]$RecreateRoot
} | ConvertTo-Json
