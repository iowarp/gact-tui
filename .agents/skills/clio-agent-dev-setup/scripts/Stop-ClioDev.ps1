[CmdletBinding()]
param(
    [string]$DevRoot = "D:\Libraries\Documents\projects\clio_develop_workspace",
    [ValidateRange(1, 65535)]
    [int]$BackendPort = 8787,
    [ValidateRange(1, 65535)]
    [int]$WebPort = 5174,
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
if (Test-Path -LiteralPath $activeGenerationPath -PathType Leaf) {
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
$trackedResidue = @()

function Add-OwnedProcessId {
    param(
        [Parameter(Mandatory)]
        [int]$ProcessId,
        [Parameter(Mandatory)]
        [string]$Reason
    )

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

if (Test-Path -LiteralPath $statePath) {
    $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
    foreach ($property in @(
        "backend_pid",
        "web_pid",
        "cte_pid",
        "backend_launcher_pid",
        "web_launcher_pid"
    )) {
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
    $identity = "$($_.ExecutablePath) $($_.CommandLine)"
    # IndexOf, not Contains: the (string, StringComparison) Contains overload is
    # .NET Core only and throws on Windows PowerShell 5.1.
    if ($identity.IndexOf($generationRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        Add-OwnedProcessId -ProcessId ([int]$_.ProcessId) -Reason "active generation process"
    }
}

foreach ($port in @($BackendPort, $WebPort, $CtePort)) {
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

    Stop-Process -Id $processId -Force -ErrorAction Stop
    Write-Host "Stopped $($process.ProcessName) (PID $processId)."
}

foreach ($port in @($BackendPort, $WebPort, $CtePort)) {
    $releaseDeadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        $remaining = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
        if (-not $remaining) {
            break
        }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $releaseDeadline)
    if ($remaining) {
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
} | ConvertTo-Json -Depth 3
