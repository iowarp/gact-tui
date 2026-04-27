# Verify the new Thinking budget field is rendered in the LM-config modal.
Output "/tmp/gact-diag-think.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms
Ctrl+S
Sleep 1500ms
# Press Up so modelSel == -1 ("Change provider…") is highlighted, then Enter.
Up
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/diag_lmconfig_thinking_budget.png"
Sleep 200ms
Escape
Sleep 200ms
Type "q"
