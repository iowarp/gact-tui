param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string] $Tape,

    [string] $Backend,

    [string] $TtydVersion = "1.7.2"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$toolsDir = Join-Path $repoRoot ".tools\vhs-windows"
$ttydDir = Join-Path $toolsDir "ttyd-$TtydVersion"
$ttydExe = Join-Path $ttydDir "ttyd.exe"
$tuiDir = Join-Path $repoRoot "tui"
$generatedDir = Join-Path $toolsDir "generated"

if (-not (Get-Command vhs -ErrorAction SilentlyContinue)) {
    throw "vhs.exe is not on PATH. Install it with: winget install charmbracelet.vhs"
}

if (-not (Test-Path -LiteralPath $ttydExe)) {
    New-Item -ItemType Directory -Force -Path $ttydDir | Out-Null
    $url = "https://github.com/tsl0922/ttyd/releases/download/$TtydVersion/ttyd.win10.exe"
    Write-Host "Downloading ttyd $TtydVersion for VHS Windows compatibility..."
    Invoke-WebRequest -Uri $url -OutFile $ttydExe
}

$resolvedTape = Resolve-Path $Tape
if ($Backend) {
    $env:GACT_BACKEND = $Backend
}

$env:Path = "$ttydDir;$tuiDir;$env:Path"

$tapeText = [System.IO.File]::ReadAllText($resolvedTape)
$tapeText = $tapeText -replace 'Set Shell "bash"', 'Set Shell "cmd"'
$tapeText = $tapeText -replace '/tmp/gact', 'gact'
$tapeText = $tapeText -replace '/home/[^/]+/tui/screenshots/', 'screenshots/'
$tapeText = $tapeText -replace 'Type "GACT_BACKEND=([^ ]+) gact ([^"]*)"', 'Type "set GACT_BACKEND=$1&& gact $2"'
if ($env:GACT_BACKEND) {
    $tapeText = $tapeText.Replace('$GACT_BACKEND', $env:GACT_BACKEND)
}
if ($env:GACT_BACKEND_LABEL) {
    $tapeText = $tapeText.Replace('$GACT_BACKEND_LABEL', $env:GACT_BACKEND_LABEL)
}

New-Item -ItemType Directory -Force -Path $generatedDir | Out-Null
$generatedTape = Join-Path $generatedDir ([System.IO.Path]::GetFileName($resolvedTape))
[System.IO.File]::WriteAllText($generatedTape, $tapeText, [System.Text.UTF8Encoding]::new($false))

Write-Host "Using $(& $ttydExe --version)"
Push-Location $repoRoot
try {
    vhs $generatedTape
}
finally {
    Pop-Location
}
