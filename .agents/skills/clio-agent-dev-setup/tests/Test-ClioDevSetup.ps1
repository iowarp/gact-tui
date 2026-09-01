[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$skillRoot = Split-Path -Parent $PSScriptRoot
$scriptsRoot = Join-Path $skillRoot "scripts"

foreach ($file in Get-ChildItem -LiteralPath $scriptsRoot -Filter "*.ps1") {
    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile(
        $file.FullName,
        [ref]$tokens,
        [ref]$errors
    )
    if ($errors.Count -gt 0) {
        throw "$($file.Name) does not parse: $($errors[0].Message)"
    }
}

& (Join-Path $scriptsRoot "Test-ClioDevContainment.ps1") | Out-Null

$startSource = Get-Content -Raw -LiteralPath (Join-Path $scriptsRoot "Start-ClioDev.ps1")
if ($startSource -notmatch '\$sharedModelCacheRoot\s*=\s*Join-Path\s+\$devRootFull\s+"cache\\huggingface"') {
    throw "Start-ClioDev must keep one Hugging Face model cache per contained CLIO root."
}
foreach ($name in @("HF_HOME", "HF_HUB_CACHE", "HF_XET_CACHE")) {
    if ($startSource -notmatch "\b$name\s*=") {
        throw "Start-ClioDev does not export $name for shared model-cache reuse."
    }
}
if ($startSource -notmatch 'sync_preserved_committed_heads') {
    throw "Start-ClioDev must advance preserved runtime clones to the selected committed heads."
}
if ($startSource -notmatch 'Preserved \$\(\$runtimeSource\.Name\) runtime clone is dirty') {
    throw "Start-ClioDev must reject dirty preserved runtime clones before changing heads."
}
$stopSource = Get-Content -Raw -LiteralPath (Join-Path $scriptsRoot "Stop-ClioDev.ps1")
if ($stopSource -notmatch '\$stillRunning\s*=\s*Get-Process') {
    throw "Stop-ClioDev must tolerate an owned process exiting after its ownership census."
}

$escapeRejected = $false
try {
    & (Join-Path $scriptsRoot "Test-ClioDevContainment.ps1") `
        -ExpectedPaths "D:\outside-clio-dev-root" | Out-Null
}
catch {
    $escapeRejected = $_.Exception.Message -like "*escapes the owned CLIO development root*"
}
if (-not $escapeRejected) {
    throw "Containment audit did not reject an escaped generated path."
}

foreach ($guardedScript in @("Reset-ClioDev.ps1", "Stop-ClioDev.ps1")) {
    $wrongRootRejected = $false
    try {
        & (Join-Path $scriptsRoot $guardedScript) `
            -DevRoot "D:\wrong-clio-dev-root" `
            -BackendPort 65531 `
            -WebPort 65532 `
            -CtePort 65533 | Out-Null
    }
    catch {
        $wrongRootRejected = $_.Exception.Message -like "*owned CLIO development root*"
    }
    if (-not $wrongRootRejected) {
        throw "$guardedScript did not reject an unowned deletion root."
    }
}

[pscustomobject]@{
    passed = $true
    parsed_scripts = @(Get-ChildItem -LiteralPath $scriptsRoot -Filter "*.ps1").Count
    containment_escape_rejected = $true
    unowned_reset_rejected = $true
    unowned_stop_rejected = $true
    shared_model_cache = $true
    preserved_heads_advanced = $true
    process_exit_race_tolerated = $true
} | ConvertTo-Json
