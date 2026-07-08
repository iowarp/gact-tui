# CLIO provider picker with ALCF selected, used to visually verify
# OAuth/token status and model-catalog behavior.
Output "screenshots/clio_lm_config_alcf.gif"

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
Type "alcf"
Sleep 5000ms
Screenshot "screenshots/clio_lm_config_alcf.png"

Sleep 500ms
Type "q"
