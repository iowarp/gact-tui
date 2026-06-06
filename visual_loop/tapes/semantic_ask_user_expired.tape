Output "visual_loop/screenshots/semantic_ask_user_expired.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_ask_user_expired.sh"
Enter
Show

Wait+Screen /Ready to exercise ask-user expiry state/
Wait+Screen /This routing question will time out before the operator answers/
Wait+Screen /Answer agent question/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_ask_user_expiring_prompt.png"

Wait+Screen / idle /
Sleep 500ms
Wait+Screen /expired/
Screenshot "visual_loop/screenshots/semantic_ask_user_expired.png"

Type "q"
