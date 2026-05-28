Output "visual_loop/screenshots/semantic_sidebar_layout_settings.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_sidebar_layout_settings.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 500ms

Ctrl+S
Wait+Screen /Settings/
Tab
Tab
Tab
Wait+Screen /Display preferences/
Down
Down
Down
Down
Down
Down
Right
Wait+Screen /context sidebar/
Wait+Screen /right/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_sidebar_layout_settings.png"

Type "q"
