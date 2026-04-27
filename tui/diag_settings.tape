# Diagnostic: open Settings via Ctrl+S, screenshot Model tab loading state.
Output "/tmp/gact-diag-settings.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms
Ctrl+s
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/diag_settings_model.png"
Sleep 300ms
Escape
Sleep 200ms
Type "q"
