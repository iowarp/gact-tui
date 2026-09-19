; Stop only CLIO-managed processes whose executable lives inside this
; installation directory. This avoids leaving the portable Python runtime
; behind when NSIS replaces or removes a running desktop installation, without
; touching a user's independent clio-agent or Python processes.
!include nsDialogs.nsh
!include LogicLib.nsh

Var ClioRemoveUserDataCheckbox
Var ClioRemoveUserData

Var ClioWebSearchCheckbox
Var ClioLlamaCppCheckbox
Var ClioKitCheckbox
Var ClioInstallWebSearch
Var ClioInstallLlamaCpp
Var ClioWebSearchStatus
Var ClioLlamaCppStatus

; Collect the optional-infrastructure choices as a normal wizard page instead
; of a MessageBox fired mid-install: nsDialogs pages are deterministically
; skipped by NSIS itself in a silent install (`/S`), where a MessageBox's
; "which button did silent mode press" behavior is ambiguous, and the page's
; own function can Abort to skip it for a passive/update run — see
; ClioInfrastructurePage below.
;
; F2 (accepted, not fixed here): this `Page custom` is textually the FIRST
; page instruction in the compiled script, since Tauri's template !includes
; this file before its own `!insertmacro MUI_PAGE_WELCOME` / MUI_PAGE_LICENSE
; sequence — so ClioInfrastructurePage renders BEFORE Welcome/License, not
; alongside Directory/InstFiles where a "what should we set up" prompt would
; more naturally sit. Reordering would require either patching the vendored
; template or duplicating its whole page sequence in this file; accepted for
; now as a page-order quirk, not a functional bug.
Page custom ClioInfrastructurePage ClioInfrastructurePageLeave

Function ClioInfrastructurePage
  ; Silent updates preserve the previous infrastructure choice and never repeat
  ; setup work; a passive (unattended, updater-driven) run is likewise never a
  ; place to ask the user anything. Aborting here — before nsDialogs::Create —
  ; is the standard NSIS way to skip a custom page.
  ;
  ; This must NOT read the template's own PassiveMode / UpdateMode Vars:
  ; those are declared by Tauri's template AFTER it !includes this file, so a
  ; reference to them inside a Function body — compiled immediately, at the
  ; point this file is included, unlike a !macro body which is only compiled
  ; later at its !insertmacro call site (see NSIS_HOOK_PREINSTALL below,
  ; where the same names ARE safe to read) — resolves against undeclared
  ; Vars. makensis only WARNS about that, so the check silently always
  ; evaluated false and the updater's passive `/P /R /UPDATE` run blocked on
  ; this page. Read the raw command line instead, via FileFunc.nsh's
  ; GetOptions (already included by the base template before this file, so
  ; no !include here — and deliberately not redeclaring those template Vars,
  ; which would be a duplicate Var error).
  ${GetOptions} $CMDLINE "/P" $R0
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
  ${GetOptions} $CMDLINE "/UPDATE" $R0
  ${IfNot} ${Errors}
    Abort
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "Infrastructure" "Choose what CLIO sets up now."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "CLIO can set these up now. Each one can also be installed, changed, or removed later from Infrastructure."
  Pop $1

  ${NSD_CreateCheckbox} 0 30u 100% 12u "CLIO Search (web search and PDF reading, runs in Docker)"
  Pop $ClioWebSearchCheckbox
  ${NSD_Check} $ClioWebSearchCheckbox

  ${NSD_CreateCheckbox} 0 46u 100% 12u "Local model runtime (llama.cpp)"
  Pop $ClioLlamaCppCheckbox
  ${NSD_Uncheck} $ClioLlamaCppCheckbox

  ${NSD_CreateCheckbox} 0 62u 100% 12u "Science tool kit (clio-kit) — bundled"
  Pop $ClioKitCheckbox
  ${NSD_Check} $ClioKitCheckbox
  EnableWindow $ClioKitCheckbox 0

  nsDialogs::Show
FunctionEnd

Function ClioInfrastructurePageLeave
  ${NSD_GetState} $ClioWebSearchCheckbox $ClioInstallWebSearch
  ${If} $ClioInstallWebSearch == ${BST_CHECKED}
    StrCpy $ClioInstallWebSearch "1"
  ${Else}
    StrCpy $ClioInstallWebSearch "0"
  ${EndIf}

  ${NSD_GetState} $ClioLlamaCppCheckbox $ClioInstallLlamaCpp
  ${If} $ClioInstallLlamaCpp == ${BST_CHECKED}
    StrCpy $ClioInstallLlamaCpp "1"
  ${Else}
    StrCpy $ClioInstallLlamaCpp "0"
  ${EndIf}
FunctionEnd

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

; Every write to installer-options.json goes through this one macro so its
; shape (schema/web_search/llama_cpp/clio_kit) is defined in exactly one place;
; callers set $ClioWebSearchStatus / $ClioLlamaCppStatus first. Uses
; ${BUNDLEID} — the identifier Tauri actually built this installer with —
; rather than a literal, so a brand overlay with a different identifier (see
; tauri.conf.json's own `identifier`) still writes into the folder the running
; app actually reads from.
!macro CLIO_WRITE_INSTALLER_OPTIONS
  CreateDirectory "$LOCALAPPDATA\${BUNDLEID}"
  FileOpen $2 "$LOCALAPPDATA\${BUNDLEID}\installer-options.json" w
  FileWrite $2 '{$\"schema$\":2,$\"web_search$\":$\"'
  FileWrite $2 $ClioWebSearchStatus
  FileWrite $2 '$\",$\"llama_cpp$\":$\"'
  FileWrite $2 $ClioLlamaCppStatus
  FileWrite $2 '$\",$\"clio_kit$\":$\"bundled$\"}'
  FileClose $2
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro CLIO_STOP_MANAGED_RUNTIME
  ; Bundled resources contain a directory tree that the generated NSIS file
  ; manifest does not reliably remove. Clear only that owned subtree before an
  ; upgrade so stale Python packages cannot survive into the new runtime.
  RMDir /r "$INSTDIR\gact-runtime"

  ; A silent update/passive run preserves the previous choice and does not
  ; repeat infrastructure work — ClioInfrastructurePage already Aborted for
  ; that case, so $ClioInstallWebSearch/$ClioInstallLlamaCpp stay empty and
  ; nothing is written here.
  ${If} $PassiveMode <> 1
  ${AndIf} $UpdateMode <> 1
    ; A plain silent (but not passive/update) fresh install skips ALL wizard
    ; pages, including ours, so the Leave function never ran — fall back to
    ; the same recommended defaults the page itself shows (Search on, local
    ; runtime off) rather than treating "never asked" as "declined".
    ${If} $ClioInstallWebSearch == ""
      StrCpy $ClioInstallWebSearch "1"
    ${EndIf}
    ${If} $ClioInstallLlamaCpp == ""
      StrCpy $ClioInstallLlamaCpp "0"
    ${EndIf}

    ${If} $ClioInstallWebSearch == "1"
      StrCpy $ClioWebSearchStatus "pending"
    ${Else}
      StrCpy $ClioWebSearchStatus "not_requested"
    ${EndIf}
    ${If} $ClioInstallLlamaCpp == "1"
      StrCpy $ClioLlamaCppStatus "requested"
    ${Else}
      StrCpy $ClioLlamaCppStatus "not_requested"
    ${EndIf}
    !insertmacro CLIO_WRITE_INSTALLER_OPTIONS
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
          StrCpy $ClioWebSearchStatus "deployed"
          !insertmacro CLIO_WRITE_INSTALLER_OPTIONS
          DetailPrint "CLIO Search is installed and running."
        ${Else}
          StrCpy $ClioWebSearchStatus "needs_attention"
          !insertmacro CLIO_WRITE_INSTALLER_OPTIONS
          DetailPrint "CLIO Search needs attention. Finish setup later from Infrastructure."
        ${EndIf}
      ${Else}
        StrCpy $ClioWebSearchStatus "needs_attention"
        !insertmacro CLIO_WRITE_INSTALLER_OPTIONS
        DetailPrint "CLIO Search could not be downloaded. Finish setup later from Infrastructure."
      ${EndIf}
    ${Else}
      StrCpy $ClioWebSearchStatus "needs_attention"
      !insertmacro CLIO_WRITE_INSTALLER_OPTIONS
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
    RMDir /r "$LOCALAPPDATA\${BUNDLEID}"
    RMDir /r "$APPDATA\${BUNDLEID}"
  ${EndIf}
!macroend
