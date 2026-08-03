# turn-shape.ps1 — post one user message to a GACT backend and capture the
# full SSE event sequence for that turn, then summarize event-type counts.
# Use it to answer "what does one turn look like on THIS backend?" — the
# starting point of any wire-differential (emulator vs clio) investigation.
#
# Usage (Windows PowerShell 5.1):
#   .\turn-shape.ps1 -Backend http://127.0.0.1:7777
#   .\turn-shape.ps1 -Backend http://127.0.0.1:7777 -Prompt "propose a diff" `
#                    -Out turn-shape.jsonl -MaxWaitSeconds 90
#
# Creates a NEW session (never reuses one — turn capture must not mutate real
# sessions), subscribes via scripts/sse-dump.ps1 in a background job, posts the
# prompt, waits for message.completed (or the deadline), then prints a count
# per event type. Raw evidence stays in -Out for Read-tool inspection.
param(
    [string]$Backend = "http://127.0.0.1:7777",
    [string]$Prompt = "hello from turn-shape",
    [string]$WorkspaceId = "",
    [int]$MaxWaitSeconds = 60,
    [string]$Out = "turn-shape.jsonl"
)

$ErrorActionPreference = "Stop"
$sseDump = Join-Path $PSScriptRoot "sse-dump.ps1"
if (-not (Test-Path $sseDump)) { Write-Error "missing $sseDump"; exit 2 }

$outPath = if ([System.IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path (Get-Location) $Out }

# 1. Resolve a workspace.
if ($WorkspaceId -eq "") {
    $ws = Invoke-RestMethod -Uri "$Backend/v1/workspaces" -TimeoutSec 15
    if (-not $ws.workspaces -or $ws.workspaces.Count -eq 0) {
        Write-Error "backend has no workspaces; pass -WorkspaceId"; exit 2
    }
    $WorkspaceId = $ws.workspaces[0].id
}

# 2. Create a fresh session.
$sessionBody = @{ workspace_id = $WorkspaceId; title = "turn-shape $(Get-Date -Format s)" } | ConvertTo-Json -Compress
$session = Invoke-RestMethod -Uri "$Backend/v1/sessions" -Method Post -ContentType "application/json" -Body $sessionBody -TimeoutSec 15
$sid = $session.id
Write-Host "turn-shape: session $sid in $WorkspaceId on $Backend"

# 3. Subscribe to SSE in a background job BEFORE posting, so no frame is lost.
$job = Start-Job -ScriptBlock {
    param($script, $sid, $backend, $out, $seconds)
    & $script -SessionId $sid -Backend $backend -Out $out -Seconds $seconds
} -ArgumentList $sseDump, $sid, $Backend, $outPath, $MaxWaitSeconds
Start-Sleep -Seconds 2   # let the subscriber attach

# 4. Post the user message.
$msgBody = @{ parts = @(@{ type = "text"; text = $Prompt }) } | ConvertTo-Json -Compress -Depth 5
$posted = Invoke-RestMethod -Uri "$Backend/v1/sessions/$sid/messages" -Method Post -ContentType "application/json" -Body $msgBody -TimeoutSec 15
Write-Host "turn-shape: posted message $($posted.message_id)"

# 5. Wait for message.completed in the capture file, or the deadline.
$deadline = [DateTime]::UtcNow.AddSeconds($MaxWaitSeconds)
$sawCompleted = $false
while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Seconds 2
    if ((Test-Path $outPath) -and (Select-String -Path $outPath -Pattern '"message\.completed"' -Quiet)) {
        $sawCompleted = $true
        Start-Sleep -Seconds 2   # allow trailing events (status back to idle) to land
        break
    }
    if ($job.State -ne "Running") { break }
}
Stop-Job $job -ErrorAction SilentlyContinue
Receive-Job $job -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  [sse-dump] $_" }
Remove-Job $job -Force -ErrorAction SilentlyContinue

# 6. Summarize event-type counts, preserving first-seen order.
if (-not (Test-Path $outPath)) { Write-Error "no capture written to $outPath"; exit 1 }
$order = New-Object System.Collections.Generic.List[string]
$counts = @{}
$total = 0
Get-Content $outPath | ForEach-Object {
    if ($_.Trim() -eq "") { return }
    $row = $_ | ConvertFrom-Json
    $t = $row.sse_event
    if (-not $t -and $row.data -and $row.data.type) { $t = $row.data.type }
    if (-not $t) { $t = "(untyped)" }
    if (-not $counts.ContainsKey($t)) { $counts[$t] = 0; $order.Add($t) }
    $counts[$t]++
    $total++
}

Write-Host ""
Write-Host "turn shape for session $sid ($total events, message.completed seen: $sawCompleted)"
foreach ($t in $order) {
    Write-Host ("  {0,4}  {1}" -f $counts[$t], $t)
}
Write-Host ""
Write-Host "raw capture: $outPath (read it with the Read tool; do not grep-and-guess)"
if (-not $sawCompleted) { exit 1 }
exit 0
