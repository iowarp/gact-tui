; ---------------------------------------------------------------------------
; Recommended-provider guidance for the installer's "Model providers" page
; (ClioProvidersPage in installer-hooks.nsh, which !includes this file).
;
; A few providers carry a "★ Recommended" marker and a "Why?" link that
; explains the recommendation in a real Win32 tooltip (TOOLTIPS_CLASS, built
; through the System plugin; one tool per link). Clicking the link shows the
; same text in a message box, so keyboard users can read it too. The page
; creates its own fonts from the wizard's dialog font and frees them, and
; destroys the tooltip, once nsDialogs::Show returns (the page has closed).
; ---------------------------------------------------------------------------
!define CLIO_WHY_SUBSCRIPTION "Accessible, powerful frontier models on an affordable subscription."
!define CLIO_WHY_OPENROUTER "Wide access to a large collection of models, many of them free. Our recommended free way into CLIO."
!define CLIO_WHY_OLLAMA "Easiest local setup."
!define CLIO_WHY_LLAMACPP "Best capabilities on a single machine or for a single user. On shared infrastructure (a cluster or a team server), vLLM is usually the better fit."

!define /ifndef TTM_SETDELAYTIME 0x0403
!define /ifndef TTM_SETMAXTIPWIDTH 0x0418
!define /ifndef TTM_ADDTOOLW 0x0432
!define /ifndef TTDT_AUTOPOP 2
!define /ifndef TTDT_INITIAL 3

Var ClioProvidersDialog
Var ClioProvidersTooltip
Var ClioProvidersHeadingFont
Var ClioProvidersLinkFont
Var ClioProvidersStarFont
Var ClioWhyCodexLink
Var ClioWhyClaudeCodeLink
Var ClioWhyOllamaLink
Var ClioWhyLlamaCppLink
Var ClioWhyOpenRouterLink
; Scratch state for the layout helpers below (x position in pixels, row y in
; dialog units, the tooltip text of the row being built, a control's height).
Var ClioRecX
Var ClioRecY
Var ClioRecTip
Var ClioRecGap
Var ClioFitHeight
Var ClioFitTop
Var ClioFitAscent
Var ClioRecAscent

; Create a font from the wizard's dialog font, so it follows the installer's
; DPI. In: $R0 face ("" keeps the dialog face), $R1 height in percent of the
; dialog font, $R2 weight, $R3 underline (0/1). Out: $R9 HFONT, which the
; caller must DeleteObject. Clobbers $R0 and $R4-$R6.
Function ClioDeriveFont
  SendMessage $HWNDPARENT ${WM_GETFONT} 0 0 $R4
  System::Alloc 92 ; sizeof(LOGFONTW)
  Pop $R5
  System::Call 'gdi32::GetObjectW(p R4, i 92, p R5) i'
  System::Call '*$R5(i .R6)'
  ${If} $R0 == ""
    System::Call '*$R5(i, i, i, i, i, i, i, &w32 .R0)'
  ${EndIf}
  System::Free $R5
  IntOp $R6 $R6 * $R1
  IntOp $R6 $R6 / 100
  System::Call 'gdi32::CreateFontW(i R6, i 0, i 0, i 0, i R2, i 0, i R3, i 0, i 1, i 0, i 0, i 0, i 0, w R0) p .R9'
FunctionEnd

; In: $R0 control. Out: $R4 left, $R5 top, $R6 right, $R7 bottom, in pixels
; relative to the providers page. Clobbers $R8.
Function ClioControlRect
  System::Call '*(i, i, i, i) p .R8'
  System::Call 'user32::GetWindowRect(p R0, p R8)'
  System::Call 'user32::MapWindowPoints(p 0, p $ClioProvidersDialog, p R8, i 2)'
  System::Call '*$R8(i .R4, i .R5, i .R6, i .R7)'
  System::Free $R8
FunctionEnd

; Shrink a label or link to the width of its own text in its own font, so the
; next control can sit right after it and a link's hover area is just its
; text. In: $R0 control, $R1 extra pixels of width. Out: $R6 right edge in
; page pixels, $ClioFitTop its top, $ClioFitAscent its font's ascent.
; Clobbers $R2-$R9.
Function ClioFitToText
  Call ClioControlRect
  StrCpy $R9 $R4
  StrCpy $ClioFitTop $R5
  IntOp $ClioFitHeight $R7 - $R5
  System::Call 'user32::GetWindowTextW(p R0, w .R2, i ${NSIS_MAX_STRLEN})'
  StrLen $R3 $R2
  SendMessage $R0 ${WM_GETFONT} 0 0 $R4
  System::Call 'user32::GetDC(p R0) p .R5'
  System::Call 'gdi32::SelectObject(p R5, p R4) p .R6'
  System::Call '*(i, i) p .R7'
  System::Call 'gdi32::GetTextExtentPoint32W(p R5, w R2, i R3, p R7)'
  System::Call '*(&i60) p .R8' ; TEXTMETRICW
  System::Call 'gdi32::GetTextMetricsW(p R5, p R8)'
  System::Call '*$R8(i, i .s)'
  Pop $ClioFitAscent
  System::Free $R8
  System::Call 'gdi32::SelectObject(p R5, p R6)'
  System::Call 'user32::ReleaseDC(p R0, p R5)'
  System::Call '*$R7(i .R8, i)'
  System::Free $R7
  IntOp $R8 $R8 + $R1
  System::Call 'user32::SetWindowPos(p R0, p 0, i 0, i 0, i R8, i $ClioFitHeight, i 0x16)' ; SWP_NOMOVE|SWP_NOZORDER|SWP_NOACTIVATE
  IntOp $R6 $R9 + $R8
FunctionEnd

; Add a "★ Recommended  Why?" row under a provider checkbox, indented to the
; checkbox's text. In: $R0 checkbox, $R1 row y (dialog units, e.g. "27u"),
; $R2 the "Why?" text. Out: $R0 the "Why?" link. Clobbers $R1-$R9.
Function ClioAddRecommendation
  StrCpy $ClioRecY $R1
  StrCpy $ClioRecTip $R2
  Call ClioControlRect
  ; 11u lines the row up with the checkbox text; 4u separates "Why?".
  System::Call '*(i 11, i 0, i 4, i 0) p .R8'
  System::Call 'user32::MapDialogRect(p $ClioProvidersDialog, p R8)'
  System::Call '*$R8(i .R9, i, i .R3)'
  System::Free $R8
  IntOp $ClioRecX $R4 + $R9
  StrCpy $ClioRecGap $R3

  ${NSD_CreateLabel} $ClioRecX $ClioRecY 20u 9u "${U+2605}"
  Pop $R0
  SendMessage $R0 ${WM_SETFONT} $ClioProvidersStarFont 1
  SetCtlColors $R0 0xB07800 transparent
  StrCpy $R1 1
  Call ClioFitToText
  IntOp $ClioRecX $R6 + 1

  ${NSD_CreateLabel} $ClioRecX $ClioRecY 70u 9u "Recommended"
  Pop $R0
  StrCpy $R1 1
  Call ClioFitToText
  IntOp $ClioRecX $R6 + $ClioRecGap
  StrCpy $ClioRecAscent $ClioFitAscent

  ${NSD_CreateLink} $ClioRecX $ClioRecY 30u 9u "Why?"
  Pop $R0
  SendMessage $R0 ${WM_SETFONT} $ClioProvidersLinkFont 1
  StrCpy $R1 4
  Call ClioFitToText
  ; The smaller link font would sit high; drop it onto the row's baseline,
  ; keeping its bottom inside the row.
  IntOp $R2 $ClioRecAscent - $ClioFitAscent
  IntOp $R3 $ClioFitTop + $R2
  IntOp $R4 $ClioFitHeight - $R2
  IntOp $R5 $R6 - $ClioRecX
  System::Call 'user32::SetWindowPos(p R0, p 0, i $ClioRecX, i R3, i R5, i R4, i 0x14)' ; SWP_NOZORDER|SWP_NOACTIVATE
  ${NSD_OnClick} $R0 ClioShowRecommendationWhy

  ; One tooltip tool per link: TTF_IDISHWND|TTF_SUBCLASS lets the tooltip
  ; watch the link's own mouse messages. The control copies the text, so the
  ; buffer is freed straight away.
  System::Call '*(&w${NSIS_MAX_STRLEN} "$ClioRecTip") p .R8'
  System::Call '*(&l4, i 0x11, p $ClioProvidersDialog, p R0, i 0, i 0, i 0, i 0, p 0, p R8, p 0) p .R7'
  SendMessage $ClioProvidersTooltip ${TTM_ADDTOOLW} 0 $R7
  System::Free $R7
  System::Free $R8
FunctionEnd

; "Why?" click: show the same explanation as the tooltip.
Function ClioShowRecommendationWhy
  Pop $R0
  ${If} $R0 == $ClioWhyOllamaLink
    MessageBox MB_ICONINFORMATION|MB_OK "Ollama: ${CLIO_WHY_OLLAMA}"
  ${ElseIf} $R0 == $ClioWhyLlamaCppLink
    MessageBox MB_ICONINFORMATION|MB_OK "llama.cpp: ${CLIO_WHY_LLAMACPP}"
  ${ElseIf} $R0 == $ClioWhyOpenRouterLink
    MessageBox MB_ICONINFORMATION|MB_OK "OpenRouter: ${CLIO_WHY_OPENROUTER}"
  ${ElseIf} $R0 == $ClioWhyCodexLink
    MessageBox MB_ICONINFORMATION|MB_OK "OpenAI Codex: ${CLIO_WHY_SUBSCRIPTION}"
  ${ElseIf} $R0 == $ClioWhyClaudeCodeLink
    MessageBox MB_ICONINFORMATION|MB_OK "Claude Code: ${CLIO_WHY_SUBSCRIPTION}"
  ${EndIf}
FunctionEnd

!macro CLIO_RECOMMEND _CHECKBOX _Y _WHY _LINK
  StrCpy $R0 ${_CHECKBOX}
  StrCpy $R1 "${_Y}"
  StrCpy $R2 "${_WHY}"
  Call ClioAddRecommendation
  StrCpy ${_LINK} $R0
!macroend
