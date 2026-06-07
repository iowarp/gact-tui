Output "visual_loop/screenshots/semantic_agent_management_write_failures.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_agent_management_stress.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/experts"
Enter
Wait+Screen /Expert hierarchy/
Wait+Screen /x extract expert/
Sleep 400ms

Type "x"
Wait+Screen /Extract expert from session/
Ctrl+A
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Type "extract-fail"
Enter
Wait+Screen /session transcript is unavailable/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_extract_failure.png"

Escape
Sleep 200ms
Type "/experts"
Enter
Wait+Screen /Expert hierarchy/
Enter
Wait+Screen /Agent ·/
Wait+Screen /c clone/
Sleep 300ms

Type "c"
Wait+Screen /Clone expert/
Ctrl+A
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Type "agent-write-fail"
Enter
Wait+Screen /workspace registry rejected this id/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_clone_failure.png"

Type "q"
