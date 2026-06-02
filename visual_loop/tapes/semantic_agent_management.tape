Output "visual_loop/screenshots/semantic_agent_management.gif"

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

Type "/agents-list"
Enter
Wait+Screen /Create user agent/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_catalog.png"

Enter
Wait+Screen /Create user agent/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_agent_management_create.png"
Escape
Sleep 200ms

Down
Enter
Wait+Screen /Extract agent from session/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_agent_management_extract.png"
Escape
Sleep 200ms

Down
Enter
Wait+Screen /Agent ·/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_detail.png"

Down
Enter
Wait+Screen /Clone agent/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_agent_management_clone.png"
Enter
Wait+Screen /clone agent/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_cloned.png"

Down
Down
Enter
Wait+Screen /Edit user agent/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_edit.png"
Type " edited"
Enter
Wait+Screen /updated agent/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_updated.png"

Down
Enter
Wait+Screen /deleted agent/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_deleted.png"

Type "q"
