Output "/tmp/gact-vpd.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms
# /sessions focuses sidebar + arms filter; type PLAN to narrow
Type "/sessions"
Sleep 200ms
Enter
Sleep 600ms
Type "PLAN"
Sleep 600ms
Screenshot "/home/jcernuda/tui/screenshots/verify_plan_filter.png"

Enter
Sleep 800ms
# Switch back to input pane
Tab
Sleep 200ms
Tab
Sleep 200ms
Type "propose an edit to /home/jcernuda/tui/clio-agent/scratch-perm.txt -- replace hello with bye"
Sleep 200ms
Enter
Sleep 10000ms
Screenshot "/home/jcernuda/tui/screenshots/verify_plan_propose.png"

# Apply attempt — should be auto-denied because session.mode = plan
Tab
Sleep 200ms
Tab
Sleep 200ms
Type "a"
Sleep 2000ms
Screenshot "/home/jcernuda/tui/screenshots/verify_plan_apply_denied.png"

Sleep 200ms
Type "q"
