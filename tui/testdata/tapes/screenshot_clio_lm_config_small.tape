# CLIO provider picker at a shorter viewport, used to verify the 2x2
# modal compresses without fixed-height overflow.
Output "screenshots/clio_lm_config_small.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1200
Set Height 560
Env GACT_NO_INTRO "1"

Hide
Type "gact"
Enter
Show

Sleep 6500ms
Screenshot "screenshots/clio_lm_config_small.png"

Sleep 500ms
Type "q"
