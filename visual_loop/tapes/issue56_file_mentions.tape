Output "visual_loop/screenshots/issue56_file_mentions.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 820

Hide
Type "./tui/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Wait+Screen /SESSIONS/

Ctrl+n
Wait+Screen /CONVERSATION/

Type "Please inspect "
Type "@"
Wait+Screen /Insert file reference/
Type "store"
Wait+Screen /store.go/
Screenshot "visual_loop/screenshots/issue56_file_mentions_picker.png"

Enter
Wait+Screen /@internal/
Screenshot "visual_loop/screenshots/issue56_file_mentions_composer.png"

Enter
Wait+Screen /Please inspect internal/
Screenshot "visual_loop/screenshots/issue56_file_mentions_sent.png"

Type "q"
