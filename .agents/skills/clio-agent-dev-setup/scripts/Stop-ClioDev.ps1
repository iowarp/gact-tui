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
$runtimeRoot = [System.IO.Path]::GetFullPath((Join-Path $DevRoot "runtime\clio-agent-dev"))
$statePath = Join-Path $runtimeRoot "dev-processes.json"
$targetPids = [System.Collections.Generic.HashSet[int]]::new()

if (Test-Path -LiteralPath $statePath) {
    $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
    foreach ($property in @("backend_pid", "web_pid")) {
        $value = $state.$property
        if ($null -ne $value -and [int]$value -gt 0) {
            [void]$targetPids.Add([int]$value)
        }
    }
}

foreach ($port in @($BackendPort, $WebPort, $CtePort)) {
    Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
        ForEach-Object { [void]$targetPids.Add([int]$_.OwningProcess) }
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

if (-not $PreserveState -and (Test-Path -LiteralPath $runtimeRoot)) {
    $resolvedDevRuntime = [System.IO.Path]::GetFullPath((Join-Path $DevRoot "runtime"))
    if (-not $runtimeRoot.StartsWith($resolvedDevRuntime, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to delete runtime outside $resolvedDevRuntime."
    }
    Remove-Item -LiteralPath $runtimeRoot -Recurse -Force
    Write-Host "Removed disposable CLIO development runtime $runtimeRoot."
}
