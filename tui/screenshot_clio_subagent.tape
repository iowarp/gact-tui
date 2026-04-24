# CLIO-BBBBBBBBBB29: nanoagent spawn shows as a child session in the sidebar.
Output "/tmp/gact-clio-subagent.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Sleep 1500ms
# "split this with a sub-agent" triggers the nanoagent-spawn scenario
# in the smoke server (spawns code_reviewer subagent).
Type "split this with a sub-agent review"
Enter
Sleep 6000ms
Screenshot "/home/jcernuda/tui/screenshots/clio_subagent.png"

Sleep 400ms
Type "q"
