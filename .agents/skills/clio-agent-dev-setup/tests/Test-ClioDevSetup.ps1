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

. (Join-Path $scriptsRoot "ClioDevCleanup.ps1")

# The stop sweep's identity guard. The stale-record case is the one that used to
# be unreachable: a recorded PID confirmed itself, so a recycled PID belonging to
# an unrelated process was force-killed.
$ownedRoot = "D:\Libraries\Documents\projects\clio_develop_workspace"
$processActionCases = @(
    @{
        identity = "C:\python.exe -m clio_agent --root $ownedRoot\generations\g1"
        crossConfirmed = $false
        reason = "recorded backend_pid"
        expected = "stop"
    },
    @{
        identity = "C:\Windows\System32\notepad.exe notepad"
        crossConfirmed = $false
        reason = "recorded backend_pid"
        expected = "ignore-stale"
    },
    @{
        identity = "C:\Windows\System32\notepad.exe notepad"
        crossConfirmed = $true
        reason = "listener on port 8787"
        expected = "stop"
    },
    @{
        identity = "C:\Windows\System32\notepad.exe notepad"
        crossConfirmed = $false
        reason = "listener on port 8787"
        expected = "refuse"
    }
)
foreach ($case in $processActionCases) {
    $action = Resolve-ClioDevProcessAction `
        -Identity $case.identity `
        -OwnedRoot $ownedRoot `
        -Reason $case.reason `
        -CrossConfirmed:$case.crossConfirmed
    if ($action -ne $case.expected) {
        throw ("Resolve-ClioDevProcessAction('{0}', crossConfirmed={1}, reason='{2}') = '{3}', expected '{4}'." -f
            $case.identity, $case.crossConfirmed, $case.reason, $action, $case.expected)
    }
}

# Legacy-root ownership: a bare directory is not CLIO residue; one carrying this
# tooling's generation state is.
$residueProbe = Join-Path ([System.IO.Path]::GetTempPath()) ("clio-dev-residue-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $residueProbe | Out-Null
try {
    if (Test-ClioDevOwnedResidue -Path $residueProbe) {
        throw "An empty directory must not be reported as CLIO residue."
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $residueProbe "config") | Out-Null
    Set-Content -LiteralPath (Join-Path $residueProbe "config\active-generation.json") `
        -Value "{}" -Encoding utf8
    if (-not (Test-ClioDevOwnedResidue -Path $residueProbe)) {
        throw "A directory carrying config\active-generation.json must be reported as CLIO residue."
    }
    if (Test-ClioDevOwnedResidue -Path (Join-Path $residueProbe "does-not-exist")) {
        throw "A missing path must not be reported as CLIO residue."
    }
}
finally {
    Remove-Item -LiteralPath $residueProbe -Recurse -Force -ErrorAction SilentlyContinue
}

# A legacy-root NAME that exists but carries no generation state must not abort
# the audit; it is recorded as unrelated residue instead.
$unownedProbe = Join-Path ([System.IO.Path]::GetTempPath()) ("clio-dev-unowned-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $unownedProbe | Out-Null
try {
    $audit = & (Join-Path $scriptsRoot "Test-ClioDevContainment.ps1") `
        -ForbiddenLegacyRoots @($unownedProbe) 3>$null | ConvertFrom-Json
    if ($audit.unowned_legacy_paths -notcontains $unownedProbe) {
        throw "Containment audit did not record an unowned legacy-root name as residue."
    }
}
finally {
    Remove-Item -LiteralPath $unownedProbe -Recurse -Force -ErrorAction SilentlyContinue
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
    process_action_cases = $processActionCases.Count
    legacy_root_ownership_checked = $true
} | ConvertTo-Json
