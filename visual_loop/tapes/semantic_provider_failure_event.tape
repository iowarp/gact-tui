Output "visual_loop/screenshots/semantic_provider_failure_event.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_semantic_provider_failure.sh"
Enter
Show

Wait+Screen /Provider error/
Screenshot "visual_loop/screenshots/semantic_provider_failure_inline.png"
Sleep 300ms
Tab
Sleep 200ms
Tab
Sleep 200ms
Ctrl+E
Wait+Screen /Operator view/
Wait+Screen /provider_streaming_error/
Screenshot "visual_loop/screenshots/semantic_provider_failure_detail.png"
Escape
Sleep 200ms
Type "q"
