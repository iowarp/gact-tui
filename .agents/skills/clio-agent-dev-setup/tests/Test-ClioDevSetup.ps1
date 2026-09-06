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
. (Join-Path $scriptsRoot "ClioDevHttp.ps1")

# The stop sweep's identity guard. Identity is the only evidence that authorizes
# a kill: cross-confirmation may confirm an owned identity, never replace one.
# The case that matters is a node-wide daemon adopted from a bare port query and
# recorded as cte_pid -- the port sweep then finds the same PID, cross-confirms
# the record, and used to force-kill a process running from outside the root.
$ownedRoot = "D:\Libraries\Documents\projects\clio_develop_workspace"
$externalDaemon = "C:\Program Files\clio-core\clio-core-daemon.exe --port 9413"
$processActionCases = @(
    @{
        identity = "C:\python.exe -m clio_agent --root $ownedRoot\generations\g1"
        crossConfirmed = $false
        reason = "recorded backend_pid"
        expected = "stop"
    },
    @{
        identity = "C:\python.exe -m clio_agent --root $ownedRoot\generations\g1"
        crossConfirmed = $true
        reason = "listener on port 8787"
        expected = "stop"
    },
    @{
        identity = "C:\Windows\System32\notepad.exe notepad"
        crossConfirmed = $false
        reason = "recorded backend_pid"
        expected = "ignore-stale"
    },
    @{
        identity = $externalDaemon
        crossConfirmed = $true
        reason = "listener on port 9413"
        expected = "refuse"
    },
    @{
        identity = $externalDaemon
        crossConfirmed = $true
        reason = "recorded cte_pid"
        expected = "refuse"
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

# ...and the short-circuit that produced it must be gone from the source, not
# merely unreachable for the identities above.
$cleanupSource = Get-Content -Raw -LiteralPath (Join-Path $scriptsRoot "ClioDevCleanup.ps1")
if ($cleanupSource -match 'if\s*\(\$CrossConfirmed\)\s*\{\s*return\s+"stop"') {
    throw "Resolve-ClioDevProcessAction must never return 'stop' on cross-confirmation alone."
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
if ($startSource -match '\$sharedModelCacheRoot\s*=[^\r\n]*\$devRootFull') {
    throw "The Hugging Face model cache must not live inside the disposable root; stop and reset delete it."
}
if ($startSource -notmatch '\$sharedModelCacheRoot\s*=[\s\S]{0,200}?\$env:LOCALAPPDATA') {
    throw "Start-ClioDev must place the shared model cache under LOCALAPPDATA, outside the disposable root."
}
foreach ($name in @("HF_HOME", "HF_HUB_CACHE", "HF_XET_CACHE")) {
    if ($startSource -notmatch "\b$name\s*=") {
        throw "Start-ClioDev does not export $name for shared model-cache reuse."
    }
}
if ($startSource -notmatch 'sync_preserved_committed_heads') {
    throw "Start-ClioDev must advance preserved runtime clones to the selected committed heads."
}
if ($startSource -notmatch 'CLIO_CODEX_TRANSPORT\s*=\s*"sdk"') {
    throw "Start-ClioDev must configure Codex through the backend's supported official SDK transport."
}
if ($startSource -match 'CLIO_CODEX_TRANSPORT\s*=\s*"app_server"') {
    throw "Start-ClioDev must not configure the removed Codex app-server transport."
}
if ($startSource -notmatch 'DOCLING_INFERENCE_COMPILE_TORCH_MODELS\s*=\s*"false"') {
    throw "Start-ClioDev must keep Docling inference independent of a Windows C++ compiler."
}
if ($startSource -notmatch '-Environment\s+\$documentProcessorEnvironment') {
    throw "Start-ClioDev must pass the Docling environment directly to its child process."
}
$preflightSource = Get-Content -Raw -LiteralPath (Join-Path $scriptsRoot "Test-ClioDevPreflight.ps1")
if (
    $startSource -notmatch '\[int\]\$BackendReadinessTimeoutSec\s*=\s*300' -or
    $startSource -notmatch 'AddSeconds\(\$BackendReadinessTimeoutSec\)'
) {
    throw "Start-ClioDev must allow preserved session-ledger rehydration to finish before failing readiness."
}
if ($startSource -notmatch '-HealthTimeoutSec\s+\$BackendReadinessTimeoutSec') {
    throw "Start-ClioDev must pass its readiness budget through to live preflight."
}
if ($preflightSource -notmatch 'HealthTimeoutSec[\s\S]{0,2500}?/v1/health[^\r\n]*-TimeoutSec\s+\$HealthTimeoutSec') {
    throw "Test-ClioDevPreflight must use the configured health timeout for preserved ledger rehydration."
}
if ($preflightSource -notmatch 'gact_versions[\s\S]{0,120}?contains\s+"0\.3"') {
    throw "Test-ClioDevPreflight must validate the negotiated GACT 0.3 envelope through gact_versions."
}
if ($preflightSource -match 'contract_version\s+-ne\s+"0\.3"') {
    throw "Test-ClioDevPreflight must not expect the legacy contract_version field in a GACT 0.3 envelope."
}
if ($preflightSource -notmatch 'x_clio_resources\.max_bytes') {
    throw "Test-ClioDevPreflight must validate resource custody through the backend's advertised max_bytes contract."
}
if ($preflightSource -match 'x_clio_resources\.enabled') {
    throw "Test-ClioDevPreflight must not require a resource enabled field that the backend does not advertise."
}

# Every stop this script performs is a restart step, never an uninstall. The
# readiness-failure path is the one that lost -PreserveState: a 60-second Vite
# timeout deleted the whole development root, generation and sessions included.
$stopCalls = @([regex]::Matches($startSource, '&\s+\$stopScript(?:[^\r\n]*`\r?\n)*[^\r\n]*'))
if ($stopCalls.Count -lt 3) {
    throw "Expected Start-ClioDev to invoke the stop script on the trap, restart, and readiness-failure paths; found $($stopCalls.Count)."
}
foreach ($call in $stopCalls) {
    if ($call.Value -notmatch '-PreserveState') {
        throw "Start-ClioDev invokes the stop script without -PreserveState, which deletes the development root: $($call.Value)"
    }
}
if ($startSource -notmatch 'if\s*\(\$null\s+-eq\s+\$webResponse[\s\S]*?-PreserveState[\s\S]*?throw\s+"CLIO web did not become ready') {
    throw "The web-readiness failure path must stop with -PreserveState instead of deleting the development root."
}

# The CTE listener is adopted from a port query, so it is recorded with who owns
# it and the stop sweep leaves an external daemon running.
if ($startSource -notmatch 'cte_external\s*=') {
    throw "Start-ClioDev must record whether the adopted CTE listener runs from outside the owned root."
}
$stopSource = Get-Content -Raw -LiteralPath (Join-Path $scriptsRoot "Stop-ClioDev.ps1")
if ($stopSource -notmatch '\$stillRunning\s*=\s*Get-Process') {
    throw "Stop-ClioDev must tolerate an owned process exiting after its ownership census."
}
if ($stopSource -notmatch '\$externalPids\.Contains\(\$ProcessId\)') {
    throw "Stop-ClioDev must refuse to stop a PID recorded as externally owned."
}
if ($stopSource -notmatch 'if\s*\(-not\s+\$generationManifestPresent\s+-and\s+-not\s+\$executableOwned\)') {
    throw "Without a generation manifest the sweep must require an owned EXECUTABLE, not a command-line mention."
}
if ($stopSource -match 'function\s+Test-ClioDevOwnedProcess') {
    throw "Stop-ClioDev must not carry the dead ancestry-walk helper."
}
if (
    $stopSource -notmatch '\$callerProcessTree\s*=\s*\[System\.Collections\.Generic\.HashSet\[int\]\]' -or
    $stopSource -notmatch '\$callerProcessTree\.Contains\(\$ProcessId\)'
) {
    throw "Stop-ClioDev must protect its complete caller chain from command-line ownership sweeps."
}

# One shell contract for the whole skill: -SkipHttpErrorCheck is PowerShell 7
# only, and under 5.1 it fails to bind before the request is ever made.
foreach ($file in Get-ChildItem -LiteralPath $scriptsRoot -Filter "*.ps1") {
    # Comment lines are exempt: the helper that replaced the parameter has to be
    # allowed to say which parameter it replaced.
    $offending = @(
        Get-Content -LiteralPath $file.FullName |
            Where-Object { $_ -match '-SkipHttpErrorCheck' -and $_ -notmatch '^\s*#' }
    )
    if ($offending.Count -gt 0) {
        throw "$($file.Name) uses the PowerShell 7-only -SkipHttpErrorCheck; use Invoke-ClioDevWebRequest."
    }
}
# ...and the replacement has to actually do the job the parameter did: a served
# 503 is data the readiness poll reads, while a refused connection still throws.
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$servedPort = ([System.Net.IPEndPoint]$listener.Server.LocalEndPoint).Port
$responder = [PowerShell]::Create()
[void]$responder.AddScript({
    param($Listener)

    $client = $Listener.AcceptTcpClient()
    $stream = $client.GetStream()
    $buffer = New-Object byte[] 4096
    [void]$stream.Read($buffer, 0, $buffer.Length)
    $body = '{"checks":{"docling":"loading"}}'
    $response = "HTTP/1.1 503 Service Unavailable`r`n" +
        "Content-Type: application/json`r`n" +
        "Content-Length: $($body.Length)`r`n" +
        "Connection: close`r`n`r`n$body"
    $bytes = [System.Text.Encoding]::ASCII.GetBytes($response)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
    $client.Close()
}).AddArgument($listener)
$responderHandle = $responder.BeginInvoke()
try {
    $servedProbe = Invoke-ClioDevWebRequest -Uri "http://127.0.0.1:$servedPort/readyz" -TimeoutSec 10
    if ($servedProbe.StatusCode -ne 503) {
        throw "A served 503 must be reported as a status, got '$($servedProbe.StatusCode)'."
    }
    if (($servedProbe.Content | ConvertFrom-Json).checks.docling -ne "loading") {
        throw "A served error response must carry its body through to the caller."
    }
}
finally {
    [void]$responder.EndInvoke($responderHandle)
    $responder.Dispose()
    $listener.Stop()
}

$refusedProbeThrew = $false
try {
    Invoke-ClioDevWebRequest -Uri "http://127.0.0.1:$servedPort/readyz" -TimeoutSec 2 | Out-Null
}
catch {
    $refusedProbeThrew = $true
}
if (-not $refusedProbeThrew) {
    throw "A refused connection must throw rather than be reported as an HTTP status."
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
    shared_model_cache_outside_disposable_root = $true
    preserved_heads_advanced = $true
    process_exit_race_tolerated = $true
    process_action_cases = $processActionCases.Count
    cross_confirmation_cannot_authorize_a_kill = $true
    external_listener_never_stopped = $true
    unscoped_sweep_requires_owned_executable = $true
    stop_calls_preserve_state = $stopCalls.Count
    http_error_status_is_data = $true
    legacy_root_ownership_checked = $true
} | ConvertTo-Json
