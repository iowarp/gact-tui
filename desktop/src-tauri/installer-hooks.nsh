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
; Remembered checked/unchecked state ("0"/"1") per provider, so the page
; restores the user's previous selection instead of resetting to hardcoded
; defaults whenever the wizard revisits it (Back then Next). Vars start empty,
; which the restore macro treats the same as "0" (unchecked) — matching the
; "nothing pre-checked" first-show state below.
Var ClioProviderCodexChecked
Var ClioProviderClaudeCodeChecked
Var ClioProviderOpenAIChecked
Var ClioProviderAnthropicChecked
Var ClioProviderGeminiChecked
Var ClioProviderVertexChecked
Var ClioProviderLMStudioChecked
Var ClioProviderOllamaChecked
Var ClioProviderLlamaCppChecked
Var ClioProviderVllmChecked
Var ClioProviderArgonneSophiaChecked
Var ClioProviderArgonneMetisChecked
Var ClioProviderAzureOpenAIChecked
Var ClioProviderBedrockChecked
Var ClioProviderNvidiaNimChecked
Var ClioProviderOpenRouterChecked
Var ClioInstallWebSearch
Var ClioInstallLlamaCpp
Var ClioWebSearchStatus
Var ClioLlamaCppStatus
Var ClioProviderIds
; Stamped once per real (non-passive/non-update) install/reinstall so the web
; layer can apply installer provider visibility exactly once per install and
; never again overwrite a later Settings/picker change (see
; applyInstallerProviderVisibility's apply-once revision check).
Var ClioInstalledAt

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

; Restore this checkbox to whichever state ClioProvidersPageLeave last
; remembered for it ("1" checked / anything else, incl. never-set, unchecked).
; Used instead of a hardcoded NSD_Check/NSD_Uncheck so the page never resets a
; choice the user already made on an earlier pass through the wizard.
!macro CLIO_RESTORE_PROVIDER_CHECKBOX _CHECKBOX _REMEMBERED
  ${If} ${_REMEMBERED} == "1"
    ${NSD_Check} ${_CHECKBOX}
  ${Else}
    ${NSD_Uncheck} ${_CHECKBOX}
  ${EndIf}
!macroend

; Record this checkbox's current state so a later CLIO_RESTORE_PROVIDER_CHECKBOX
; call (on a re-shown page) reproduces it.
!macro CLIO_REMEMBER_PROVIDER_CHECKBOX _CHECKBOX _REMEMBERED
  ${NSD_GetState} ${_CHECKBOX} $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy ${_REMEMBERED} "1"
  ${Else}
    StrCpy ${_REMEMBERED} "0"
  ${EndIf}
!macroend

; All 16 CLIO_REMEMBER_PROVIDER_CHECKBOX calls in one place, shared by
; ClioProvidersPageLeave (Next) and ClioProvidersPageOnBack (Back) so both
; directions capture the same on-screen state the same way.
!macro CLIO_REMEMBER_ALL_PROVIDERS
  !insertmacro CLIO_REMEMBER_PROVIDER_CHECKBOX $ClioProviderCodexCheckbox $ClioProviderCodexChecked
  !insertmacro CLIO_REMEMBER_PROVIDER_CHECKBOX $ClioProviderClaudeCodeCheckbox $ClioProviderClaudeCodeChecked
  !insertmacro CLIO_REMEMBER_PROVIDER_CHECKBOX $ClioProviderOpenAICheckbox $ClioProviderOpenAIChecked
  !insertmacro CLIO_REMEMBER_PROVIDER_CHECKBOX $ClioProviderAnthropicCheckbox $ClioProviderAnthropicChecked
  !insertmacro CLIO_REMEMBER_PROVIDER_CHECKBOX $ClioProviderGeminiCheckbox $ClioProviderGeminiChecked
  !insertmacro CLIO_REMEMBER_PROVIDER_CHECKBOX $ClioProviderVertexCheckbox $ClioProviderVertexChecked
  !insertmacro CLIO_REMEMBER_PROVIDER_CHECKBOX $ClioProviderLMStudioCheckbox $ClioProviderLMStudioChecked
  !insertmacro CLIO_REMEMBER_PROVIDER_CHECKBOX $ClioProviderOllamaCheckbox $ClioProviderOllamaChecked
  !insertmacro CLIO_REMEMBER_PROVIDER_CHECKBOX $ClioProviderLlamaCppCheckbox $ClioProviderLlamaCppChecked
  !insertmacro CLIO_REMEMBER_PROVIDER_CHECKBOX $ClioProviderVllmCheckbox $ClioProviderVllmChecked
  !insertmacro CLIO_REMEMBER_PROVIDER_CHECKBOX $ClioProviderArgonneSophiaCheckbox $ClioProviderArgonneSophiaChecked
  !insertmacro CLIO_REMEMBER_PROVIDER_CHECKBOX $ClioProviderArgonneMetisCheckbox $ClioProviderArgonneMetisChecked
  !insertmacro CLIO_REMEMBER_PROVIDER_CHECKBOX $ClioProviderAzureOpenAICheckbox $ClioProviderAzureOpenAIChecked
  !insertmacro CLIO_REMEMBER_PROVIDER_CHECKBOX $ClioProviderBedrockCheckbox $ClioProviderBedrockChecked
  !insertmacro CLIO_REMEMBER_PROVIDER_CHECKBOX $ClioProviderNvidiaNimCheckbox $ClioProviderNvidiaNimChecked
  !insertmacro CLIO_REMEMBER_PROVIDER_CHECKBOX $ClioProviderOpenRouterCheckbox $ClioProviderOpenRouterChecked
!macroend

; nsDialogs only invokes a custom page's Leave function (ClioProvidersPageLeave
; below) when the user clicks Next. Clicking Back skips it entirely, so
; without this dedicated callback, ticks made just before Back would be lost
; the next time this page is shown — CLIO_RESTORE_PROVIDER_CHECKBOX would
; restore the stale state from the last successful Next instead. ${NSD_OnBack}
; (nsDialogs.nsh) registers a function that runs specifically on Back.
Function ClioProvidersPageOnBack
  !insertmacro CLIO_REMEMBER_ALL_PROVIDERS
FunctionEnd

Function ClioProvidersPage
  !insertmacro CLIO_SKIP_SETUP_PAGE_IF_UNATTENDED

  !insertmacro MUI_HEADER_TEXT "Model providers" "Choose which providers CLIO shows."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_OnBack} ClioProvidersPageOnBack

  ; Compact three-column groups keep every choice above the wizard footer at
  ; Windows' default DPI. Providers are individual choices: selecting an API
  ; provider never silently exposes its separate subscription/CLI product.
  ; Nothing is pre-checked: the owner wants installs to stop and make the
  ; user actively choose at least one provider (ClioProvidersPageLeave
  ; enforces that). Each checkbox restores whatever the user chose the last
  ; time this page was shown, via ClioProviderXChecked.
  CreateFont $2 "$(^Font)" "$(^FontSize)" "700"
  ${NSD_CreateLabel} 0 0 31% 12u "Subscription"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $2 0
  ${NSD_CreateCheckbox} 0 16u 31% 12u "OpenAI Codex"
  Pop $ClioProviderCodexCheckbox
  !insertmacro CLIO_RESTORE_PROVIDER_CHECKBOX $ClioProviderCodexCheckbox $ClioProviderCodexChecked
  ${NSD_CreateCheckbox} 0 32u 31% 12u "Claude Code"
  Pop $ClioProviderClaudeCodeCheckbox
  !insertmacro CLIO_RESTORE_PROVIDER_CHECKBOX $ClioProviderClaudeCodeCheckbox $ClioProviderClaudeCodeChecked

  ${NSD_CreateLabel} 0 56u 31% 12u "Direct APIs"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $2 0
  ${NSD_CreateCheckbox} 0 72u 31% 12u "OpenAI API"
  Pop $ClioProviderOpenAICheckbox
  !insertmacro CLIO_RESTORE_PROVIDER_CHECKBOX $ClioProviderOpenAICheckbox $ClioProviderOpenAIChecked
  ${NSD_CreateCheckbox} 0 88u 31% 12u "Anthropic API"
  Pop $ClioProviderAnthropicCheckbox
  !insertmacro CLIO_RESTORE_PROVIDER_CHECKBOX $ClioProviderAnthropicCheckbox $ClioProviderAnthropicChecked
  ${NSD_CreateCheckbox} 0 104u 31% 12u "Google Gemini"
  Pop $ClioProviderGeminiCheckbox
  !insertmacro CLIO_RESTORE_PROVIDER_CHECKBOX $ClioProviderGeminiCheckbox $ClioProviderGeminiChecked
  ${NSD_CreateCheckbox} 0 120u 31% 12u "Google Vertex AI"
  Pop $ClioProviderVertexCheckbox
  !insertmacro CLIO_RESTORE_PROVIDER_CHECKBOX $ClioProviderVertexCheckbox $ClioProviderVertexChecked

  ${NSD_CreateLabel} 34% 0 31% 12u "Local / self-hosted"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $2 0
  ${NSD_CreateCheckbox} 34% 16u 31% 12u "LM Studio"
  Pop $ClioProviderLMStudioCheckbox
  !insertmacro CLIO_RESTORE_PROVIDER_CHECKBOX $ClioProviderLMStudioCheckbox $ClioProviderLMStudioChecked
  ${NSD_CreateCheckbox} 34% 32u 31% 12u "Ollama"
  Pop $ClioProviderOllamaCheckbox
  !insertmacro CLIO_RESTORE_PROVIDER_CHECKBOX $ClioProviderOllamaCheckbox $ClioProviderOllamaChecked
  ${NSD_CreateCheckbox} 34% 48u 31% 12u "llama.cpp"
  Pop $ClioProviderLlamaCppCheckbox
  !insertmacro CLIO_RESTORE_PROVIDER_CHECKBOX $ClioProviderLlamaCppCheckbox $ClioProviderLlamaCppChecked
  ${NSD_CreateCheckbox} 34% 64u 31% 12u "vLLM"
  Pop $ClioProviderVllmCheckbox
  !insertmacro CLIO_RESTORE_PROVIDER_CHECKBOX $ClioProviderVllmCheckbox $ClioProviderVllmChecked

  ${NSD_CreateLabel} 34% 88u 31% 12u "Argonne ALCF"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $2 0
  ${NSD_CreateCheckbox} 34% 104u 31% 12u "Sophia"
  Pop $ClioProviderArgonneSophiaCheckbox
  !insertmacro CLIO_RESTORE_PROVIDER_CHECKBOX $ClioProviderArgonneSophiaCheckbox $ClioProviderArgonneSophiaChecked
  ${NSD_CreateCheckbox} 34% 120u 31% 12u "Metis"
  Pop $ClioProviderArgonneMetisCheckbox
  !insertmacro CLIO_RESTORE_PROVIDER_CHECKBOX $ClioProviderArgonneMetisCheckbox $ClioProviderArgonneMetisChecked

  ${NSD_CreateLabel} 68% 0 32% 12u "Other clouds"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $2 0
  ${NSD_CreateCheckbox} 68% 16u 32% 12u "Azure OpenAI"
  Pop $ClioProviderAzureOpenAICheckbox
  !insertmacro CLIO_RESTORE_PROVIDER_CHECKBOX $ClioProviderAzureOpenAICheckbox $ClioProviderAzureOpenAIChecked
  ${NSD_CreateCheckbox} 68% 32u 32% 12u "Amazon Bedrock"
  Pop $ClioProviderBedrockCheckbox
  !insertmacro CLIO_RESTORE_PROVIDER_CHECKBOX $ClioProviderBedrockCheckbox $ClioProviderBedrockChecked
  ${NSD_CreateCheckbox} 68% 48u 32% 12u "NVIDIA NIM"
  Pop $ClioProviderNvidiaNimCheckbox
  !insertmacro CLIO_RESTORE_PROVIDER_CHECKBOX $ClioProviderNvidiaNimCheckbox $ClioProviderNvidiaNimChecked
  ${NSD_CreateCheckbox} 68% 64u 32% 12u "OpenRouter"
  Pop $ClioProviderOpenRouterCheckbox
  !insertmacro CLIO_RESTORE_PROVIDER_CHECKBOX $ClioProviderOpenRouterCheckbox $ClioProviderOpenRouterChecked

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
  !insertmacro CLIO_REMEMBER_ALL_PROVIDERS

  ; Stop the wizard here until the user picks at least one provider — an
  ; empty selection used to sail through silently (see NSIS_HOOK_PREINSTALL's
  ; deleted "codex,openai" fallback) and the owner wants installs to force a
  ; deliberate choice instead.
  ${If} $ClioProviderIds == ""
    MessageBox MB_ICONEXCLAMATION "Choose at least one model provider to continue. CLIO needs at least one provider selected so it has something to show."
    Abort
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

; Report the stop helper's typed outcome. $0 is nsExec's status ("timeout",
; "error", or the exit code) and $1 its output, whose last line is the
; helper's own `result=...` reason.
!macro CLIO_REPORT_RUNTIME_STOP
  ${If} $0 == "timeout"
    DetailPrint "CLIO managed-runtime stop: result=timeout after 60 seconds"
  ${ElseIf} $0 == "error"
    DetailPrint "CLIO managed-runtime stop: result=helper_not_started"
  ${ElseIf} $0 != 0
    DetailPrint "CLIO managed-runtime stop: exit=$0 $1"
  ${Else}
    DetailPrint "CLIO managed-runtime stop: $1"
  ${EndIf}
!macroend

; Upgrade path. The stop helper is the NEW clio-desktop.exe, embedded in this
; installer and extracted to $PLUGINSDIR, never the installed one: an older
; installed binary (0.9.4.17 and earlier) does not know
; `--stop-managed-runtime`, treats it as an ordinary launch, and starts the
; full application, which nsExec then waits on forever. The helper
; (installer_runtime_stop.rs) stops only CLIO-managed processes
; (clio-desktop.exe, clio-agent.exe, python.exe, clio_run.exe) whose
; executable lives under $INSTDIR, asks a managed clio_run.exe to stop
; cleanly, then terminates what remains and waits on each handle within its
; own bounded budget. nsExec's /TIMEOUT bounds the whole step as well. A
; failure is reported with its typed reason and is not fatal: the retrying
; directory swap in `runtime_pack.rs` / `installer_dir_swap.rs` is the
; correctness backstop for anything that outlives the sweep. A fresh install
; has nothing to stop.
!macro CLIO_STOP_MANAGED_RUNTIME
  ${If} ${FileExists} "$INSTDIR\clio-desktop.exe"
    DetailPrint "Stopping CLIO's managed runtime..."
    InitPluginsDir
    File "/oname=$PLUGINSDIR\clio-runtime-stop.exe" "${MAINBINARYSRCPATH}"
    nsExec::ExecToStack /TIMEOUT=60000 '"$PLUGINSDIR\clio-runtime-stop.exe" --stop-managed-runtime "$INSTDIR"'
    Pop $0
    Pop $1
    !insertmacro CLIO_REPORT_RUNTIME_STOP
    Delete "$PLUGINSDIR\clio-runtime-stop.exe"
  ${EndIf}
!macroend

; Uninstall path. The uninstaller was written by the same installer run as
; $INSTDIR\clio-desktop.exe, so that binary is exactly the version that knows
; this flag; no copy is embedded in the uninstaller.
!macro CLIO_STOP_MANAGED_RUNTIME_FOR_UNINSTALL
  ${If} ${FileExists} "$INSTDIR\clio-desktop.exe"
    DetailPrint "Stopping CLIO's managed runtime..."
    nsExec::ExecToStack /TIMEOUT=60000 '"$INSTDIR\clio-desktop.exe" --stop-managed-runtime "$INSTDIR"'
    Pop $0
    Pop $1
    !insertmacro CLIO_REPORT_RUNTIME_STOP
  ${EndIf}
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
  FileWrite $2 '$\",$\"installed_at$\":$\"'
  FileWrite $2 $ClioInstalledAt
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
    ; the same recommended infrastructure defaults the page shows (Search on,
    ; local runtime off). Providers are different: nobody was asked, so
    ; $ClioProviderIds stays "" ("no installer preference"). The web layer
    ; reads an empty/absent provider selection as "leave visibility
    ; untouched" (every provider visible) rather than silently guessing
    ; codex+openai.
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
    ; One timestamp per real install/reinstall, shared by every
    ; CLIO_WRITE_INSTALLER_OPTIONS call in this run (see POSTINSTALL below),
    ; so the web layer can tell "a new install happened" from "the same
    ; install's options file was rewritten" and apply provider visibility
    ; exactly once per install. $R0-$R6 are saved/restored around GetTime:
    ; this macro is inserted into Tauri's generated install Section, whose
    ; surrounding template code is outside our control and may hold its own
    ; state in those registers across this point.
    Push $R0
    Push $R1
    Push $R2
    Push $R3
    Push $R4
    Push $R5
    Push $R6
    ${GetTime} "" "L" $R0 $R1 $R2 $R3 $R4 $R5 $R6
    StrCpy $ClioInstalledAt "$R2$R1$R0$R4$R5$R6"
    Pop $R6
    Pop $R5
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R1
    Pop $R0
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
    ; $1 is the helper's stderr: the real error, then where its log was saved.
    ; The helper also records the brand's new-issue URL next to that log so
    ; the user can report the failure with the log attached.
    StrCpy $2 ""
    ${If} ${FileExists} "$INSTDIR\data\runtime-install-issue-url.txt"
      FileOpen $3 "$INSTDIR\data\runtime-install-issue-url.txt" r
      FileRead $3 $2
      FileClose $3
    ${EndIf}
    ${If} $2 == ""
      MessageBox MB_ICONSTOP|MB_OK "CLIO could not install its bundled runtime:$\r$\n$\r$\n$1$\r$\n$\r$\nThe installation will stop so the application is not left partially configured."
    ${Else}
      MessageBox MB_ICONSTOP|MB_YESNO "CLIO could not install its bundled runtime:$\r$\n$\r$\n$1$\r$\n$\r$\nThe installation will stop so the application is not left partially configured.$\r$\n$\r$\nPlease report this with the log file attached. Open the issue page and the log folder now?" IDNO clio_runtime_report_done
      ExecShell "open" "$2"
      ExecShell "open" "$INSTDIR\data"
      clio_runtime_report_done:
    ${EndIf}
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
  !insertmacro CLIO_STOP_MANAGED_RUNTIME_FOR_UNINSTALL
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
