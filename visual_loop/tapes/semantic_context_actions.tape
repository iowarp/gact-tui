Output "visual_loop/screenshots/semantic_context_actions.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_context_drilldown.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /CONTEXT/
Sleep 500ms

Tab
Sleep 200ms
Right
Sleep 200ms
Down
Sleep 200ms
Type "m"
Wait+Screen /Open detail|Copy path/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_context_actions.png"

Type "q"
