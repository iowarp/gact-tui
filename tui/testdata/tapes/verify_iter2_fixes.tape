Output "/tmp/gact-vi2.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms
# Tab to sidebar focus.
Tab
Sleep 200ms
# Type / from sidebar — should now open palette, NOT enter filter.
Type "/"
Sleep 300ms
Type "clear"
Sleep 600ms
Screenshot "/home/jcernuda/tui/screenshots/verify_iter2_slash_palette.png"

Sleep 200ms
Escape
Sleep 200ms

# /diff — CWD is /home/jcernuda/tui (not a repo); should now say so.
Type "/diff"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/verify_iter2_diff_norepo.png"

Sleep 200ms
Type "q"
