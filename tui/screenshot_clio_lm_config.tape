# CLIO-BBBBBBBBBB-D: TUI auto-pops the LM config modal when the
# clio-agent-gact backend reports lm: unavailable on /v1/health.
Output "screenshots/clio_lm_config.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 800
Env GACT_NO_INTRO "1"

Hide
Type "gact"
Enter
Show

Sleep 6500ms
Screenshot "screenshots/clio_lm_config.png"

Sleep 500ms
Type "q"
