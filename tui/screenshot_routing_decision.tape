Output "/tmp/gact-routing.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Sleep 1000ms
Wait+Screen /SESSIONS/

Ctrl+n
Sleep 400ms
Wait+Screen /CONVERSATION/

# Trigger the v0.2 routing scenario — emulator picks data_expert by
# keyword and emits a routing_decision part at the top of the turn.
Type "please analyze /tmp/dataset.csv"
Enter

Sleep 4500ms
Screenshot "/home/jcernuda/tui/screenshots/v0_2_routing_decision.png"

Sleep 500ms
Type "q"
