# CLIO-BBBBBBBBBB-D: TUI auto-pops the LM config modal when the
# clio-agent-gact backend reports lm: unavailable on /v1/health.
Output "/tmp/gact-clio-lm-config.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Sleep 2500ms
Screenshot "/home/jcernuda/tui/screenshots/clio_lm_config.png"

Sleep 500ms
Type "q"
