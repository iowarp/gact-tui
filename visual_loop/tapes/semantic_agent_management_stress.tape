Output "visual_loop/screenshots/semantic_agent_management_stress.gif"

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
Wait+Screen /CLIO Live Benchmark Orchestrator/
Wait+Screen /EarthScope Catalog Expert/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_stress_catalog.png"

Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Down
Wait+Screen /Fragile User Expert/
Wait+Screen /Invalid Disabled Demo Expert/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_stress_scrolled.png"

Enter
Wait+Screen /Expert · Invalid Disabled Demo Expert/
Wait+Screen /Validation errors/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_invalid_detail.png"

Escape
Wait+Screen /Expert hierarchy/
Up
Enter
Wait+Screen /Expert · Fragile User Expert/
Wait+Screen /Expert actions/
Wait+Screen /edit/
Wait+Screen /delete/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_stress_detail.png"

Type "e"
Wait+Screen /Edit expert/
Sleep 300ms
Type " edited"
Enter
Wait+Screen /source file changed on disk/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_edit_failure.png"
Escape
Sleep 300ms

Type "d"
Wait+Screen /confirm delete/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_delete_failure_confirm.png"
Type "d"
Wait+Screen /referenced by active session routing/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_delete_failure.png"

Escape
Sleep 300ms
Type "/experts"
Enter
Wait+Screen /Expert hierarchy/

Type "c"
Wait+Screen /Create expert/
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
Type "agent-write-fail"
Enter
Wait+Screen /workspace registry rejected this id/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_create_failure.png"

Type "q"
