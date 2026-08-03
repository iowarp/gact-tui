# sse-dump.ps1 — subscribe to a GACT session's SSE event stream and write
# every frame as one JSON line to a file, for later reading with the Read tool.
#
# Usage (Windows PowerShell 5.1):
#   .\sse-dump.ps1 -SessionId sess_abc123 -Backend http://127.0.0.1:7777 `
#                  -Out sse-dump.jsonl -Seconds 30
#   # Replay from the beginning of the per-session buffer:
#   .\sse-dump.ps1 -SessionId sess_abc123 -LastEventId 0
#
# Each output line: {"captured_at": "...", "sse_event": "...", "sse_id": "...",
#                    "data": {<parsed JSON payload, or raw string if unparseable>}}
# The file is flushed after every event so another process (or a later poll)
# can read it while the stream is still open.
param(
    [Parameter(Mandatory = $true)][string]$SessionId,
    [string]$Backend = "http://127.0.0.1:7777",
    [string]$Out = "sse-dump.jsonl",
    [int]$Seconds = 30,
    [string]$LastEventId = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

$url = "$Backend/v1/sessions/$SessionId/events"
$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromSeconds($Seconds + 60)

$req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, $url)
$req.Headers.Accept.Add((New-Object System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("text/event-stream")))
if ($LastEventId -ne "") {
    [void]$req.Headers.TryAddWithoutValidation("Last-Event-ID", $LastEventId)
}

$resp = $client.SendAsync($req, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).Result
if (-not $resp.IsSuccessStatusCode) {
    Write-Error "GET $url -> $([int]$resp.StatusCode) $($resp.ReasonPhrase)"
    exit 1
}

$outPath = if ([System.IO.Path]::IsPathRooted($Out)) { $Out }
           else { Join-Path (Get-Location).Path $Out }
$writer = New-Object System.IO.StreamWriter($outPath, $false, (New-Object System.Text.UTF8Encoding($false)))

$stream = $resp.Content.ReadAsStreamAsync().Result
$reader = New-Object System.IO.StreamReader($stream)

$deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
$evt = ""; $id = ""; $dataLines = New-Object System.Collections.Generic.List[string]
$frames = 0

function Emit-Frame {
    param($evt, $id, $dataLines, $writer)
    if ($dataLines.Count -eq 0 -and $evt -eq "") { return $false }
    $raw = ($dataLines -join "`n")
    $data = $raw
    try { $data = $raw | ConvertFrom-Json } catch {}
    $row = [ordered]@{
        captured_at = [DateTime]::UtcNow.ToString("o")
        sse_event   = $evt
        sse_id      = $id
        data        = $data
    }
    $writer.WriteLine(($row | ConvertTo-Json -Compress -Depth 30))
    $writer.Flush()
    return $true
}

try {
    $readTask = $reader.ReadLineAsync()
    while ($true) {
        if (-not $readTask.Wait(250)) {
            if ([DateTime]::UtcNow -gt $deadline) { break }
            continue
        }
        $line = $readTask.Result
        if ($null -eq $line) { break }   # server closed the stream
        if ($line -eq "") {
            if (Emit-Frame $evt $id $dataLines $writer) { $frames++ }
            $evt = ""; $id = ""; $dataLines.Clear()
        }
        elseif ($line.StartsWith("event:")) { $evt = $line.Substring(6).Trim() }
        elseif ($line.StartsWith("id:"))    { $id = $line.Substring(3).Trim() }
        elseif ($line.StartsWith("data:"))  { $dataLines.Add($line.Substring(5).TrimStart()) }
        # comment lines (":") and unknown fields are ignored per the SSE spec
        if ([DateTime]::UtcNow -gt $deadline) { break }
        $readTask = $reader.ReadLineAsync()
    }
}
catch [System.AggregateException] {
    # stream torn down mid-read (server shutdown / cancellation) — keep what we have
}
finally {
    # flush a trailing frame that never got its blank-line terminator
    if (Emit-Frame $evt $id $dataLines $writer) { $frames++ }
    $writer.Close()
    $client.Dispose()
}

Write-Host "sse-dump: wrote $frames events -> $outPath"
