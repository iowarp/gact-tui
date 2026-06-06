Output "visual_loop/screenshots/semantic_long_transcript_scroll.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_long_transcript.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 600ms

Ctrl+N
Wait+Screen /session:/
Sleep 400ms
Type "write a long explain please"
Enter
Wait+Screen /## Tool outputs/
Wait+Screen /Ready/
Sleep 600ms
Screenshot "visual_loop/screenshots/semantic_long_transcript_bottom.png"

# Focus the conversation pane, scroll away, then prove bottom reattachment.
Tab
Sleep 200ms
Tab
Sleep 300ms
PageUp
Sleep 300ms
PageUp
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_long_transcript_scrolled_up.png"

Type "G"
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_long_transcript_after_g.png"

PageUp
Sleep 300ms
PageDown
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_long_transcript_after_pagedown.png"

Type "q"
