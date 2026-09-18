; Stop only CLIO-managed processes whose executable lives inside this
; installation directory. This avoids leaving the portable Python runtime
; behind when NSIS replaces or removes a running desktop installation, without
; touching a user's independent clio-agent or Python processes.
!include nsDialogs.nsh
!include LogicLib.nsh

Var ClioRemoveUserDataCheckbox
Var ClioRemoveUserData
Var ClioInstallWebSearch

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

  ; A normal fresh install recommends the private search/document service and
  ; lets the user opt out. Silent updates preserve the previous choice and do
  ; not repeat infrastructure work.
  StrCpy $ClioInstallWebSearch "0"
  ${If} $PassiveMode <> 1
  ${AndIf} $UpdateMode <> 1
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON1 "Install the recommended CLIO Search service? It adds private web search, PDF reading, scholarly metadata, and traceable sources. Docker Desktop must already be installed and running. You can also install or manage it later from Infrastructure." IDYES clio_web_search_yes IDNO clio_web_search_no
    clio_web_search_yes:
      StrCpy $ClioInstallWebSearch "1"
      Goto clio_web_search_choice_done
    clio_web_search_no:
      StrCpy $ClioInstallWebSearch "0"
    clio_web_search_choice_done:
    CreateDirectory "$LOCALAPPDATA\ai.iowarp.clio.desktop"
    FileOpen $0 "$LOCALAPPDATA\ai.iowarp.clio.desktop\installer-options.json" w
    ${If} $ClioInstallWebSearch == "1"
      FileWrite $0 '{$\"version$\":1,$\"web_search$\":true,$\"web_search_status$\":$\"pending$\"}'
    ${Else}
      FileWrite $0 '{$\"version$\":1,$\"web_search$\":false,$\"web_search_status$\":$\"not_requested$\"}'
    ${EndIf}
    FileClose $0
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $ClioInstallWebSearch == "1"
    DetailPrint "Checking Docker for the recommended CLIO Search service..."
    nsExec::ExecToStack 'docker info'
    Pop $0
    Pop $1
    ${If} $0 == 0
      DetailPrint "Installing CLIO Search (this can take several minutes on a first install)..."
      nsExec::ExecToStack 'docker pull ghcr.io/iowarp/clio-web-search:0.3.0'
      Pop $0
      Pop $1
      ${If} $0 == 0
        nsExec::ExecToStack 'docker container inspect clio-web-search'
        Pop $0
        Pop $1
        ${If} $0 == 0
          nsExec::ExecToStack 'docker start clio-web-search'
        ${Else}
          nsExec::ExecToStack 'docker run --detach --name clio-web-search --restart unless-stopped --publish 127.0.0.1:8089:8080 --publish 127.0.0.1:8090:6379 --volume clio-web-search-data:/var/lib/clio-web-search ghcr.io/iowarp/clio-web-search:0.3.0'
        ${EndIf}
        Pop $0
        Pop $1
        ${If} $0 == 0
          FileOpen $2 "$LOCALAPPDATA\ai.iowarp.clio.desktop\installer-options.json" w
          FileWrite $2 '{$\"version$\":1,$\"web_search$\":true,$\"web_search_status$\":$\"deployed$\"}'
          FileClose $2
          DetailPrint "CLIO Search is installed and running."
        ${Else}
          FileOpen $2 "$LOCALAPPDATA\ai.iowarp.clio.desktop\installer-options.json" w
          FileWrite $2 '{$\"version$\":1,$\"web_search$\":true,$\"web_search_status$\":$\"needs_attention$\"}'
          FileClose $2
          DetailPrint "CLIO Search needs attention. Finish setup later from Infrastructure."
        ${EndIf}
      ${Else}
        FileOpen $2 "$LOCALAPPDATA\ai.iowarp.clio.desktop\installer-options.json" w
        FileWrite $2 '{$\"version$\":1,$\"web_search$\":true,$\"web_search_status$\":$\"needs_attention$\"}'
        FileClose $2
        DetailPrint "CLIO Search could not be downloaded. Finish setup later from Infrastructure."
      ${EndIf}
    ${Else}
      FileOpen $2 "$LOCALAPPDATA\ai.iowarp.clio.desktop\installer-options.json" w
      FileWrite $2 '{$\"version$\":1,$\"web_search$\":true,$\"web_search_status$\":$\"needs_attention$\"}'
      FileClose $2
      DetailPrint "Docker is unavailable. Finish CLIO Search setup later from Infrastructure."
    ${EndIf}
  ${EndIf}
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
