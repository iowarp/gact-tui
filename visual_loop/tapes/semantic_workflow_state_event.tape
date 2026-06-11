Output "visual_loop/screenshots/semantic_workflow_state_event.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_semantic_workflow_state.sh"
Enter
Show

Wait+Screen /main selected data/
Wait+Screen /Seismic dataset lookup/
Screenshot "visual_loop/screenshots/semantic_workflow_state_event_route.png"
Wait+Screen /NDP resource 00d66104 was too large/
Wait+Screen /next: analysis/
Wait+Screen /run SAC fallback/
Screenshot "visual_loop/screenshots/semantic_workflow_state_event_contract.png"
Wait+Screen /analysis returned/
Wait+Screen /next: visualization/
Wait+Screen /acquisition staged/
Wait+Screen /artifact/
Wait+Screen /npts: 12000/
Screenshot "visual_loop/screenshots/semantic_workflow_state_event_inline.png"
Tab
Sleep 200ms
Tab
Sleep 200ms
Up
Sleep 200ms
Ctrl+E
Wait+Screen /Operator view/
Wait+Screen /Workflow trace/
Screenshot "visual_loop/screenshots/semantic_workflow_state_event_detail.png"
Escape
Sleep 200ms
Wait+Screen /idle/
Screenshot "visual_loop/screenshots/semantic_workflow_state_event_final.png"
Sleep 300ms
Type "q"
