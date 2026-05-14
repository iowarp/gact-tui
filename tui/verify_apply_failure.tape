Output "/tmp/gact-verify-apply-fail.gif"
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

# /tmp is outside the workspace root — apply MUST fail.
Type "propose an edit to /tmp/perm-test.txt -- change hello to bye"
Sleep 200ms
Enter
Sleep 8000ms

Tab
Sleep 200ms
Tab
Sleep 200ms
Type "a"
Sleep 2500ms
Screenshot "/home/jcernuda/tui/screenshots/verify_apply_failure.png"

Sleep 200ms
Type "q"
