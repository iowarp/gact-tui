# CLIO-BBBBBBBBBB29: /metrics modal against clio-agent.
Output "/tmp/gact-clio-metrics.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Sleep 1500ms
# Fire a turn to seed tokens + cost numbers.
Type "please analyze /tmp/sample.parquet"
Enter
Sleep 2500ms

# Open /metrics palette entry.
Type "/"
Sleep 300ms
Type "metrics"
Sleep 300ms
Enter
Sleep 800ms
Screenshot "/home/jcernuda/tui/screenshots/clio_metrics.png"

Sleep 400ms
Escape
Sleep 200ms
Type "q"
