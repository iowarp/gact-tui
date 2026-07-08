Output "/tmp/gact-verify-apply.gif"
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

# Apply that should SUCCEED — file is inside workspace root.
Type "propose an edit to /home/jcernuda/tui/clio-agent/scratch-perm.txt -- change hello to bye"
Sleep 200ms
Enter
Sleep 8000ms

# Tab to body pane, then 'a'.
Tab
Sleep 200ms
Tab
Sleep 200ms
Type "a"
Sleep 2000ms
Screenshot "/home/jcernuda/tui/screenshots/verify_apply_success.png"

Sleep 200ms
Type "q"
