Output "/tmp/gact-workspace.gif"

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

# Workspace switcher modal — emulator only seeds ws_default, but the
# modal still renders so we capture the empty/single-workspace state.
Ctrl+w
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/17-workspace-switcher.png"
Escape

Sleep 200ms
