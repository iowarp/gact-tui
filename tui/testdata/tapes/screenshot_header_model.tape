Output "/tmp/gact-header-model.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND"
Enter
Show

Sleep 800ms
Wait+Screen /SESSIONS/

Type "hello"
Enter

# Wait for the assistant turn to settle so the session is fully rendered
# with the model + agent populated.
Sleep 3500ms
Screenshot "/home/jcernuda/tui/screenshots/66-header-model.png"

Sleep 300ms
Type "q"
