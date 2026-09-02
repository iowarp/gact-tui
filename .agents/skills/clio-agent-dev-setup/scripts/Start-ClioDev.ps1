[CmdletBinding()]
param(
    [string]$BackendRepo = "D:\Libraries\Documents\projects\.codex-campaign-clio-agent",
    [string]$FrontendRepo = "D:\Libraries\Documents\projects\gact-tui-node-revamp",
    [string]$DocumentProcessorRepo = "D:\Libraries\Documents\projects\clio-web-search",
    [string]$DevRoot = "D:\Libraries\Documents\projects\clio_develop_workspace",
    [ValidateRange(1, 65535)]
    [int]$BackendPort = 8787,
    [ValidateRange(1, 65535)]
    [int]$WebPort = 5174,
    [ValidateRange(1, 65535)]
    [int]$DocumentProcessorPort = 8089,
    [string]$Provider = "codex",
    [string]$Model = "gpt-5.6-luna",
    [string]$PythonVersion = "3.12",
    [string]$CteFileCapacity = "8GB",
    [string]$CteRamCapacity = "1GB",
    [string]$ClioKitVersion = "2.10.6",
    [string]$SpotterImplDir = "",
    [string]$SpotterConfigPath = "",
    [switch]$FreshInstall,
    [switch]$PreserveState
)

$ErrorActionPreference = "Stop"
$deploymentStartedAt = [DateTimeOffset]::Now
$deploymentStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$deploymentStages = [System.Collections.Generic.List[object]]::new()
$deploymentStageName = $null
$deploymentStageStartedMs = 0L
$deploymentTimingWritten = $false
$startupProcessesOwned = $false
$skillRoot = Split-Path -Parent $PSScriptRoot
$stopScript = Join-Path $PSScriptRoot "Stop-ClioDev.ps1"
$resetScript = Join-Path $PSScriptRoot "Reset-ClioDev.ps1"
$containmentScript = Join-Path $PSScriptRoot "Test-ClioDevContainment.ps1"
$preflightScript = Join-Path $PSScriptRoot "Test-ClioDevPreflight.ps1"
$backendSource = [System.IO.Path]::GetFullPath($BackendRepo)
$frontendSource = [System.IO.Path]::GetFullPath($FrontendRepo)
$documentProcessorSource = [System.IO.Path]::GetFullPath($DocumentProcessorRepo)
$devRootFull = [System.IO.Path]::GetFullPath($DevRoot)
$configRoot = Join-Path $devRootFull "config"
$activeGenerationPath = Join-Path $configRoot "active-generation.json"
if ($FreshInstall -and $PreserveState) {
    throw "FreshInstall and PreserveState are mutually exclusive."
}
$reuseActiveGeneration = (-not $FreshInstall) -and (
    $PreserveState -or (Test-Path -LiteralPath $activeGenerationPath -PathType Leaf)
)
if ($reuseActiveGeneration) {
    if (-not (Test-Path -LiteralPath $activeGenerationPath -PathType Leaf)) {
        throw "Cannot preserve state because no active generation manifest exists at $activeGenerationPath."
    }
    $activeGeneration = Get-Content -Raw -LiteralPath $activeGenerationPath | ConvertFrom-Json
    $generationRoot = [System.IO.Path]::GetFullPath([string]$activeGeneration.generation_root)
    $generationId = [string]$activeGeneration.generation_id
}
else {
    $generationId = "$(Get-Date -Format 'yyyyMMdd-HHmmss')-$PID"
    $generationRoot = Join-Path $devRootFull "generations\$generationId"
}
$worktreeRoot = Join-Path $generationRoot "worktrees"
$backendRoot = Join-Path $worktreeRoot "clio-agent"
$frontendRoot = Join-Path $worktreeRoot "gact-tui"
$documentProcessorRoot = Join-Path $worktreeRoot "clio-web-search"
$runtimeRoot = Join-Path $generationRoot "runtime\clio-agent-dev"
$documentProcessorDataRoot = Join-Path $generationRoot "runtime\clio-web-search"
$logRoot = Join-Path $generationRoot "logs"
$webRoot = Join-Path $frontendRoot "web"
$workspaceRoot = Join-Path $generationRoot "workspaces"
$tempRoot = Join-Path $generationRoot "temp"
$cacheRoot = Join-Path $generationRoot "cache"
$sharedModelCacheRoot = Join-Path $devRootFull "cache\huggingface"
$toolRoot = Join-Path $generationRoot "tools"
$timingPath = Join-Path $configRoot "deploy-timing.json"

function Set-DeploymentStage {
    param([Parameter(Mandatory)][string]$Name)

    if ($null -ne $script:deploymentStageName) {
        $script:deploymentStages.Add([pscustomobject]@{
            name = $script:deploymentStageName
            elapsed_seconds = [Math]::Round(
                ($script:deploymentStopwatch.ElapsedMilliseconds - $script:deploymentStageStartedMs) / 1000,
                3
            )
        })
    }
    $script:deploymentStageName = $Name
    $script:deploymentStageStartedMs = $script:deploymentStopwatch.ElapsedMilliseconds
}

function Write-DeploymentTiming {
    param(
        [Parameter(Mandatory)][ValidateSet("ready", "failed")][string]$Status,
        [string]$ErrorMessage = ""
    )

    if ($script:deploymentTimingWritten) {
        return
    }
    $script:deploymentTimingWritten = $true
    if ($null -ne $script:deploymentStageName) {
        $script:deploymentStages.Add([pscustomobject]@{
            name = $script:deploymentStageName
            elapsed_seconds = [Math]::Round(
                ($script:deploymentStopwatch.ElapsedMilliseconds - $script:deploymentStageStartedMs) / 1000,
                3
            )
        })
    }
    $script:deploymentStopwatch.Stop()
    try {
        New-Item -ItemType Directory -Force -Path $configRoot | Out-Null
        [pscustomobject]@{
            status = $Status
            started_at = $script:deploymentStartedAt.ToString("o")
            finished_at = [DateTimeOffset]::Now.ToString("o")
            elapsed_seconds = [Math]::Round($script:deploymentStopwatch.Elapsed.TotalSeconds, 3)
            stages = $script:deploymentStages
            error = if ($ErrorMessage) { $ErrorMessage } else { $null }
        } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $timingPath -Encoding utf8
    }
    catch {
        Write-Warning "Could not write deployment timing to ${timingPath}: $($_.Exception.Message)"
    }
}

trap {
    $failure = $_
    if ($script:startupProcessesOwned) {
        try {
            & $stopScript `
                -DevRoot $devRootFull `
                -BackendPort $BackendPort `
                -WebPort $WebPort `
                -DocumentProcessorPort $DocumentProcessorPort `
                -PreserveState
        }
        catch {
            Write-Warning "Could not completely clean the failed startup: $($_.Exception.Message)"
        }
    }
    Write-DeploymentTiming -Status "failed" -ErrorMessage $failure.Exception.Message
    Write-Error -ErrorRecord $failure
    exit 1
}

Set-DeploymentStage -Name "validate_inputs"

if (-not $SpotterImplDir) {
    $SpotterImplDir = Join-Path $runtimeRoot "agent-blueprints\spotter-ai\impl"
}
if (-not $SpotterConfigPath) {
    $SpotterConfigPath = Join-Path $configRoot "spotter-clio-config.yaml"
}
$spotterImplRoot = [System.IO.Path]::GetFullPath($SpotterImplDir)
$spotterConfigFull = [System.IO.Path]::GetFullPath($SpotterConfigPath)

foreach ($requiredPath in @($backendSource, $frontendSource, $documentProcessorSource, $skillRoot)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required path does not exist: $requiredPath"
    }
}

if ($reuseActiveGeneration) {
    Set-DeploymentStage -Name "stop_previous_runtime"
    & $stopScript `
        -DevRoot $devRootFull `
        -BackendPort $BackendPort `
        -WebPort $WebPort `
        -DocumentProcessorPort $DocumentProcessorPort `
        -PreserveState

    foreach ($requiredRuntimePath in @(
        $backendRoot,
        $frontendRoot,
        $documentProcessorRoot,
        $webRoot
    )) {
        if (-not (Test-Path -LiteralPath $requiredRuntimePath)) {
            throw "Preserved runtime is incomplete: $requiredRuntimePath"
        }
    }

    Set-DeploymentStage -Name "sync_preserved_committed_heads"
    $sourceSyncTemp = Join-Path $tempRoot "source-sync"
    New-Item -ItemType Directory -Force -Path $sourceSyncTemp | Out-Null
    [Environment]::SetEnvironmentVariable("TEMP", $sourceSyncTemp, "Process")
    [Environment]::SetEnvironmentVariable("TMP", $sourceSyncTemp, "Process")
    $git = (Get-Command git -ErrorAction Stop).Source
    $backendHead = (& $git -C $backendSource rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $backendHead) {
        throw "Could not resolve the backend source HEAD at $backendSource."
    }
    $frontendHead = (& $git -C $frontendSource rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $frontendHead) {
        throw "Could not resolve the frontend source HEAD at $frontendSource."
    }
    $documentProcessorHead = (& $git -C $documentProcessorSource rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $documentProcessorHead) {
        throw "Could not resolve the document processor source HEAD at $documentProcessorSource."
    }
    foreach ($runtimeSource in @(
        [pscustomobject]@{ Name = "backend"; Source = $backendSource; Runtime = $backendRoot; Head = $backendHead },
        [pscustomobject]@{ Name = "frontend"; Source = $frontendSource; Runtime = $frontendRoot; Head = $frontendHead },
        [pscustomobject]@{
            Name = "document processor"
            Source = $documentProcessorSource
            Runtime = $documentProcessorRoot
            Head = $documentProcessorHead
        }
    )) {
        $runtimeDirty = @(& $git -C $runtimeSource.Runtime status --porcelain).Count -gt 0
        if ($runtimeDirty) {
            throw "Preserved $($runtimeSource.Name) runtime clone is dirty: $($runtimeSource.Runtime)"
        }
        & $git -C $runtimeSource.Runtime fetch --force $runtimeSource.Source $runtimeSource.Head
        if ($LASTEXITCODE -ne 0) {
            throw "Could not fetch $($runtimeSource.Name) commit $($runtimeSource.Head)."
        }
        & $git -C $runtimeSource.Runtime checkout --detach $runtimeSource.Head
        if ($LASTEXITCODE -ne 0) {
            throw "Could not check out $($runtimeSource.Name) commit $($runtimeSource.Head)."
        }
        & $git -C $runtimeSource.Runtime submodule update --init --recursive
        if ($LASTEXITCODE -ne 0) {
            throw "Could not synchronize $($runtimeSource.Name) submodules at $($runtimeSource.Head)."
        }
    }

    $sourceHeadsPath = Join-Path $configRoot "source-heads.json"
    $sourceHeads = if (Test-Path -LiteralPath $sourceHeadsPath -PathType Leaf) {
        Get-Content -Raw -LiteralPath $sourceHeadsPath | ConvertFrom-Json
    }
    else {
        [pscustomobject]@{}
    }
    $backendDirty = @(& $git -C $backendSource status --porcelain).Count -gt 0
    $frontendDirty = @(& $git -C $frontendSource status --porcelain).Count -gt 0
    $documentProcessorDirty = @(
        & $git -C $documentProcessorSource status --porcelain
    ).Count -gt 0
    foreach ($entry in @{
        created_at = [DateTime]::UtcNow.ToString("o")
        backend_source = $backendSource
        backend_head = $backendHead
        backend_source_dirty = $backendDirty
        frontend_source = $frontendSource
        frontend_head = $frontendHead
        frontend_source_dirty = $frontendDirty
        document_processor_source = $documentProcessorSource
        document_processor_head = $documentProcessorHead
        document_processor_source_dirty = $documentProcessorDirty
    }.GetEnumerator()) {
        $sourceHeads | Add-Member -NotePropertyName $entry.Key -NotePropertyValue $entry.Value -Force
    }
    $sourceHeads | ConvertTo-Json | Set-Content -LiteralPath $sourceHeadsPath -Encoding utf8
}
else {
    Set-DeploymentStage -Name "reset_owned_root"
    & $resetScript `
        -DevRoot $devRootFull `
        -BackendPort $BackendPort `
        -WebPort $WebPort `
        -DocumentProcessorPort $DocumentProcessorPort `
        -RecreateRoot `
        -Confirm:$false

    New-Item -ItemType Directory -Force -Path $configRoot, $generationRoot | Out-Null
    [pscustomobject]@{
        generation_id = $generationId
        generation_root = $generationRoot
        runtime_root = $runtimeRoot
        created_at = [DateTimeOffset]::Now.ToString("o")
        status = "starting"
    } | ConvertTo-Json | Set-Content -LiteralPath $activeGenerationPath -Encoding utf8

    Set-DeploymentStage -Name "clone_committed_heads"
    $cloneTempRoot = Join-Path $tempRoot "source-clone"
    New-Item -ItemType Directory -Force -Path $worktreeRoot, $cloneTempRoot | Out-Null
    $originalCloneTemp = [Environment]::GetEnvironmentVariable("TEMP", "Process")
    $originalCloneTmp = [Environment]::GetEnvironmentVariable("TMP", "Process")
    [Environment]::SetEnvironmentVariable("TEMP", $cloneTempRoot, "Process")
    [Environment]::SetEnvironmentVariable("TMP", $cloneTempRoot, "Process")
    try {
        $git = (Get-Command git -ErrorAction Stop).Source
        $backendHead = (& $git -C $backendSource rev-parse HEAD).Trim()
        if ($LASTEXITCODE -ne 0 -or -not $backendHead) {
            throw "Could not resolve the backend source HEAD at $backendSource."
        }
        $frontendHead = (& $git -C $frontendSource rev-parse HEAD).Trim()
        if ($LASTEXITCODE -ne 0 -or -not $frontendHead) {
            throw "Could not resolve the frontend source HEAD at $frontendSource."
        }
        $documentProcessorHead = (& $git -C $documentProcessorSource rev-parse HEAD).Trim()
        if ($LASTEXITCODE -ne 0 -or -not $documentProcessorHead) {
            throw "Could not resolve the document processor source HEAD at $documentProcessorSource."
        }

        & $git clone --no-local --no-checkout $backendSource $backendRoot
        if ($LASTEXITCODE -ne 0) {
            throw "Could not clone the backend source into the owned development root."
        }
        & $git -C $backendRoot checkout --detach $backendHead
        if ($LASTEXITCODE -ne 0) {
            throw "Could not check out backend commit $backendHead."
        }
        & $git -C $backendRoot submodule update --init --recursive
        if ($LASTEXITCODE -ne 0) {
            throw "Could not initialize backend submodules at $backendHead."
        }

        & $git clone --no-local --no-checkout $frontendSource $frontendRoot
        if ($LASTEXITCODE -ne 0) {
            throw "Could not clone the frontend source into the owned development root."
        }
        & $git -C $frontendRoot checkout --detach $frontendHead
        if ($LASTEXITCODE -ne 0) {
            throw "Could not check out frontend commit $frontendHead."
        }
        & $git -C $frontendRoot submodule update --init --recursive
        if ($LASTEXITCODE -ne 0) {
            throw "Could not initialize frontend submodules at $frontendHead."
        }

        & $git clone --no-local --no-checkout $documentProcessorSource $documentProcessorRoot
        if ($LASTEXITCODE -ne 0) {
            throw "Could not clone the document processor source into the owned development root."
        }
        & $git -C $documentProcessorRoot checkout --detach $documentProcessorHead
        if ($LASTEXITCODE -ne 0) {
            throw "Could not check out document processor commit $documentProcessorHead."
        }
        & $git -C $documentProcessorRoot submodule update --init --recursive
        if ($LASTEXITCODE -ne 0) {
            throw "Could not initialize document processor submodules at $documentProcessorHead."
        }

        $backendDirty = @(& $git -C $backendSource status --porcelain).Count -gt 0
        $frontendDirty = @(& $git -C $frontendSource status --porcelain).Count -gt 0
        $documentProcessorDirty = @(
            & $git -C $documentProcessorSource status --porcelain
        ).Count -gt 0
        if ($backendDirty -or $frontendDirty -or $documentProcessorDirty) {
            Write-Warning (
                "Runtime clones use committed HEADs only. Uncommitted source changes were ignored: " +
                "backend_dirty=$backendDirty, frontend_dirty=$frontendDirty, " +
                "document_processor_dirty=$documentProcessorDirty."
            )
        }
        New-Item -ItemType Directory -Force -Path $configRoot | Out-Null
        [pscustomobject]@{
            created_at = [DateTime]::UtcNow.ToString("o")
            backend_source = $backendSource
            backend_head = $backendHead
            backend_source_dirty = $backendDirty
            frontend_source = $frontendSource
            frontend_head = $frontendHead
            frontend_source_dirty = $frontendDirty
            document_processor_source = $documentProcessorSource
            document_processor_head = $documentProcessorHead
            document_processor_source_dirty = $documentProcessorDirty
        } | ConvertTo-Json | Set-Content `
            -LiteralPath (Join-Path $configRoot "source-heads.json") `
            -Encoding utf8
    }
    finally {
        [Environment]::SetEnvironmentVariable("TEMP", $originalCloneTemp, "Process")
        [Environment]::SetEnvironmentVariable("TMP", $originalCloneTmp, "Process")
    }
}

Set-DeploymentStage -Name "containment"
$containedPaths = @(
    $backendRoot,
    $frontendRoot,
    $documentProcessorRoot,
    $runtimeRoot,
    $documentProcessorDataRoot,
    $workspaceRoot,
    $logRoot,
    $tempRoot,
    $cacheRoot,
    $sharedModelCacheRoot,
    $toolRoot,
    $configRoot,
    $spotterImplRoot,
    $spotterConfigFull
)
& $containmentScript -DevRoot $devRootFull -ExpectedPaths $containedPaths

$containedEnvironment = @{
    TEMP = $tempRoot
    TMP = $tempRoot
    TMPDIR = $tempRoot
    UV_CACHE_DIR = Join-Path $cacheRoot "uv"
    UV_TOOL_DIR = Join-Path $toolRoot "uv"
    UV_TOOL_BIN_DIR = Join-Path $toolRoot "bin"
    UV_PYTHON_INSTALL_DIR = Join-Path $toolRoot "uv-python"
    PNPM_HOME = Join-Path $toolRoot "pnpm"
    COREPACK_HOME = Join-Path $toolRoot "corepack"
    npm_config_cache = Join-Path $cacheRoot "npm"
    XDG_CACHE_HOME = Join-Path $cacheRoot "xdg"
    MPLCONFIGDIR = Join-Path $cacheRoot "matplotlib"
    PIP_CACHE_DIR = Join-Path $cacheRoot "pip"
    PLAYWRIGHT_BROWSERS_PATH = Join-Path $cacheRoot "playwright"
    CARGO_HOME = Join-Path $toolRoot "cargo"
    CARGO_TARGET_DIR = Join-Path $cacheRoot "cargo-target"
    HF_HOME = $sharedModelCacheRoot
    HF_HUB_CACHE = Join-Path $sharedModelCacheRoot "hub"
    HF_XET_CACHE = Join-Path $sharedModelCacheRoot "xet"
}
New-Item -ItemType Directory -Force -Path @(
    $runtimeRoot,
    $documentProcessorDataRoot,
    $logRoot,
    $workspaceRoot,
    $tempRoot,
    $cacheRoot,
    $sharedModelCacheRoot,
    $toolRoot,
    $configRoot
) | Out-Null
$originalContainedEnvironment = @{}
foreach ($name in $containedEnvironment.Keys) {
    $originalContainedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    [Environment]::SetEnvironmentVariable($name, $containedEnvironment[$name], "Process")
}

try {
Set-DeploymentStage -Name "backend_dependencies"
$uv = (Get-Command uv -ErrorAction Stop).Source
$backendSyncArgs = @(
    "sync",
    "--frozen",
    "--python", $PythonVersion,
    "--project", $backendRoot
)
if ($Provider -eq "claude_code") {
    $backendSyncArgs += @("--extra", "claude-code")
}
& $uv @backendSyncArgs
if ($LASTEXITCODE -ne 0) {
    throw "The backend environment could not be synchronized from its pinned uv.lock."
}
& $uv run --frozen --no-sync --project $backendRoot python -c "import iowarp_core, psutil; from clio_schemas import A2UIClientActionMessage"
if ($LASTEXITCODE -ne 0) {
    throw "The synchronized backend environment is missing CTE, process-lifecycle, or current schema imports."
}

Set-DeploymentStage -Name "document_processor_dependencies"
& $uv sync `
    --frozen `
    --no-dev `
    --python $PythonVersion `
    --project $documentProcessorRoot
if ($LASTEXITCODE -ne 0) {
    throw "The document processor environment could not be synchronized from its pinned uv.lock."
}
& $uv run `
    --frozen `
    --no-sync `
    --project $documentProcessorRoot `
    python -c "from clio_web_search.main import app; from docling.document_converter import DocumentConverter"
if ($LASTEXITCODE -ne 0) {
    throw "The synchronized document processor environment is missing its service or Docling imports."
}

Set-DeploymentStage -Name "runtime_tools"
$uvToolRoot = $containedEnvironment.UV_TOOL_DIR
$uvToolBin = $containedEnvironment.UV_TOOL_BIN_DIR
& $uv tool install --python $PythonVersion "clio-kit==$ClioKitVersion"
if ($LASTEXITCODE -ne 0) {
    throw "The dedicated CLIO runtime could not install clio-kit==$ClioKitVersion."
}
$clioKitCommand = Join-Path $uvToolBin "clio-kit.exe"
if (-not (Test-Path -LiteralPath $clioKitCommand -PathType Leaf)) {
    throw "The dedicated clio-kit launcher was not created at $clioKitCommand."
}
$spotterConfig = @(
    "# Generated by clio-agent-dev-setup for this dedicated runtime.",
    'provenance.agentic.providers: ["jsonl"]',
    'provenance.agentic.query_default: jsonl',
    "provenance.agentic.jsonl.path: $(Join-Path $runtimeRoot 'semantic_traces')",
    'provenance.artifacts.provider: native',
    "provenance.artifacts.native.workspace_root: $workspaceRoot"
)
$spotterConfig | Set-Content -LiteralPath $spotterConfigFull -Encoding utf8
$backendStdout = Join-Path $logRoot "clio-agent-$BackendPort.stdout.log"
$backendStderr = Join-Path $logRoot "clio-agent-$BackendPort.stderr.log"
$documentProcessorStdout = Join-Path $logRoot "clio-web-search-$DocumentProcessorPort.stdout.log"
$documentProcessorStderr = Join-Path $logRoot "clio-web-search-$DocumentProcessorPort.stderr.log"
$webStdout = Join-Path $logRoot "gact-web-$WebPort.stdout.log"
$webStderr = Join-Path $logRoot "gact-web-$WebPort.stderr.log"

Set-DeploymentStage -Name "document_processor_start"
$documentProcessorEnvironment = @{
    CLIO_WEB_SEARCH_HOST = "127.0.0.1"
    CLIO_WEB_SEARCH_PORT = "$DocumentProcessorPort"
    CLIO_WEB_SEARCH_DATA_DIR = $documentProcessorDataRoot
}
$originalDocumentProcessorEnvironment = @{}
foreach ($name in $documentProcessorEnvironment.Keys) {
    $originalDocumentProcessorEnvironment[$name] = [Environment]::GetEnvironmentVariable(
        $name,
        "Process"
    )
    [Environment]::SetEnvironmentVariable(
        $name,
        $documentProcessorEnvironment[$name],
        "Process"
    )
}
try {
    $documentProcessorLauncher = Join-Path `
        $documentProcessorRoot `
        ".venv\Scripts\clio-web-search.exe"
    if (-not (Test-Path -LiteralPath $documentProcessorLauncher -PathType Leaf)) {
        throw "The synchronized document processor launcher is missing: $documentProcessorLauncher"
    }
    $documentProcessorProcess = Start-Process `
        -FilePath $documentProcessorLauncher `
        -WorkingDirectory $documentProcessorRoot `
        -RedirectStandardOutput $documentProcessorStdout `
        -RedirectStandardError $documentProcessorStderr `
        -WindowStyle Hidden `
        -PassThru
    $script:startupProcessesOwned = $true
}
finally {
    foreach ($name in $originalDocumentProcessorEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable(
            $name,
            $originalDocumentProcessorEnvironment[$name],
            "Process"
        )
    }
}

Set-DeploymentStage -Name "document_processor_readiness"
$documentProcessorReadyUri = "http://127.0.0.1:$DocumentProcessorPort/readyz"
$documentProcessorDeadline = [DateTime]::UtcNow.AddSeconds(600)
do {
    if ($documentProcessorProcess.HasExited) {
        throw "The document processor exited during startup. See $documentProcessorStderr"
    }
    try {
        $documentProcessorResponse = Invoke-WebRequest `
            -Uri $documentProcessorReadyUri `
            -SkipHttpErrorCheck `
            -TimeoutSec 5
        $documentProcessorHealth = $documentProcessorResponse.Content | ConvertFrom-Json
    }
    catch {
        $documentProcessorHealth = $null
    }
    if ($null -ne $documentProcessorHealth -and $documentProcessorHealth.checks.docling -eq "ready") {
        break
    }
    Start-Sleep -Milliseconds 500
} while ([DateTime]::UtcNow -lt $documentProcessorDeadline)

if ($null -eq $documentProcessorHealth -or $documentProcessorHealth.checks.docling -ne "ready") {
    Stop-Process -Id $documentProcessorProcess.Id -Force -ErrorAction SilentlyContinue
    throw "The document processor's Docling worker did not become ready within 600 seconds."
}

$runtimeEnvironment = @{
    CLIO_USER_DIR = $runtimeRoot
    # Keep Windows' canonical per-user blueprint path inside the owned generation.
    # Marketplace launchers that use ${LOCALAPPDATA}/clio-agent/agent-blueprints
    # must resolve to the same contained install as CLIO_USER_DIR.
    LOCALAPPDATA = Split-Path -Parent $runtimeRoot
    CLIO_RUNTIME_STATE_DIR = Join-Path $runtimeRoot "clio-core-runtime"
    CLIO_SESSIONS_PATH = Join-Path $runtimeRoot "sessions.json"
    CLIO_ARC_STORE = "cte"
    CLIO_ARC_CTE_DIR = Join-Path $runtimeRoot "cte"
    CLIO_ARC_CTE_FILE_CAPACITY = $CteFileCapacity
    CLIO_ARC_CTE_RAM_CAPACITY = $CteRamCapacity
    CLIO_LM_PROVIDER = $Provider
    CLIO_LM_MODEL = $Model
    CLIO_WORKSPACE_ROOT = $workspaceRoot
    CLIO_GACT_CORS_ORIGINS = "http://127.0.0.1:$WebPort,http://localhost:$WebPort"
    CLIO_DOCUMENT_PROCESSOR_URL = "http://127.0.0.1:$DocumentProcessorPort"
    PATH = "$uvToolBin;$([Environment]::GetEnvironmentVariable('PATH', 'Process'))"
    SPOTTER_IMPL_DIR = $spotterImplRoot
    SPOTTER_CLIO_CONFIG = $spotterConfigFull
}
if ($Provider -eq "codex") {
    $runtimeEnvironment.CLIO_CODEX_TRANSPORT = "app_server"
}
elseif ($Provider -eq "claude_code") {
    $runtimeEnvironment.CLIO_CLAUDE_CODE_TRANSPORT = "sdk"
}
$originalEnvironment = @{}
foreach ($name in $runtimeEnvironment.Keys) {
    $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    [Environment]::SetEnvironmentVariable($name, $runtimeEnvironment[$name], "Process")
}

try {
    Set-DeploymentStage -Name "backend_start"
    $backendPython = Join-Path $backendRoot ".venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $backendPython -PathType Leaf)) {
        throw "The synchronized backend Python is missing: $backendPython"
    }
    $backendProcess = Start-Process -FilePath $backendPython -WorkingDirectory $backendRoot -ArgumentList @(
        "-m", "clio_agent.ui.cli", "serve",
        "--host", "127.0.0.1",
        "--port", "$BackendPort"
    ) -RedirectStandardOutput $backendStdout -RedirectStandardError $backendStderr -WindowStyle Hidden -PassThru
}
finally {
    foreach ($name in $originalEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], "Process")
    }
}

Set-DeploymentStage -Name "backend_readiness"
$healthUri = "http://127.0.0.1:$BackendPort/v1/health"
$deadline = [DateTime]::UtcNow.AddSeconds(120)
do {
    if ($backendProcess.HasExited) {
        throw "CLIO backend exited during startup. See $backendStderr"
    }
    try {
        $health = Invoke-RestMethod -Uri $healthUri -TimeoutSec 3
    }
    catch {
        $health = $null
    }
    if ($null -ne $health -and $health.overall_status -eq "ready") {
        break
    }
    Start-Sleep -Milliseconds 500
} while ([DateTime]::UtcNow -lt $deadline)

if ($null -eq $health -or $health.overall_status -ne "ready") {
    Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    throw "CLIO backend did not become ready within 120 seconds."
}

# The committed CLIO config file deliberately outranks environment variables.
# A preserved runtime may therefore boot with a stale file-backed provider even
# though CLIO_LM_PROVIDER/CLIO_LM_MODEL name the requested qualification route.
# Reconcile through the supported runtime API so app.state.agent, the provider
# profile store, the catalog, and the UI all observe one effective selection.
Set-DeploymentStage -Name "provider_reconciliation"
$providerUri = "http://127.0.0.1:$BackendPort/v1/providers/lm"
$providerInfo = Invoke-RestMethod -Uri $providerUri -TimeoutSec 20
$expectedTransport = if ($Provider -eq "codex") {
    "app_server"
}
elseif ($Provider -eq "claude_code") {
    "sdk"
}
else {
    ""
}
$providerNeedsApply = (
    -not $providerInfo.configured -or
    $providerInfo.provider -ne $Provider -or
    $providerInfo.model -ne $Model -or
    ($expectedTransport -and $providerInfo.transport -ne $expectedTransport)
)
if ($providerNeedsApply) {
    $preset = @($providerInfo.presets | Where-Object { $_.id -eq $Provider }) |
        Select-Object -First 1
    $apiBase = if ($null -ne $preset -and -not [string]::IsNullOrWhiteSpace([string]$preset.api_base)) {
        [string]$preset.api_base
    }
    else {
        [string]$providerInfo.api_base
    }
    $providerRequest = @{
        provider = $Provider
        api_base = $apiBase
        model = $Model
    }
    if ($expectedTransport) {
        $providerRequest.transport = $expectedTransport
    }
    $providerInfo = Invoke-RestMethod `
        -Uri $providerUri `
        -Method Put `
        -ContentType "application/json" `
        -Body ($providerRequest | ConvertTo-Json) `
        -TimeoutSec 300
    if ($providerInfo.state -eq "configuring") {
        $providerInfo = Invoke-RestMethod `
            -Uri "$providerUri/wait?timeout=300" `
            -TimeoutSec 320
    }
}
if ($providerInfo.state -eq "error") {
    throw "Provider reconciliation failed: $($providerInfo.error) $($providerInfo.status_message)"
}
if (-not $providerInfo.configured) {
    throw "Provider reconciliation did not produce a configured agent."
}
if ($providerInfo.provider -ne $Provider -or $providerInfo.model -ne $Model) {
    throw "Provider reconciliation mismatch: expected '$Provider/$Model', got '$($providerInfo.provider)/$($providerInfo.model)'."
}
if ($expectedTransport -and $providerInfo.transport -ne $expectedTransport) {
    throw "Provider reconciliation transport mismatch: expected '$expectedTransport', got '$($providerInfo.transport)'."
}

Set-DeploymentStage -Name "frontend_dependencies"
$pnpm = (Get-Command pnpm -ErrorAction Stop).Source
& $pnpm `
    --dir $frontendRoot `
    install `
    --frozen-lockfile `
    --store-dir (Join-Path $cacheRoot "pnpm-store")
if ($LASTEXITCODE -ne 0) {
    throw "The frontend dependencies could not be reproduced from pnpm-lock.yaml."
}

$viteScript = Join-Path $webRoot "node_modules\vite\bin\vite.js"
if (-not (Test-Path -LiteralPath $viteScript)) {
    throw "Vite is not installed at $viteScript. Run pnpm install in the repository first."
}

Set-DeploymentStage -Name "web_start"
$node = (Get-Command node -ErrorAction Stop).Source
$webProcess = Start-Process -FilePath $node -WorkingDirectory $webRoot -ArgumentList @(
    $viteScript,
    "--force",
    "--host", "127.0.0.1",
    "--port", "$WebPort"
) -RedirectStandardOutput $webStdout -RedirectStandardError $webStderr -WindowStyle Hidden -PassThru

Set-DeploymentStage -Name "web_readiness"
$webDeadline = [DateTime]::UtcNow.AddSeconds(60)
do {
    if ($webProcess.HasExited) {
        throw "CLIO web exited during startup. See $webStderr"
    }
    try {
        $webResponse = Invoke-WebRequest -Uri "http://127.0.0.1:$WebPort/" -TimeoutSec 3
    }
    catch {
        $webResponse = $null
    }
    if ($null -ne $webResponse -and $webResponse.StatusCode -eq 200) {
        break
    }
    Start-Sleep -Milliseconds 300
} while ([DateTime]::UtcNow -lt $webDeadline)

if ($null -eq $webResponse -or $webResponse.StatusCode -ne 200) {
    & $stopScript `
        -DevRoot $devRootFull `
        -BackendPort $BackendPort `
        -WebPort $WebPort `
        -DocumentProcessorPort $DocumentProcessorPort
    throw "CLIO web did not become ready within 60 seconds."
}

Set-DeploymentStage -Name "record_processes"
$backendListenerPid = @(
    Get-NetTCPConnection -State Listen -LocalPort $BackendPort -ErrorAction Stop |
        Select-Object -ExpandProperty OwningProcess -Unique
)
$webListenerPid = @(
    Get-NetTCPConnection -State Listen -LocalPort $WebPort -ErrorAction Stop |
        Select-Object -ExpandProperty OwningProcess -Unique
)
$documentProcessorListenerPid = @(
    Get-NetTCPConnection -State Listen -LocalPort $DocumentProcessorPort -ErrorAction Stop |
        Select-Object -ExpandProperty OwningProcess -Unique
)
$cteListenerPid = @(
    Get-NetTCPConnection -State Listen -LocalPort 9413 -ErrorAction Stop |
        Select-Object -ExpandProperty OwningProcess -Unique
)
if (
    $backendListenerPid.Count -ne 1 -or
    $webListenerPid.Count -ne 1 -or
    $documentProcessorListenerPid.Count -ne 1 -or
    $cteListenerPid.Count -ne 1
) {
    throw "Could not record exactly one backend, web, document processor, and CTE listener."
}
@{
    backend_pid = [int]$backendListenerPid[0]
    web_pid = [int]$webListenerPid[0]
    document_processor_pid = [int]$documentProcessorListenerPid[0]
    cte_pid = [int]$cteListenerPid[0]
    backend_launcher_pid = $backendProcess.Id
    web_launcher_pid = $webProcess.Id
    document_processor_launcher_pid = $documentProcessorProcess.Id
    backend_port = $BackendPort
    web_port = $WebPort
    document_processor_port = $DocumentProcessorPort
    python_version = $PythonVersion
    started_at = [DateTime]::UtcNow.ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeRoot "dev-processes.json")

Set-DeploymentStage -Name "live_preflight"
& $preflightScript `
    -BackendPort $BackendPort `
    -WebPort $WebPort `
    -DocumentProcessorPort $DocumentProcessorPort `
    -ExpectedProvider $Provider `
    -ExpectedModel $Model `
    -ExpectedTransport $expectedTransport `
    -SpotterImplDir $spotterImplRoot `
    -SpotterConfigPath $spotterConfigFull
[pscustomobject]@{
    generation_id = $generationId
    generation_root = $generationRoot
    runtime_root = $runtimeRoot
    created_at = if ($reuseActiveGeneration) { $activeGeneration.created_at } else { $deploymentStartedAt.ToString("o") }
    status = "ready"
} | ConvertTo-Json | Set-Content -LiteralPath $activeGenerationPath -Encoding utf8
Write-DeploymentTiming -Status "ready"
}
finally {
    foreach ($name in $originalContainedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable(
            $name,
            $originalContainedEnvironment[$name],
            "Process"
        )
    }
}
