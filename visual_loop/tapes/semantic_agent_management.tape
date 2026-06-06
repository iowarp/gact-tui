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

Type "/experts"
Enter
Wait+Screen /Expert hierarchy/
Wait+Screen /c create expert/
Wait+Screen /x extract expert/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_catalog.png"

Type "c"
Wait+Screen /Create expert/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_agent_management_create.png"
Escape
Sleep 200ms

Type "x"
Wait+Screen /Extract expert from session/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_agent_management_extract.png"
Escape
Sleep 200ms

Enter
Wait+Screen /Expert ·/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_detail.png"

Type "c"
Wait+Screen /Clone expert/
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_agent_management_clone.png"
Enter
Wait+Screen /clone expert/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_cloned.png"

Type "e"
Wait+Screen /Edit expert/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_edit.png"
Type " edited"
Enter
Wait+Screen /updated expert/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_updated.png"

Type "d"
Wait+Screen /confirm delete/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_delete_confirm.png"

Type "d"
Wait+Screen /deleted expert/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_management_deleted.png"

Type "q"
