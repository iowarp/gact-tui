; Stop only CLIO-managed processes whose executable lives inside this
; installation directory. This avoids leaving the portable Python runtime
; behind when NSIS replaces or removes a running desktop installation, without
; touching a user's independent clio-agent or Python processes.
!include nsDialogs.nsh
!include LogicLib.nsh

Var ClioRemoveUserDataCheckbox
Var ClioRemoveUserData

; Keep user-owned sessions and settings by default, but make a genuinely clean
; uninstall an explicit, visible choice.  This page is part of the uninstaller
; (not the upgrade path), so reinstalling a patch never silently erases state.
UninstPage custom un.ClioRemoveUserDataPage un.ClioRemoveUserDataPageLeave

Function un.ClioRemoveUserDataPage
  !insertmacro MUI_HEADER_TEXT "Remove CLIO Desktop" "Choose what to keep on this computer."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "CLIO can keep your settings, sessions, and local workspace data for a future reinstall."
  Pop $1
  ${NSD_CreateCheckbox} 0 34u 100% 16u "Also remove CLIO settings, sessions, and local data"
  Pop $ClioRemoveUserDataCheckbox
  ${NSD_Uncheck} $ClioRemoveUserDataCheckbox

  nsDialogs::Show
FunctionEnd

Function un.ClioRemoveUserDataPageLeave
  ${NSD_GetState} $ClioRemoveUserDataCheckbox $ClioRemoveUserData
FunctionEnd

!macro CLIO_STOP_MANAGED_RUNTIME
  nsExec::ExecToLog 'powershell.exe -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "$$root=[IO.Path]::GetFullPath(''$INSTDIR''); Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -and [IO.Path]::GetFullPath($$_.ExecutablePath).StartsWith($$root,[StringComparison]::OrdinalIgnoreCase) -and $$_.Name -in @(''clio-desktop.exe'',''clio-agent.exe'',''python.exe'',''clio_run.exe'') } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"'
  Sleep 500
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro CLIO_STOP_MANAGED_RUNTIME
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro CLIO_STOP_MANAGED_RUNTIME
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $ClioRemoveUserData == ${BST_CHECKED}
    RMDir /r "$LOCALAPPDATA\ai.iowarp.clio.desktop"
    RMDir /r "$APPDATA\ai.iowarp.clio.desktop"
  ${EndIf}
!macroend
