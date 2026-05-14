# Aurora demo iter 2 — surfaces not covered in iter 1.
Output "/tmp/gact-demo2.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms
Ctrl+N
Sleep 800ms

# 1. real chat reply (not intercept) — short factual question
Type "name three popular HDF5 chunk shapes for 1D timeseries"
Sleep 200ms
Enter
Sleep 12000ms
Screenshot "/home/jcernuda/tui/screenshots/aurora2_01_chat_reply.png"

# 2. /diff (workspace git diff) — should show many uncommitted changes
Sleep 500ms
Type "/diff"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/aurora2_02_diff.png"

# 3. /copy (clipboard) — should copy last assistant reply
Sleep 500ms
Type "/copy"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/aurora2_03_copy.png"

# 4. /compact — summarise the conversation
Sleep 500ms
Type "/compact"
Sleep 200ms
Enter
Sleep 8000ms
Screenshot "/home/jcernuda/tui/screenshots/aurora2_04_compact.png"

# 5. Help modal (?)
Sleep 500ms
Tab
Sleep 200ms
Type "?"
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/aurora2_05_help.png"
Sleep 200ms
Escape
Sleep 300ms

# 6. /clear — two-step confirm
Type "/clear"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/aurora2_06_clear_armed.png"

# 7. Confirm clear
Type "/clear"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/aurora2_07_clear_done.png"

Sleep 200ms
Type "q"
