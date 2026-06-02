#requires -Version 5.1
<#
.SYNOPSIS
  Build the embedded clio-agent runtime for the BUNDLED CLIO Desktop
  installer variant (Windows).

.DESCRIPTION
  Creates a RELOCATABLE Python virtual environment under
  apps/desktop/src-tauri/clio-runtime/.venv with clio-agent installed
  from git (no extras). Tauri's bundle.resources packs the whole
  clio-runtime/ tree into the installer; the sidecar-launcher resolves
  it at runtime relative to its own executable (priority 0), so the
  bundled app works fully offline with no system clio-agent install.

  Heavy optional dependencies are deliberately excluded by installing
  WITHOUT extras:
    - codex_cli_bin (~243 MB)  -- [codex] extra (openai-codex git dep)
    - scipy (~100 MB), numpy   -- [optimizers] extra
    - mypy / pytest            -- [dev] extra
  Base deps that DO ship (required by clio_agent.gact.app at runtime):
    pyarrow (~82 MB), matplotlib (~23 MB), h5py, litellm, fastapi,
    uvicorn, sse-starlette, dspy, fastmcp, ...

  After install the tree is pruned (__pycache__, *.pyc, in-package
  tests/, *.dist-info/RECORD) and a `--help` smoke is run.

.PARAMETER Ref
  clio-agent git ref to install. Defaults to $env:CLIO_REF or "develop".

.PARAMETER Force
  Remove an existing clio-runtime/ before building.
#>
[CmdletBinding()]
param(
  [string] $Ref = $(if ($env:CLIO_REF) { $env:CLIO_REF } else { 'develop' }),
  [switch] $Force
)

$ErrorActionPreference = 'Stop'

function Get-DirSizeMB([string] $path) {
  if (-not (Test-Path $path)) { return 0 }
  $sum = (Get-ChildItem -LiteralPath $path -Recurse -File -ErrorAction SilentlyContinue |
            Measure-Object -Property Length -Sum).Sum
  if (-not $sum) { return 0 }
  return [math]::Round($sum / 1MB, 1)
}

# Invoke-Native runs a native executable, streaming both stdout and
# stderr to the console, and throws only when the process exits non-zero.
# Windows PowerShell 5.1 treats a native command's stderr as a
# terminating error under $ErrorActionPreference='Stop' (uv writes
# normal progress like "Using CPython 3.12.0" to stderr), so we drop to
# 'Continue' for the call and gate purely on $LASTEXITCODE.
function Invoke-Native {
  param([Parameter(Mandatory)][string] $Exe, [string[]] $Args)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Exe @Args 2>&1 | ForEach-Object { "$_" }
  } finally {
    $ErrorActionPreference = $prev
  }
  if ($LASTEXITCODE -ne 0) {
    throw "$Exe $($Args -join ' ') failed (exit $LASTEXITCODE)"
  }
}

# --- locate paths -----------------------------------------------------
$scriptDir = $PSScriptRoot
$desktop   = (Resolve-Path (Join-Path $scriptDir '..')).Path
$srcTauri  = Join-Path $desktop 'src-tauri'
$target    = Join-Path $srcTauri 'clio-runtime'
$venv      = Join-Path $target '.venv'
$venvPy    = Join-Path $venv 'Scripts\python.exe'
$gactExe   = Join-Path $venv 'Scripts\clio-agent-gact.exe'
$repoUrl   = 'git+https://github.com/iowarp/clio-agent.git'

# --- preconditions ----------------------------------------------------
$uv = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uv) {
  Write-Error @"
build-clio-runtime: 'uv' is required but not found on PATH.
Install it from https://docs.astral.sh/uv/ (e.g. `irm https://astral.sh/uv/install.ps1 | iex`)
then re-run. uv builds the relocatable Python env that ships in the
bundled installer.
"@
  exit 1
}
$uvVer = (& $uv.Source --version) 2>$null
Write-Host "[build-clio-runtime] uv: $($uv.Source) ($uvVer)"

if (Test-Path $target) {
  if ($Force) {
    Write-Host "[build-clio-runtime] removing existing $target (--Force)"
    Remove-Item -LiteralPath $target -Recurse -Force
  } else {
    Write-Host "[build-clio-runtime] removing stale $target before rebuild"
    Remove-Item -LiteralPath $target -Recurse -Force
  }
}
New-Item -ItemType Directory -Path $target | Out-Null

# --- create relocatable venv -----------------------------------------
Write-Host "[build-clio-runtime] creating relocatable venv (python 3.12) at $venv"
Invoke-Native -Exe $uv.Source -Args @('venv', '--relocatable', '--python', '3.12', $venv)

# --- install clio-agent (NO extras) ----------------------------------
$spec = "clio-agent @ $repoUrl@$Ref"
Write-Host "[build-clio-runtime] installing: $spec (no extras)"
Invoke-Native -Exe $uv.Source -Args @('pip', 'install', '--python', $venvPy, $spec)

$sizeBefore = Get-DirSizeMB $target
Write-Host "[build-clio-runtime] size before prune: $sizeBefore MB"

# --- prune ------------------------------------------------------------
$sitePkgs = Join-Path $venv 'Lib\site-packages'

# 1. __pycache__ directories + loose *.pyc
Get-ChildItem -LiteralPath $venv -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
Get-ChildItem -LiteralPath $venv -Recurse -File -Filter '*.pyc' -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }

# 2. in-package tests/ directories (NOT clio_agent's own -- it ships
#    none in the wheel; this targets vendored test trees in deps)
if (Test-Path $sitePkgs) {
  Get-ChildItem -LiteralPath $sitePkgs -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    foreach ($t in @('tests', 'test')) {
      $td = Join-Path $_.FullName $t
      if (Test-Path $td) { Remove-Item -LiteralPath $td -Recurse -Force -ErrorAction SilentlyContinue }
    }
  }
  # 3. *.dist-info/RECORD bloat (not needed at runtime)
  Get-ChildItem -LiteralPath $sitePkgs -Directory -Filter '*.dist-info' -ErrorAction SilentlyContinue |
    ForEach-Object {
      $rec = Join-Path $_.FullName 'RECORD'
      if (Test-Path $rec) { Remove-Item -LiteralPath $rec -Force -ErrorAction SilentlyContinue }
    }
}

$sizeAfter = Get-DirSizeMB $target
Write-Host "[build-clio-runtime] size after prune:  $sizeAfter MB (saved $([math]::Round($sizeBefore - $sizeAfter,1)) MB)"

# --- sanity: --help must exit 0 --------------------------------------
if (-not (Test-Path $gactExe)) {
  throw "build-clio-runtime: expected $gactExe to exist after install but it does not"
}
Write-Host "[build-clio-runtime] sanity: $gactExe --help"
Invoke-Native -Exe $gactExe -Args @('--help') | Out-Null

Write-Host "[build-clio-runtime] OK - relocatable runtime ready at $target ($sizeAfter MB)"
