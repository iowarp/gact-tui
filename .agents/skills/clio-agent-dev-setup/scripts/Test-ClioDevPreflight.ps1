[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$BackendPort = 8787,
    [ValidateRange(1, 65535)]
    [int]$WebPort = 5174,
    [string]$ExpectedProvider = "claude_code",
    [string]$ExpectedModel = "sonnet",
    [string]$ExpectedTransport = "sdk",
    [string]$SpotterImplDir = "D:\Libraries\Documents\projects\clio_develop_workspace\runtime\clio-agent-dev\agent-blueprints\spotter-ai\impl",
    [string]$SpotterConfigPath = "D:\Libraries\Documents\projects\clio_develop_workspace\spotter-clio-config.yaml",
    [string[]]$RequiredMcpNamespaces = @("geo", "ndp", "pandas", "plot"),
    [ValidateRange(1, 10)]
    [int]$McpWarmupAttempts = 4,
    [ValidateRange(10, 600)]
    [int]$McpWarmupTimeoutSec = 180,
    [string[]]$RequiredBlueprints = @(
        "base-agent",
        "cluster-operator",
        "data-semantics",
        "deep-researcher",
        "document-production",
        "earthscope-flat",
        "earthscope-gnss-region",
        "factorio",
        "phenotype",
        "spotter-ai",
        "wildfire-smoke-impact-review"
    )
)

$ErrorActionPreference = "Stop"
$backendUrl = "http://127.0.0.1:$BackendPort"
$webUrl = "http://127.0.0.1:$WebPort"

function Get-OneListenerPid {
    param(
        [Parameter(Mandatory)]
        [int]$Port
    )

    $pids = @(
        Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )
    if ($pids.Count -ne 1) {
        throw "Expected exactly one listener on port $Port; found $($pids.Count)."
    }
    return [int]$pids[0]
}

$backendPid = Get-OneListenerPid -Port $BackendPort
$webPid = Get-OneListenerPid -Port $WebPort
$health = Invoke-RestMethod -Uri "$backendUrl/v1/health" -TimeoutSec 10
$provider = Invoke-RestMethod -Uri "$backendUrl/v1/providers/lm" -TimeoutSec 10
$catalog = Invoke-RestMethod -Uri "$backendUrl/v1/agent-blueprints" -TimeoutSec 20
$sources = Invoke-RestMethod -Uri "$backendUrl/v1/agent-blueprints/sources" -TimeoutSec 10
$webResponse = Invoke-WebRequest -Uri "$webUrl/" -TimeoutSec 10
$spotterImplRoot = [System.IO.Path]::GetFullPath($SpotterImplDir)
$spotterConfigFull = [System.IO.Path]::GetFullPath($SpotterConfigPath)

if ($health.overall_status -ne "ready") {
    throw "CLIO health is '$($health.overall_status)', not ready."
}

$integrations = @($health.integrations)
$arc = $integrations | Where-Object { $_.name -eq "arc" }
if ($null -eq $arc -or $arc.status -ne "ready" -or $arc.endpoint -notmatch ":9413$") {
    throw "ARC is not a ready clio-core/CTE service on port 9413."
}

if ($provider.provider -ne $ExpectedProvider) {
    throw "Provider mismatch: expected '$ExpectedProvider', got '$($provider.provider)'."
}
if ($provider.model -ne $ExpectedModel) {
    throw "Model mismatch: expected '$ExpectedModel', got '$($provider.model)'."
}
if ($provider.transport -ne $ExpectedTransport) {
    throw "Transport mismatch: expected '$ExpectedTransport', got '$($provider.transport)'."
}

$blueprints = @($catalog.agent_blueprints)
$invalidBlueprints = @($blueprints | Where-Object { -not $_.enabled -or @($_.validation_errors).Count -gt 0 })
if ($invalidBlueprints.Count -gt 0) {
    throw "Invalid or disabled blueprints: $($invalidBlueprints.id -join ', ')."
}

$installedIds = @($blueprints.id)
$missingBlueprints = @($RequiredBlueprints | Where-Object { $_ -notin $installedIds })
if ($missingBlueprints.Count -gt 0) {
    throw "Required bundled blueprints are missing: $($missingBlueprints -join ', ')."
}

if (-not (Test-Path -LiteralPath $spotterImplRoot -PathType Container)) {
    throw "SPOTTER implementation is missing: $spotterImplRoot"
}
if (-not (Test-Path -LiteralPath $spotterConfigFull -PathType Leaf)) {
    throw "SPOTTER CLIO configuration is missing: $spotterConfigFull"
}
$spotterConfigText = Get-Content -Raw -LiteralPath $spotterConfigFull
foreach ($requiredSetting in @(
    "provenance.agentic.jsonl.path:",
    "provenance.artifacts.native.workspace_root:"
)) {
    if (-not $spotterConfigText.Contains($requiredSetting)) {
        throw "SPOTTER CLIO configuration omits '$requiredSetting'."
    }
}

$sourceRows = @($sources.sources)
$bundledSource = $sourceRows | Where-Object { $_.is_default -eq $true } | Select-Object -First 1
if ($null -eq $bundledSource) {
    throw "The installed default marketplace is missing from /v1/agent-blueprints/sources."
}
if ($bundledSource.status -ne "ready") {
    throw "The default marketplace source is '$($bundledSource.status)', not ready."
}
$sourceBlueprintIds = @($bundledSource.available_blueprints.id)
$uninstalledSourceBlueprints = @(
    $sourceBlueprintIds | Where-Object { $_ -notin $installedIds }
)
if ($uninstalledSourceBlueprints.Count -gt 0) {
    throw "The default marketplace advertises blueprints that are not installed: $($uninstalledSourceBlueprints -join ', ')."
}
$missingSourceBlueprints = @(
    $RequiredBlueprints | Where-Object { $_ -notin $sourceBlueprintIds }
)
if ($missingSourceBlueprints.Count -gt 0) {
    throw "The default marketplace source omits: $($missingSourceBlueprints -join ', ')."
}

$mcpServers = @()
$mcpFailures = @()
for ($attempt = 1; $attempt -le $McpWarmupAttempts; $attempt++) {
    try {
        $handshake = Invoke-RestMethod `
            -Uri "$backendUrl/v1/mcp/handshake" `
            -TimeoutSec $McpWarmupTimeoutSec
        $mcpServers = @($handshake.servers)
        $mcpFailures = @(
            foreach ($namespace in $RequiredMcpNamespaces) {
                $server = $mcpServers |
                    Where-Object { $_.name -eq $namespace } |
                    Select-Object -First 1
                if ($null -eq $server) {
                    "${namespace}: absent from handshake"
                }
                elseif (-not $server.reachable -or $server.state -ne "ready") {
                    "${namespace}: state=$($server.state), error=$($server.error)"
                }
            }
        )
    }
    catch {
        $mcpFailures = @("handshake request failed: $($_.Exception.Message)")
    }

    if ($mcpFailures.Count -eq 0) {
        break
    }
    if ($attempt -lt $McpWarmupAttempts) {
        Start-Sleep -Seconds 2
    }
}

if ($mcpFailures.Count -gt 0) {
    throw "Required MCP namespaces did not become ready after $McpWarmupAttempts attempts: $($mcpFailures -join '; ')."
}

$readyMcpServers = @(
    $mcpServers |
        Where-Object { $_.name -in $RequiredMcpNamespaces } |
        Select-Object name, state, tools_count, latency_ms
)

if ($webResponse.StatusCode -ne 200) {
    throw "CLIO web returned HTTP $($webResponse.StatusCode)."
}

$degraded = @($integrations | Where-Object { $_.status -eq "degraded" })
$warnings = [System.Collections.Generic.List[string]]::new()
foreach ($item in $degraded) {
    $warnings.Add("$($item.name): $($item.summary)")
}

[pscustomobject]@{
    ready = $true
    backend_url = $backendUrl
    backend_pid = $backendPid
    web_url = $webUrl
    web_pid = $webPid
    provider = $provider.provider
    model = $provider.model
    transport = $provider.transport
    blueprint_count = $blueprints.Count
    blueprint_ids = $installedIds
    marketplace_source = $bundledSource.name
    marketplace_commit = $bundledSource.commit
    spotter_impl_dir = $spotterImplRoot
    spotter_config_path = $spotterConfigFull
    required_mcp_namespaces = $readyMcpServers
    warnings = $warnings
} | ConvertTo-Json -Depth 5
