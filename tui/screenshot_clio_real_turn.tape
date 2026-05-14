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
# Heuristic routes "hello" → chat path so the screenshot lands a
# real assistant reply within the sleep window instead of catching
# the running spinner. Avoid "?" — the TUI binds it to global help.
Type "Hello CLIO. Tell me in one sentence what HDF5 is."
Enter
Sleep 90000ms
Screenshot "/home/jcernuda/tui/screenshots/clio_real_turn.png"

Sleep 500ms
Type "q"
