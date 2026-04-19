Output "/tmp/gact-interleave.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 900

Hide
Type "/tmp/gact --backend $GACT_BACKEND"
Enter
Show

Sleep 800ms
Wait+Screen /SESSIONS/

Type "many tools please"
Enter

# Wait for the rich_scripts scenario to finish all 3 calls + results.
Sleep 6500ms
Screenshot "/home/jcernuda/tui/screenshots/67-tool-interleave.png"

Sleep 300ms
Type "q"
