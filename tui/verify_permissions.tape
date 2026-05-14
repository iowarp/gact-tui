Output "/tmp/gact-verify-perms.gif"
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

Type "propose an edit to /tmp/perm-test.txt -- change hello to bye"
Sleep 200ms
Enter
Sleep 8000ms
Screenshot "/home/jcernuda/tui/screenshots/verify_perm_diff.png"

# Tab to body pane (input → sidebar → body) — 2 Tabs.
Tab
Sleep 200ms
Tab
Sleep 200ms
# Now press 'a' to apply — fires fs_apply_edit_write → permission gate
Type "a"
Sleep 2500ms
Screenshot "/home/jcernuda/tui/screenshots/verify_perm_banner.png"

# Press 'a' again to allow the pending permission.
Type "a"
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/verify_perm_allowed.png"

Sleep 200ms
Type "q"
