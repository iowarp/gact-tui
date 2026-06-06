Output "visual_loop/screenshots/semantic_memory_search.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/memory"
Enter
Wait+Screen /Memory · context/
Sleep 800ms
Screenshot "visual_loop/screenshots/semantic_memory_search.png"
PageDown
Wait+Screen /Current session context/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_memory_context_frame.png"

Type "q"
