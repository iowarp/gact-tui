# Aurora demo dry-run. Walk every demo-critical surface in one TUI session.
Output "/tmp/gact-demo-aurora.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms
Ctrl+N
Sleep 800ms
Screenshot "/home/jcernuda/tui/screenshots/aurora_01_fresh_session.png"

# 1. CLIO identity (intercept; should not hit Meridian)
Type "who are you?"
Sleep 200ms
Enter
Sleep 4000ms
Screenshot "/home/jcernuda/tui/screenshots/aurora_02_identity.png"

# 2. Model identity (intercept; live provider info)
Sleep 500ms
Type "what model are you?"
Sleep 200ms
Enter
Sleep 4000ms
Screenshot "/home/jcernuda/tui/screenshots/aurora_03_model_identity.png"

# 3. /doctor — backend health
Sleep 500ms
Type "/doctor"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/aurora_04_doctor.png"
Sleep 200ms
Escape
Sleep 300ms

# 4. /tools — unified catalog
Type "/tools"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/aurora_05_tools.png"
Sleep 200ms
Escape
Sleep 300ms

# 5. /mcp — server browser
Type "/mcp"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/aurora_06_mcp.png"
Sleep 200ms
Escape
Sleep 300ms

# 6. /skills — auto-loaded SKILL.md files
Type "/skills"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/aurora_07_skills.png"
Sleep 200ms
Escape
Sleep 300ms

# 7. /metrics — backend cost/latency totals
Type "/metrics"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/aurora_08_metrics.png"
Sleep 200ms
Escape
Sleep 300ms

# 8. Settings → Model picker (Ctrl+S)
Ctrl+S
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/aurora_09_settings_model.png"
Sleep 300ms
Escape
Sleep 300ms

# 9. /mode toggle (auto → chat)
Type "/mode"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/aurora_10_mode_toast.png"

# 10. Propose-edit + apply (file inside workspace)
Sleep 500ms
Type "propose an edit to /home/jcernuda/tui/clio-agent/scratch-perm.txt -- replace the content with bye"
Sleep 200ms
Enter
Sleep 10000ms
Screenshot "/home/jcernuda/tui/screenshots/aurora_11_propose_edit.png"

Tab
Sleep 200ms
Tab
Sleep 200ms
Type "a"
Sleep 2000ms
Screenshot "/home/jcernuda/tui/screenshots/aurora_12_applied.png"

Sleep 500ms
Type "q"
