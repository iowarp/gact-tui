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
. (Join-Path $PSScriptRoot "ClioDevCleanup.ps1")
$trackedResidue = @()

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
        $deleteError = $_.Exception.Message
        $trackedResidue = @(Remove-ClioDevCleanupResidue -Root $devRootFull)
        Write-Warning "Reset could not remove an inactive generation, so it will be retained as tracked residue while a new isolated generation starts. Residue: $($trackedResidue -join ', ')."
    }
}

if ($RecreateRoot) {
    New-Item -ItemType Directory -Force -Path $devRootFull | Out-Null
}

if ($trackedResidue.Count -gt 0) {
    $configRoot = Join-Path $devRootFull "config"
    New-Item -ItemType Directory -Force -Path $configRoot | Out-Null
    [pscustomobject]@{
        recorded_at = [DateTimeOffset]::Now.ToString("o")
        cleanup_error = $deleteError
        paths = $trackedResidue
        blocks_deployment = $false
    } | ConvertTo-Json -Depth 4 | Set-Content `
        -LiteralPath (Join-Path $configRoot "cleanup-residue.json") `
        -Encoding utf8
}

[pscustomobject]@{
    active_runtime_clean = $true
    root = $devRootFull
    recreated = [bool]$RecreateRoot
    tracked_residue = $trackedResidue
} | ConvertTo-Json
