[CmdletBinding()]
param(
    [string]$DevRoot = "D:\Libraries\Documents\projects\clio_develop_workspace",
    [ValidateRange(1, 65535)]
    [int]$BackendPort = 8787,
    [ValidateRange(1, 65535)]
    [int]$WebPort = 5174,
    [ValidateRange(1, 65535)]
    [int]$DocumentProcessorPort = 8089,
    [ValidateRange(1, 65535)]
    [int]$CtePort = 9413,
    [switch]$PreserveState
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ClioDevCleanup.ps1")
$expectedRoot = [System.IO.Path]::GetFullPath(
    "D:\Libraries\Documents\projects\clio_develop_workspace"
)
$devRootFull = [System.IO.Path]::GetFullPath($DevRoot)
if (-not $devRootFull.Equals($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to stop or delete '$devRootFull'. The owned CLIO development root is '$expectedRoot'."
}
$activeGenerationPath = Join-Path $devRootFull "config\active-generation.json"
$generationManifestPresent = Test-Path -LiteralPath $activeGenerationPath -PathType Leaf
if ($generationManifestPresent) {
    $activeGeneration = Get-Content -Raw -LiteralPath $activeGenerationPath | ConvertFrom-Json
    $generationRoot = [System.IO.Path]::GetFullPath([string]$activeGeneration.generation_root)
    $runtimeRoot = [System.IO.Path]::GetFullPath([string]$activeGeneration.runtime_root)
}
else {
    $generationRoot = $devRootFull
    $runtimeRoot = Join-Path $devRootFull "runtime\clio-agent-dev"
}
$statePath = Join-Path $runtimeRoot "dev-processes.json"
$targetPids = [System.Collections.Generic.HashSet[int]]::new()
$recordedPids = [System.Collections.Generic.HashSet[int]]::new()
$externalPids = [System.Collections.Generic.HashSet[int]]::new()
$trackedResidue = @()

function Add-OwnedProcessId {
    param(
        [Parameter(Mandatory)]
        [int]$ProcessId,
        [Parameter(Mandatory)]
        [string]$Reason
    )

    # Stop-ClioDev is also invoked in-process by Start-ClioDev and Reset-ClioDev.
    # A missing or stale generation manifest may broaden generationRoot to the
    # owned development root, which appears in this process's own command line.
    # The cleanup routine must never terminate its caller.
    if ($ProcessId -eq $PID) {
        return
    }

    # A PID Start-ClioDev recorded as external is a daemon this tooling adopted,
    # not one it launched; it is never a stop target however it reaches the
    # sweep. (An ancestry walk is the tempting way to widen ownership here --
    # Windows Store Python can hand a contained venv launcher a child whose own
    # executable and command line no longer name the generation. It is also how a
    # sweep starts killing by parentage rather than identity, so ownership stays
    # a property of the process in front of us.)
    if ($externalPids.Contains($ProcessId)) {
        Write-Warning "Leaving externally owned PID $ProcessId ($Reason) running; it was not started from $devRootFull."
        return
    }

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        return
    }
    $identity = "$($process.ExecutablePath) $($process.CommandLine)"
    $action = Resolve-ClioDevProcessAction `
        -Identity $identity `
        -OwnedRoot $devRootFull `
        -Reason $Reason `
        -CrossConfirmed:($recordedPids.Contains($ProcessId))
    switch ($action) {
        "stop" {
            [void]$targetPids.Add($ProcessId)
        }
        "ignore-stale" {
            Write-Warning "Ignoring stale recorded PID $ProcessId ($Reason); its identity is outside the owned root."
        }
        default {
            throw "Refusing to stop PID $ProcessId ($Reason): it is not owned by $devRootFull."
        }
    }
}

$recordedPidProperties = @(
    "backend_pid",
    "web_pid",
    "document_processor_pid",
    "cte_pid",
    "backend_launcher_pid",
    "web_launcher_pid",
    "document_processor_launcher_pid"
)
if (Test-Path -LiteralPath $statePath) {
    $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
    # Adopted listeners are recorded with a companion `<name>_external` flag when
    # Start-ClioDev found them running from outside the owned root. Collect them
    # BEFORE any sweep so no later signal -- record, port or generation hit --
    # can turn one into a kill target.
    foreach ($property in $recordedPidProperties) {
        $value = $state.$property
        if ($null -ne $value -and [int]$value -gt 0 -and $state."${property}_external" -eq $true) {
            [void]$externalPids.Add([int]$value)
        }
    }
    foreach ($property in $recordedPidProperties) {
        $value = $state.$property
        if ($null -ne $value -and [int]$value -gt 0) {
            # Act on the record BEFORE remembering it: a recorded PID that
            # cross-confirms itself would make the stale-record branch
            # unreachable and force-kill a recycled PID. Recording it after
            # still lets a later port/generation hit on the same PID confirm it.
            Add-OwnedProcessId -ProcessId ([int]$value) -Reason "recorded $property"
            [void]$recordedPids.Add([int]$value)
        }
    }
}

Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {
    $executablePath = [string]$_.ExecutablePath
    $identity = "$executablePath $($_.CommandLine)"
    # IndexOf with an explicit StringComparison, not Contains: the
    # (string, StringComparison) Contains overload is .NET Core only and throws
    # on Windows PowerShell 5.1, which is the shell this skill runs under.
    if ($identity.IndexOf($generationRoot, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
        return
    }
    # With a generation manifest, generationRoot names one generation directory
    # and a command-line mention is strong evidence. Without one it degrades to
    # the whole development root, which every editor, sibling shell and co-tree
    # agent that ever opened a file in it carries in ITS command line -- and only
    # $PID is guarded. In that case the executable must live under the root, and
    # a mere mention is reported instead of killed.
    $executableOwned = $executablePath.IndexOf(
        $generationRoot,
        [System.StringComparison]::OrdinalIgnoreCase
    ) -ge 0
    if (-not $generationManifestPresent -and -not $executableOwned) {
        if ([int]$_.ProcessId -ne $PID) {
            Write-Warning (
                "Reporting PID $($_.ProcessId) ($($_.Name)): its command line mentions $generationRoot " +
                "but its executable does not, and no generation manifest scopes the sweep."
            )
        }
        return
    }
    Add-OwnedProcessId -ProcessId ([int]$_.ProcessId) -Reason "active generation process"
}

foreach ($port in @($BackendPort, $WebPort, $DocumentProcessorPort, $CtePort)) {
    Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
        ForEach-Object {
            Add-OwnedProcessId -ProcessId ([int]$_.OwningProcess) -Reason "listener on port $port"
        }
}

foreach ($processId in $targetPids) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        continue
    }

    try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
    }
    catch {
        # A child may exit after the ownership census but before Stop-Process.
        # Treat that normal race as an already-completed stop, while preserving
        # every error for a process that is still present.
        $stillRunning = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($null -ne $stillRunning) {
            throw
        }
        continue
    }
    Write-Host "Stopped $($process.ProcessName) (PID $processId)."
}

foreach ($port in @($BackendPort, $WebPort, $DocumentProcessorPort, $CtePort)) {
    $releaseDeadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        $remaining = @(
            Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
                Where-Object { -not $externalPids.Contains([int]$_.OwningProcess) }
        )
        if ($remaining.Count -eq 0) {
            break
        }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $releaseDeadline)
    # An external listener never had to release: this tooling deliberately left
    # it running, so waiting for its port is waiting for something that must not
    # happen.
    if ($remaining.Count -gt 0) {
        throw "Port $port did not release within 10 seconds after the scoped stop."
    }
}

if (Test-Path -LiteralPath $statePath) {
    Remove-Item -LiteralPath $statePath -Force
}

if (-not $PreserveState -and (Test-Path -LiteralPath $devRootFull)) {
    try {
        [System.IO.Directory]::Delete($devRootFull, $true)
    }
    catch {
        $deleteError = $_.Exception.Message
        $trackedResidue = @(Remove-ClioDevCleanupResidue -Root $devRootFull)
        Write-Warning "Stopped the active runtime, but unrelated residue remains for handoff: $($trackedResidue -join ', ')."
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
    else {
        Write-Host "Removed disposable CLIO development root $devRootFull."
    }
}

[pscustomobject]@{
    stopped = $true
    state_preserved = [bool]$PreserveState
    active_generation = $generationRoot
    tracked_residue = $trackedResidue
    external_pids_left_running = @($externalPids)
} | ConvertTo-Json -Depth 3
