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
  ; Pass the path through a tiny temporary file instead of interpolating it into
  ; PowerShell source. The compact encoded command stays below NSIS' command-string
  ; limit while retaining an executable allowlist and install-root boundary check.
  FileOpen $0 "$TEMP\clio-desktop-install-root.txt" w
  FileWrite $0 "$INSTDIR"
  FileClose $0
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand JAByAD0AKABnAGMAIAAtAFIAYQB3ACAAIgAkAGUAbgB2ADoAVABFAE0AUABcAGMAbABpAG8ALQBkAGUAcwBrAHQAbwBwAC0AaQBuAHMAdABhAGwAbAAtAHIAbwBvAHQALgB0AHgAdAAiACkALgBUAHIAaQBtAEUAbgBkACgAIgBcACIAKQArACIAXAAiADsAZwBjAGkAbQAgAFcAaQBuADMAMgBfAFAAcgBvAGMAZQBzAHMAfAA/AHsAJABfAC4ATgBhAG0AZQAgAC0AaQBuACAAIgBjAGwAaQBvAC0AZABlAHMAawB0AG8AcAAuAGUAeABlACIALAAiAGMAbABpAG8ALQBhAGcAZQBuAHQALgBlAHgAZQAiACwAIgBwAHkAdABoAG8AbgAuAGUAeABlACIALAAiAGMAbABpAG8AXwByAHUAbgAuAGUAeABlACIAIAAtAGEAbgBkACAAJABfAC4ARQB4AGUAYwB1AHQAYQBiAGwAZQBQAGEAdABoACAALQBhAG4AZAAgACgAJABfAC4ARQB4AGUAYwB1AHQAYQBiAGwAZQBQAGEAdABoAC0AcgBlAHAAbABhAGMAZQAiAF4AXABcAFwAXABcAD8AXABcACIALAAiACIAKQAuAFMAdABhAHIAdABzAFcAaQB0AGgAKAAkAHIALAA1ACkAfQB8ACUAewBrAGkAbABsACAALQBJAGQAIAAkAF8ALgBQAHIAbwBjAGUAcwBzAEkAZAAgAC0ARgBvAHIAYwBlACAALQBlAGEAIAAwAH0A' $0
  Delete "$TEMP\clio-desktop-install-root.txt"
  Sleep 1500
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro CLIO_STOP_MANAGED_RUNTIME
  ; Bundled resources contain a directory tree that the generated NSIS file
  ; manifest does not reliably remove. Clear only that owned subtree before an
  ; upgrade so stale Python packages cannot survive into the new runtime.
  RMDir /r "$INSTDIR\gact-runtime"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro CLIO_STOP_MANAGED_RUNTIME
  RMDir /r "$INSTDIR\gact-runtime"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Keep this as a final idempotent sweep in case Windows released a loaded
  ; runtime file only after the generated uninstall section ran.
  RMDir /r "$INSTDIR\gact-runtime"
  RMDir "$INSTDIR"
  ${If} $ClioRemoveUserData == ${BST_CHECKED}
    RMDir /r "$LOCALAPPDATA\ai.iowarp.clio.desktop"
    RMDir /r "$APPDATA\ai.iowarp.clio.desktop"
  ${EndIf}
!macroend
