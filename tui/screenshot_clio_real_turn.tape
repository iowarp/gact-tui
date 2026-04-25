# Real Claude turn against CLIO+Meridian — the headline path.
Output "/tmp/gact-real-turn.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Sleep 1500ms
# Chat-path question — heuristic routes to "chat" via "hi" rule
# fallback so the screenshot lands a real assistant reply within
# the sleep window instead of catching the running spinner.
Type "Hi! what is the best HDF5 chunk size for 3D arrays? one sentence."
Enter
Sleep 60000ms
Screenshot "/home/jcernuda/tui/screenshots/clio_real_turn.png"

Sleep 500ms
Type "q"
