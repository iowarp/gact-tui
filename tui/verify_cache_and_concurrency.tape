# Two focused checks: /cache-stats produces a visible message + Settings
# opens fast while a turn is in flight.
Output "/tmp/gact-verify2.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms

# Cache-stats: open palette, type, enter, wait long enough for SSE to deliver
# the synthetic message.created event, then screenshot.
Type "/cache-stats"
Sleep 400ms
Enter
Sleep 3000ms
Screenshot "/home/jcernuda/tui/screenshots/verify_cache_stats_v2.png"

Sleep 400ms

# Concurrency: kick off a slow turn, immediately open Settings, screenshot
# while turn is in flight.
Type "explain hdf5 chunk sizing in 4 sentences"
Sleep 200ms
Enter
Sleep 1500ms
Ctrl+S
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/verify_concurrency_settings.png"
Escape
Sleep 8000ms

Type "q"
