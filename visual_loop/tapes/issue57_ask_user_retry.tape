Output "visual_loop/screenshots/issue57_ask_user_retry.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_ask_user_retry.sh"
Enter
Show

Wait+Screen /agent question/
Wait+Screen /retry attempt/
Sleep 400ms
Screenshot "visual_loop/screenshots/issue57_ask_user_retry.png"

Type "q"
