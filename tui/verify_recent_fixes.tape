# Verification sweep for the six recent fixes. Each screenshot is named
# verify_<thing>.png so we can diff against the diag_*.png baselines.
Output "/tmp/gact-verify.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms

# 1. model-identity intercept
Type "what model are you?"
Sleep 200ms
Enter
Sleep 4000ms
Screenshot "/home/jcernuda/tui/screenshots/verify_model_identity.png"

# 2. /none routing warning
Sleep 500ms
Type "what's the capital of france"
Sleep 200ms
Enter
Sleep 6000ms
Screenshot "/home/jcernuda/tui/screenshots/verify_none_warning.png"

# 3. /tools palette
Sleep 500ms
Type "/tools"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/verify_tools.png"
Sleep 300ms
Escape
Sleep 300ms

# 4. /mcp browser i key
Type "/mcp"
Sleep 200ms
Enter
Sleep 1200ms
Screenshot "/home/jcernuda/tui/screenshots/verify_mcp_browser.png"
Sleep 200ms
Type "i"
Sleep 1000ms
Screenshot "/home/jcernuda/tui/screenshots/verify_mcp_i_key.png"
Sleep 200ms
Escape
Sleep 300ms

# 5. /mcp browser d key
Type "/mcp"
Sleep 200ms
Enter
Sleep 1000ms
Type "d"
Sleep 1000ms
Screenshot "/home/jcernuda/tui/screenshots/verify_mcp_d_key.png"
Sleep 200ms
Escape
Sleep 300ms

# 6. /cache-stats produces a visible message
Type "/cache-stats"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/verify_cache_stats.png"

Sleep 300ms
Type "q"
