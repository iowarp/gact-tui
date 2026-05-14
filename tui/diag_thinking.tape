# Verify: (a) "thinking…" appears mid-turn before assistant replies,
# (b) Settings → Change provider… opens the LM-config modal.
Output "/tmp/gact-diag-thinking.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms

# Send a message and screenshot ~600ms in, before the LM has replied.
Type "what is the schema of /tmp/example.parquet?"
Sleep 200ms
Enter
Sleep 600ms
Screenshot "/home/jcernuda/tui/screenshots/diag_thinking_indicator.png"

# Wait for the turn to complete.
Sleep 14000ms

# Now open Settings → Model → Change provider…
Ctrl+S
Sleep 2000ms
# modelSel starts at 0; press Up to land on the Change provider… row (-1).
Up
Sleep 300ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/diag_lmconfig_from_settings.png"
Sleep 300ms
Escape
Sleep 200ms
Type "q"
