[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$BackendPort = 8787,
    [ValidateRange(1, 65535)]
    [int]$WebPort = 5174,
    [string]$ExpectedProvider = "codex",
    [string]$ExpectedModel = "gpt-5.6-luna",
    [string]$ExpectedTransport = "app_server",
    [string]$DevRoot = "D:\Libraries\Documents\projects\clio_develop_workspace",
    [string]$SpotterImplDir = "",
    [string]$SpotterConfigPath = "",
    [string[]]$RequiredMcpNamespaces = @(),
    [ValidateRange(10, 600)]
    [int]$McpWarmupTimeoutSec = 180,
    [ValidateRange(30, 900)]
    [int]$McpWarmupDeadlineSec = 300,
    [string[]]$RequiredBlueprints = @(
        "base-agent",
        "cluster-operator",
        "data-semantics",
        "deep-researcher",
        "document-production",
        "earthscope-flat",
        "earthscope-gnss-region",
        "earthscope-single-agent",
        "factorio",
        "phenotype",
        "spotter-ai",
        "wildfire-smoke-impact-review"
    )
)

$ErrorActionPreference = "Stop"
$devRootFull = [System.IO.Path]::GetFullPath($DevRoot)
$configRoot = Join-Path $devRootFull "config"
$activeGenerationPath = Join-Path $configRoot "active-generation.json"
if ([string]::IsNullOrWhiteSpace($SpotterImplDir)) {
    if (-not (Test-Path -LiteralPath $activeGenerationPath -PathType Leaf)) {
        throw "Cannot resolve runtime paths because no active generation manifest exists at $activeGenerationPath."
    }
    $activeGeneration = Get-Content -Raw -LiteralPath $activeGenerationPath | ConvertFrom-Json
    $runtimeRoot = [System.IO.Path]::GetFullPath([string]$activeGeneration.runtime_root)
    $SpotterImplDir = Join-Path $runtimeRoot "agent-blueprints\spotter-ai\impl"
}
if ([string]::IsNullOrWhiteSpace($SpotterConfigPath)) {
    $SpotterConfigPath = Join-Path $configRoot "spotter-clio-config.yaml"
}
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
$gactHeaders = @{
    Origin = $webUrl
    "X-GACT-Version" = "0.3"
}
$gactResponse = Invoke-WebRequest `
    -Uri "$backendUrl/v1/capabilities" `
    -Headers $gactHeaders `
    -TimeoutSec 10
$gactCapabilities = $gactResponse.Content | ConvertFrom-Json
$corsPreflight = Invoke-WebRequest `
    -Uri "$backendUrl/v1/capabilities" `
    -Method Options `
    -Headers @{
        Origin = $webUrl
        "Access-Control-Request-Method" = "GET"
        "Access-Control-Request-Headers" = "x-gact-version"
    } `
    -TimeoutSec 10
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

$corsOrigin = [string]$gactResponse.Headers["Access-Control-Allow-Origin"]
if ($corsOrigin -ne $webUrl) {
    throw "GACT browser CORS mismatch: expected '$webUrl', got '$corsOrigin'."
}
$preflightOrigin = [string]$corsPreflight.Headers["Access-Control-Allow-Origin"]
if ($preflightOrigin -ne $webUrl) {
    throw "GACT browser preflight rejected '$webUrl'."
}
if ($gactCapabilities.contract_version -ne "0.3") {
    throw "GACT negotiation mismatch: expected '0.3', got '$($gactCapabilities.contract_version)'."
}
$campaignCapabilities = $gactCapabilities.capabilities
foreach ($capabilityName in @(
    "x_clio_message_delivery",
    "x_clio_pending_steers",
    "x_clio_queued_messages"
)) {
    if ($campaignCapabilities.$capabilityName -ne $true) {
        throw "GACT 0.3 capability '$capabilityName' is not enabled."
    }
}
if ($campaignCapabilities.x_clio_resources.enabled -ne $true) {
    throw "GACT 0.3 resource custody is not enabled."
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

$readyMcpServers = @()
$mcpServers = @()
if ($RequiredMcpNamespaces.Count -gt 0) {
    $mcpFailures = @()
    $mcpWarmupStarted = [DateTime]::UtcNow
    $mcpWarmupDeadline = $mcpWarmupStarted.AddSeconds($McpWarmupDeadlineSec)
    $mcpAttempt = 0
    do {
        $mcpAttempt++
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
        if ([DateTime]::UtcNow -lt $mcpWarmupDeadline) {
            Start-Sleep -Seconds 2
        }
    } while ([DateTime]::UtcNow -lt $mcpWarmupDeadline)

    if ($mcpFailures.Count -gt 0) {
        $mcpWarmupElapsed = [Math]::Round(
            ([DateTime]::UtcNow - $mcpWarmupStarted).TotalSeconds,
            1
        )
        throw "Required MCP namespaces did not become ready within ${mcpWarmupElapsed}s ($mcpAttempt attempts, deadline ${McpWarmupDeadlineSec}s): $($mcpFailures -join '; ')."
    }
    $readyMcpServers = @($RequiredMcpNamespaces)
}

$arcProbeScope = "clio-dev-preflight"
$arcProbeSentinel = "arc-probe-$([Guid]::NewGuid().ToString('N'))"
$arcProbeSessionId = $null
try {
    $arcProbeSession = Invoke-RestMethod `
        -Method Post `
        -Uri "$backendUrl/v1/sessions" `
        -ContentType "application/json" `
        -Body (@{
            workspace_id = "ws_default"
            title = "__CLIO dev ARC preflight__"
            approval_mode = "bypass"
            metadata = @{ preflight = $true }
        } | ConvertTo-Json -Depth 4) `
        -TimeoutSec 15
    $arcProbeSessionId = [string]$arcProbeSession.id
    if (-not $arcProbeSessionId) {
        throw "ARC probe could not create its disposable session."
    }

    $appendResult = Invoke-RestMethod `
        -Method Post `
        -Uri "$backendUrl/v1/sessions/$arcProbeSessionId/context/ops" `
        -ContentType "application/json" `
        -Body (@{
            op = "append"
            scope = $arcProbeScope
            kind = "user"
            content = @{ text = $arcProbeSentinel }
            token_count = 4
            trace_ref = "clio-dev-preflight"
        } | ConvertTo-Json -Depth 5) `
        -TimeoutSec 15
    $segmentId = [string]$appendResult.result.id
    if (-not $segmentId -or $appendResult.live_block_count -ne 1) {
        throw "ARC append did not return one live segment."
    }

    $state = Invoke-RestMethod `
        -Uri "$backendUrl/v1/sessions/$arcProbeSessionId/context/state?scope=$arcProbeScope" `
        -TimeoutSec 15
    $liveIds = @($state.segments | ForEach-Object { [string]$_.id })
    if ($segmentId -notin $liveIds -or -not ([string]$state.render_text).Contains($arcProbeSentinel)) {
        throw "ARC read did not return the segment written by the probe."
    }

    $deleteResult = Invoke-RestMethod `
        -Method Post `
        -Uri "$backendUrl/v1/sessions/$arcProbeSessionId/context/ops" `
        -ContentType "application/json" `
        -Body (@{
            op = "delete"
            scope = $arcProbeScope
            ids = @($segmentId)
        } | ConvertTo-Json -Depth 4) `
        -TimeoutSec 15
    if ($deleteResult.tombstoned_count -ne 1 -or $deleteResult.live_block_count -ne 0) {
        throw "ARC delete did not tombstone the disposable segment."
    }

    $stateAfterDelete = Invoke-RestMethod `
        -Uri "$backendUrl/v1/sessions/$arcProbeSessionId/context/state?scope=$arcProbeScope" `
        -TimeoutSec 15
    if (@($stateAfterDelete.segments).Count -ne 0 -or ([string]$stateAfterDelete.render_text).Contains($arcProbeSentinel)) {
        throw "ARC delete left the disposable segment visible."
    }
}
finally {
    if ($arcProbeSessionId) {
        $cleanupResponse = Invoke-WebRequest `
            -Method Delete `
            -Uri "$backendUrl/v1/sessions/$arcProbeSessionId" `
            -SkipHttpErrorCheck `
            -TimeoutSec 15
        if ($cleanupResponse.StatusCode -notin @(200, 204)) {
            throw "ARC probe cleanup failed with HTTP $($cleanupResponse.StatusCode)."
        }
    }
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
    arc_write_read_delete = "ready"
    warnings = $warnings
} | ConvertTo-Json -Depth 5
