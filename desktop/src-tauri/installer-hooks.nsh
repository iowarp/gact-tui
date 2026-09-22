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
Var ClioProviderCodexCheckbox
Var ClioProviderClaudeCodeCheckbox
Var ClioProviderOpenAICheckbox
Var ClioProviderAnthropicCheckbox
Var ClioProviderGeminiCheckbox
Var ClioProviderVertexCheckbox
Var ClioProviderLMStudioCheckbox
Var ClioProviderOllamaCheckbox
Var ClioProviderLlamaCppCheckbox
Var ClioProviderVllmCheckbox
Var ClioProviderArgonneSophiaCheckbox
Var ClioProviderArgonneMetisCheckbox
Var ClioProviderAzureOpenAICheckbox
Var ClioProviderBedrockCheckbox
Var ClioProviderNvidiaNimCheckbox
Var ClioProviderOpenRouterCheckbox
Var ClioInstallWebSearch
Var ClioInstallLlamaCpp
Var ClioWebSearchStatus
Var ClioLlamaCppStatus
Var ClioProviderIds
Var ClioProviderChoicesCaptured

; Collect infrastructure and provider visibility as two focused wizard pages
; of a MessageBox fired mid-install: nsDialogs pages are deterministically
; skipped by NSIS itself in a silent install (`/S`), where a MessageBox's
; "which button did silent mode press" behavior is ambiguous, and the page's
; own function can Abort to skip it for a passive/update run — see
; ClioInfrastructurePage / ClioProvidersPage below.
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
Page custom ClioProvidersPage ClioProvidersPageLeave

!macro CLIO_SKIP_SETUP_PAGE_IF_UNATTENDED
  ${GetOptions} $CMDLINE "/P" $R0
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
  ${GetOptions} $CMDLINE "/UPDATE" $R0
  ${IfNot} ${Errors}
    Abort
  ${EndIf}
!macroend

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
  !insertmacro CLIO_SKIP_SETUP_PAGE_IF_UNATTENDED

  !insertmacro MUI_HEADER_TEXT "Infrastructure" "Choose what CLIO sets up now."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Choose the optional services CLIO should prepare. You can install or remove them later from Infrastructure."
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

Function ClioProvidersPage
  !insertmacro CLIO_SKIP_SETUP_PAGE_IF_UNATTENDED

  !insertmacro MUI_HEADER_TEXT "Model providers" "Choose which providers CLIO shows."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ; Compact three-column groups keep every choice above the wizard footer at
  ; Windows' default DPI. Providers are individual choices: selecting an API
  ; provider never silently exposes its separate subscription/CLI product.
  CreateFont $2 "$(^Font)" "$(^FontSize)" "700"
  ${NSD_CreateLabel} 0 0 31% 12u "Subscription"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $2 0
  ${NSD_CreateCheckbox} 0 16u 31% 12u "OpenAI Codex"
  Pop $ClioProviderCodexCheckbox
  ${NSD_Check} $ClioProviderCodexCheckbox
  ${NSD_CreateCheckbox} 0 32u 31% 12u "Claude Code"
  Pop $ClioProviderClaudeCodeCheckbox
  ${NSD_Uncheck} $ClioProviderClaudeCodeCheckbox

  ${NSD_CreateLabel} 0 56u 31% 12u "Direct APIs"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $2 0
  ${NSD_CreateCheckbox} 0 72u 31% 12u "OpenAI API"
  Pop $ClioProviderOpenAICheckbox
  ${NSD_Check} $ClioProviderOpenAICheckbox
  ${NSD_CreateCheckbox} 0 88u 31% 12u "Anthropic API"
  Pop $ClioProviderAnthropicCheckbox
  ${NSD_Uncheck} $ClioProviderAnthropicCheckbox
  ${NSD_CreateCheckbox} 0 104u 31% 12u "Google Gemini"
  Pop $ClioProviderGeminiCheckbox
  ${NSD_Uncheck} $ClioProviderGeminiCheckbox
  ${NSD_CreateCheckbox} 0 120u 31% 12u "Google Vertex AI"
  Pop $ClioProviderVertexCheckbox
  ${NSD_Uncheck} $ClioProviderVertexCheckbox

  ${NSD_CreateLabel} 34% 0 31% 12u "Local / self-hosted"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $2 0
  ${NSD_CreateCheckbox} 34% 16u 31% 12u "LM Studio"
  Pop $ClioProviderLMStudioCheckbox
  ${NSD_Uncheck} $ClioProviderLMStudioCheckbox
  ${NSD_CreateCheckbox} 34% 32u 31% 12u "Ollama"
  Pop $ClioProviderOllamaCheckbox
  ${NSD_Uncheck} $ClioProviderOllamaCheckbox
  ${NSD_CreateCheckbox} 34% 48u 31% 12u "llama.cpp"
  Pop $ClioProviderLlamaCppCheckbox
  ${NSD_Uncheck} $ClioProviderLlamaCppCheckbox
  ${NSD_CreateCheckbox} 34% 64u 31% 12u "vLLM"
  Pop $ClioProviderVllmCheckbox
  ${NSD_Uncheck} $ClioProviderVllmCheckbox

  ${NSD_CreateLabel} 34% 88u 31% 12u "Argonne ALCF"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $2 0
  ${NSD_CreateCheckbox} 34% 104u 31% 12u "Sophia"
  Pop $ClioProviderArgonneSophiaCheckbox
  ${NSD_Uncheck} $ClioProviderArgonneSophiaCheckbox
  ${NSD_CreateCheckbox} 34% 120u 31% 12u "Metis"
  Pop $ClioProviderArgonneMetisCheckbox
  ${NSD_Uncheck} $ClioProviderArgonneMetisCheckbox

  ${NSD_CreateLabel} 68% 0 32% 12u "Other clouds"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $2 0
  ${NSD_CreateCheckbox} 68% 16u 32% 12u "Azure OpenAI"
  Pop $ClioProviderAzureOpenAICheckbox
  ${NSD_Uncheck} $ClioProviderAzureOpenAICheckbox
  ${NSD_CreateCheckbox} 68% 32u 32% 12u "Amazon Bedrock"
  Pop $ClioProviderBedrockCheckbox
  ${NSD_Uncheck} $ClioProviderBedrockCheckbox
  ${NSD_CreateCheckbox} 68% 48u 32% 12u "NVIDIA NIM"
  Pop $ClioProviderNvidiaNimCheckbox
  ${NSD_Uncheck} $ClioProviderNvidiaNimCheckbox
  ${NSD_CreateCheckbox} 68% 64u 32% 12u "OpenRouter"
  Pop $ClioProviderOpenRouterCheckbox
  ${NSD_Uncheck} $ClioProviderOpenRouterCheckbox

  nsDialogs::Show
FunctionEnd

!macro CLIO_APPEND_PROVIDER _ID _CHECKBOX
  ${NSD_GetState} ${_CHECKBOX} $0
  ${If} $0 == ${BST_CHECKED}
    ${If} $ClioProviderIds == ""
      StrCpy $ClioProviderIds "${_ID}"
    ${Else}
      StrCpy $ClioProviderIds "$ClioProviderIds,${_ID}"
    ${EndIf}
  ${EndIf}
!macroend

Function ClioProvidersPageLeave
  StrCpy $ClioProviderChoicesCaptured "1"
  StrCpy $ClioProviderIds ""
  !insertmacro CLIO_APPEND_PROVIDER "codex" $ClioProviderCodexCheckbox
  !insertmacro CLIO_APPEND_PROVIDER "claude_code" $ClioProviderClaudeCodeCheckbox
  !insertmacro CLIO_APPEND_PROVIDER "openai" $ClioProviderOpenAICheckbox
  !insertmacro CLIO_APPEND_PROVIDER "anthropic" $ClioProviderAnthropicCheckbox
  !insertmacro CLIO_APPEND_PROVIDER "gemini" $ClioProviderGeminiCheckbox
  !insertmacro CLIO_APPEND_PROVIDER "vertex_ai" $ClioProviderVertexCheckbox
  !insertmacro CLIO_APPEND_PROVIDER "lm_studio" $ClioProviderLMStudioCheckbox
  !insertmacro CLIO_APPEND_PROVIDER "ollama" $ClioProviderOllamaCheckbox
  !insertmacro CLIO_APPEND_PROVIDER "llama_cpp" $ClioProviderLlamaCppCheckbox
  !insertmacro CLIO_APPEND_PROVIDER "vllm" $ClioProviderVllmCheckbox
  !insertmacro CLIO_APPEND_PROVIDER "argonne_sophia" $ClioProviderArgonneSophiaCheckbox
  !insertmacro CLIO_APPEND_PROVIDER "argonne_metis" $ClioProviderArgonneMetisCheckbox
  !insertmacro CLIO_APPEND_PROVIDER "azure_openai" $ClioProviderAzureOpenAICheckbox
  !insertmacro CLIO_APPEND_PROVIDER "bedrock" $ClioProviderBedrockCheckbox
  !insertmacro CLIO_APPEND_PROVIDER "nvidia_nim" $ClioProviderNvidiaNimCheckbox
  !insertmacro CLIO_APPEND_PROVIDER "openrouter" $ClioProviderOpenRouterCheckbox
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

; Generated infrastructure is not user-authored session data. Remove it on
; every uninstall even when the user keeps settings and workspaces. This also
; sweeps the two historical layouts used by 0.9.4.x so a one-gigabyte CTE arena
; or an old unpacked runtime cannot survive unnoticed on C:.
!macro CLIO_REMOVE_MANAGED_STORAGE
  ; Use the native helper for the large Python tree. It deletes independent
  ; top-level runtime directories concurrently and stays hidden; the RMDir
  ; calls below remain as idempotent fallback/sweeps for historical layouts.
  DetailPrint "Removing the CLIO runtime and generated service data..."
  nsExec::ExecToStack '"$INSTDIR\clio-desktop.exe" --remove-managed-storage'
  Pop $0
  Pop $1
  RMDir /r "$INSTDIR\gact-runtime"
  RMDir /r "$INSTDIR\data\bundled-runtime"
  RMDir /r "$INSTDIR\data\bundled-runtime.installing"
  RMDir /r "$INSTDIR\data\bundled-runtime.previous"
  RMDir /r "$INSTDIR\data\clio-user\data\cte"
  RMDir /r "$INSTDIR\data\huggingface"
  RMDir /r "$LOCALAPPDATA\${BUNDLEID}\bundled-runtime"
  RMDir /r "$LOCALAPPDATA\${BUNDLEID}\bundled-runtime.installing"
  RMDir /r "$LOCALAPPDATA\${BUNDLEID}\bundled-runtime.previous"
  RMDir /r "$LOCALAPPDATA\${BUNDLEID}\clio-user\data\cte"
  RMDir /r "$LOCALAPPDATA\${PRODUCTNAME}\gact-runtime"
  ; Pre-0.9.4 developer/preview builds used these fixed machine-local
  ; directories outside the product identifier. They contain only generated
  ; CTE/runtime state, never sessions or user-authored workspace data.
  RMDir /r "$LOCALAPPDATA\clio-agent-r15-cte"
  RMDir /r "$LOCALAPPDATA\clio-agent-r15-platform"
  RMDir /r "$LOCALAPPDATA\clio-agent-r15-runtime"
!macroend

; Every write to installer-options.json goes through this one macro so its
; shape (schema/web_search/llama_cpp/clio_kit/provider_ids) is defined here;
; callers set $ClioWebSearchStatus / $ClioLlamaCppStatus first. Uses
; ${BUNDLEID} — the identifier Tauri actually built this installer with —
; rather than a literal, so a brand overlay with a different identifier (see
; tauri.conf.json's own `identifier`) still writes into the folder the running
; app actually reads from.
!macro CLIO_WRITE_INSTALLER_OPTIONS
  CreateDirectory "$LOCALAPPDATA\${BUNDLEID}"
  FileOpen $2 "$LOCALAPPDATA\${BUNDLEID}\installer-options.json" w
  FileWrite $2 '{$\"schema$\":4,$\"web_search$\":$\"'
  FileWrite $2 $ClioWebSearchStatus
  FileWrite $2 '$\",$\"llama_cpp$\":$\"'
  FileWrite $2 $ClioLlamaCppStatus
  FileWrite $2 '$\",$\"clio_kit$\":$\"bundled$\",$\"provider_ids$\":$\"'
  FileWrite $2 $ClioProviderIds
  FileWrite $2 '$\"}'
  FileClose $2
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro CLIO_STOP_MANAGED_RUNTIME
  ; Bundled resources contain a directory tree that the generated NSIS file
  ; manifest does not reliably remove. Clear only that owned subtree before an
  ; upgrade so stale Python packages cannot survive into the new runtime.
  RMDir /r "$INSTDIR\gact-runtime"
  ; Sweep generated storage left by the old fixed-name preview installer even
  ; on a fresh install. This keeps a D: installation from retaining a second
  ; C:-resident CTE/runtime copy.
  RMDir /r "$LOCALAPPDATA\clio-agent-r15-cte"
  RMDir /r "$LOCALAPPDATA\clio-agent-r15-platform"
  RMDir /r "$LOCALAPPDATA\clio-agent-r15-runtime"

  ; A silent update/passive run preserves the previous choice and does not
  ; repeat setup work — both custom pages already Aborted for that case, so
  ; their choice variables stay empty and nothing is written here.
  ${If} $PassiveMode <> 1
  ${AndIf} $UpdateMode <> 1
    ; A plain silent (but not passive/update) fresh install skips ALL wizard
    ; pages, including ours, so the Leave function never ran — fall back to
    ; the same recommended defaults the pages show (Search on, local runtime
    ; off, OpenAI API and Codex visible) rather than treating "never asked"
    ; as "declined".
    ${If} $ClioInstallWebSearch == ""
      StrCpy $ClioInstallWebSearch "1"
    ${EndIf}
    ${If} $ClioInstallLlamaCpp == ""
      StrCpy $ClioInstallLlamaCpp "0"
    ${EndIf}
    ${If} $ClioProviderChoicesCaptured != "1"
      StrCpy $ClioProviderIds "codex,openai"
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
  ; The runtime is shipped as one zstd archive so NSIS does not spend minutes
  ; processing tens of thousands of Python files. Expand it here, invisibly,
  ; before the user can launch CLIO. The executable installs it below $INSTDIR
  ; so a D: selection includes the runtime, CTE, workspace, and model cache.
  DetailPrint "Installing the CLIO runtime..."
  nsExec::ExecToStack '"$INSTDIR\clio-desktop.exe" --prepare-runtime'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_ICONSTOP|MB_OK "CLIO could not install its bundled runtime. The installation will stop so the application is not left partially configured."
    Abort
  ${EndIf}
  DetailPrint "CLIO runtime installed."

  ; Infrastructure choices are requests, not Desktop-owned service actions.
  ; The managed CLIO applies this request after its API is ready, using the
  ; same durable driver, progress, recovery, and ownership model as the UI.
  ${If} $ClioInstallWebSearch == "1"
    StrCpy $ClioWebSearchStatus "requested"
    !insertmacro CLIO_WRITE_INSTALLER_OPTIONS
    DetailPrint "CLIO Search will be installed by CLIO on first launch."
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro CLIO_STOP_MANAGED_RUNTIME
  !insertmacro CLIO_REMOVE_MANAGED_STORAGE
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Keep this as a final idempotent sweep in case Windows released a loaded
  ; runtime file only after the generated uninstall section ran.
  !insertmacro CLIO_REMOVE_MANAGED_STORAGE
  ${If} $ClioRemoveUserData == ${BST_CHECKED}
    RMDir /r "$INSTDIR\data"
    RMDir /r "$LOCALAPPDATA\${BUNDLEID}"
    RMDir /r "$APPDATA\${BUNDLEID}"
  ${EndIf}
  RMDir "$INSTDIR"
!macroend
