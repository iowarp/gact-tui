Output "visual_loop/screenshots/semantic_memory_unavailable.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_memory_unavailable.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms
Type "/"
Sleep 150ms
Type "memory"
Wait+Screen /unsupported/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_memory_unavailable_palette.png"

Type "q"
