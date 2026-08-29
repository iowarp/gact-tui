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
$expectedRoot = [System.IO.Path]::GetFullPath(
    "D:\Libraries\Documents\projects\clio_develop_workspace"
)
$devRootFull = [System.IO.Path]::GetFullPath($DevRoot)
if (-not $devRootFull.Equals($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to stop or delete '$devRootFull'. The owned CLIO development root is '$expectedRoot'."
}
$runtimeRoot = Join-Path $devRootFull "runtime\clio-agent-dev"
$statePath = Join-Path $runtimeRoot "dev-processes.json"
$targetPids = [System.Collections.Generic.HashSet[int]]::new()

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
    if (-not $identity.Contains($devRootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to stop PID $ProcessId ($Reason): it is not owned by $devRootFull."
    }
    [void]$targetPids.Add($ProcessId)
}

if (Test-Path -LiteralPath $statePath) {
    $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
    foreach ($property in @("backend_pid", "web_pid")) {
        $value = $state.$property
        if ($null -ne $value -and [int]$value -gt 0) {
            Add-OwnedProcessId -ProcessId ([int]$value) -Reason "recorded $property"
        }
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
    $remaining = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($remaining) {
        throw "Port $port is still listening after the scoped stop."
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
        throw @"
Failed to delete the complete disposable CLIO development root '$devRootFull'.
Do not move or quarantine the residue. Repair its ACLs, delete this exact root, and rerun stop.
Original error: $($_.Exception.Message)
"@
    }
    if (Test-Path -LiteralPath $devRootFull) {
        throw "Stop verification failed: '$devRootFull' still exists."
    }
    Write-Host "Removed disposable CLIO development root $devRootFull."
}
