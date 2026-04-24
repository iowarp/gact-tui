# CLIO-BBBBBBBBBB29: assistant proposes a file_diff.
Output "/tmp/gact-clio-diff.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Sleep 1500ms
Type "propose an edit to example.py"
Enter
Sleep 3500ms
Screenshot "/home/jcernuda/tui/screenshots/clio_diff.png"

Sleep 400ms
Type "q"
