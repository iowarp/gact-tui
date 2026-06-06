Output "visual_loop/screenshots/semantic_tools_empty.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_empty_tools.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 600ms

Type "/tools"
Enter
Wait+Screen /No callable actions available/
Wait+Screen /i add connection/
Wait+Screen /no callable actions yet/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_tools_empty.png"

Type "q"
