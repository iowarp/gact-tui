; Stop only CLIO-managed processes whose executable lives inside this
; installation directory. This avoids leaving the portable Python runtime
; behind when NSIS replaces or removes a running desktop installation, without
; touching a user's independent clio-agent or Python processes.
!macro CLIO_STOP_MANAGED_RUNTIME
  nsExec::ExecToLog 'powershell.exe -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "$$root=[IO.Path]::GetFullPath(''$INSTDIR''); Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -and [IO.Path]::GetFullPath($$_.ExecutablePath).StartsWith($$root,[StringComparison]::OrdinalIgnoreCase) -and $$_.Name -in @(''clio-desktop.exe'',''clio-agent.exe'',''python.exe'') } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"'
  Sleep 500
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro CLIO_STOP_MANAGED_RUNTIME
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro CLIO_STOP_MANAGED_RUNTIME
!macroend
