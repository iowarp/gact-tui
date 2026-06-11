Output "visual_loop/screenshots/semantic_trace_revisit_stability.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_semantic_trace_revisit.sh"
Enter
Show

Wait+Screen /semantic trace revisit proof/
Wait+Screen /SAC trace statistics/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_trace_revisit_before.png"

Tab
Wait+Screen /SESSIONS/
Down
Enter
Wait+Screen /plain comparison session/
Wait+Screen /no semantic trace rows/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_trace_revisit_other_session.png"

Tab
Wait+Screen /SESSIONS/
Up
Enter
Wait+Screen /semantic trace revisit proof/
Wait+Screen /SAC trace statistics/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_trace_revisit_after.png"

Type "q"
