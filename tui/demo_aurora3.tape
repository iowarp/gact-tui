# Aurora iter 3 — surfaces still untouched.
Output "/tmp/gact-demo3.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms

# 1. Theme picker — Ctrl+S → Tab Tab to Theme tab
Ctrl+S
Sleep 800ms
Tab
Sleep 200ms
Tab
Sleep 200ms
Screenshot "/home/jcernuda/tui/screenshots/aurora3_01_theme_tab.png"
Sleep 200ms
Escape
Sleep 300ms

# 2. /optimize — should land a visible "not wired" message
Type "/optimize"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/aurora3_02_optimize.png"

# 3. Switch to PLAN-MODE-TEST session and propose+attempt apply
# Tab to sidebar, navigate down to find PLAN-MODE-TEST
Tab
Sleep 300ms
# It's at the top usually, or k/G — let's just G to last and walk back
Type "G"
Sleep 300ms
# Go up by 'k' until we land on it. Plan-mode session is a few up.
Type "k"
Sleep 200ms
Type "k"
Sleep 200ms
Type "k"
Sleep 200ms
Screenshot "/home/jcernuda/tui/screenshots/aurora3_03_navigated.png"

# Switch focus to input + propose an edit on plan-mode session
Tab
Sleep 200ms
Tab
Sleep 200ms
Type "propose an edit to /home/jcernuda/tui/clio-agent/scratch-perm.txt -- replace the content with bye"
Sleep 200ms
Enter
Sleep 10000ms
Screenshot "/home/jcernuda/tui/screenshots/aurora3_04_plan_propose.png"

# Tab to body, attempt apply — should be auto-denied
Tab
Sleep 200ms
Tab
Sleep 200ms
Type "a"
Sleep 2000ms
Screenshot "/home/jcernuda/tui/screenshots/aurora3_05_plan_apply_denied.png"

Sleep 200ms
Type "q"
