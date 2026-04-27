# Final consolidated diag tape — captures every TUI fix in this round.
Output "/tmp/gact-diag-final.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms
Type "who are you?"
Sleep 200ms
Enter
Sleep 6000ms
Screenshot "/home/jcernuda/tui/screenshots/final_clio_identity.png"

Sleep 500ms
Type "/mcp"
Sleep 200ms
Enter
Sleep 1500ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/final_mcp_detail.png"
Sleep 300ms
Escape
Sleep 200ms
Escape
Sleep 500ms

Ctrl+S
Sleep 2000ms
Screenshot "/home/jcernuda/tui/screenshots/final_settings_model.png"
Sleep 300ms
Escape
Sleep 500ms

Type "/doctor"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/final_doctor.png"
Sleep 300ms
Escape
Sleep 500ms

Type "q"
