# Installs the NSIS toolset that Tauri's bundler would otherwise download on
# every `--bundles nsis` build, with retries for transient GitHub release
# errors (504s). The layout, URLs and SHA-1s match tauri-bundler 2.1.0
# (crates/tauri-bundler/src/bundle/windows/nsis/mod.rs): the bundler skips its
# own download when every required file exists and the plugin hash matches.
param([Parameter(Mandatory)][string]$Destination)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$nsisUrl = 'https://github.com/tauri-apps/binary-releases/releases/download/nsis-3/nsis-3.zip'
$nsisSha1 = '057E83C7D82462EC394AF76C87D06733605543D4'
$utilsUrl = 'https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.4.1/nsis_tauri_utils.dll'
$utilsSha1 = 'F99A50209A345185A84D34D0E5F66D04C75FF52F'
$required = @(
  'makensis.exe', 'Bin/makensis.exe', 'Stubs/lzma-x86-unicode', 'Stubs/lzma_solid-x86-unicode',
  'Plugins/x86-unicode/nsis_tauri_utils.dll', 'Include/MUI2.nsh', 'Include/FileFunc.nsh',
  'Include/x64.nsh', 'Include/nsDialogs.nsh', 'Include/WinMessages.nsh'
)

function Get-Verified([string]$Url, [string]$OutFile, [string]$Sha1) {
  $attempts = 8
  for ($attempt = 1; $attempt -le $attempts; $attempt++) {
    try {
      Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $OutFile -TimeoutSec 120
      $actual = (Get-FileHash -Algorithm SHA1 $OutFile).Hash
      if ($actual -eq $Sha1) { return }
      throw "SHA-1 $actual does not match $Sha1"
    } catch {
      if ($attempt -eq $attempts) { throw "Downloading $Url failed: $_" }
      $delay = [Math]::Min(60, 5 * [Math]::Pow(2, $attempt - 1))
      Write-Host "Attempt $attempt for $Url failed ($_); retrying in $delay s"
      Start-Sleep -Seconds $delay
    }
  }
}

$work = Join-Path ([IO.Path]::GetTempPath()) "tauri-nsis-$PID"
New-Item -ItemType Directory -Force $work | Out-Null
try {
  $zip = Join-Path $work 'nsis-3.zip'
  Get-Verified $nsisUrl $zip $nsisSha1
  Expand-Archive -Path $zip -DestinationPath $work
  if (Test-Path $Destination) { Remove-Item -Recurse -Force $Destination }
  New-Item -ItemType Directory -Force (Split-Path $Destination) | Out-Null
  Move-Item (Join-Path $work 'nsis-3.08') $Destination

  $plugins = Join-Path $Destination 'Plugins/x86-unicode'
  New-Item -ItemType Directory -Force $plugins | Out-Null
  Get-Verified $utilsUrl (Join-Path $plugins 'nsis_tauri_utils.dll') $utilsSha1
} finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}

$missing = $required | Where-Object { -not (Test-Path (Join-Path $Destination $_)) }
if ($missing) { throw "NSIS toolset is missing: $($missing -join ', ')" }
Write-Host "NSIS toolset ready in $Destination"
