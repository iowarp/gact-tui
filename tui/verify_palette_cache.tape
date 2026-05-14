# Verify /cache-stats is reachable from the palette.
Output "/tmp/gact-verify3.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms

# Open palette + filter to cache.
Type "/"
Sleep 300ms
Type "cache"
Sleep 600ms
Screenshot "/home/jcernuda/tui/screenshots/verify_palette_cache_filter.png"

# Press Enter on the highlighted entry.
Enter
Sleep 5000ms
Screenshot "/home/jcernuda/tui/screenshots/verify_cache_stats_v3.png"

Sleep 200ms
Type "q"
