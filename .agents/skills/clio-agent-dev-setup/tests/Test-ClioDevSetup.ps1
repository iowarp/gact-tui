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
} | ConvertTo-Json
