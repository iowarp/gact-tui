Output "visual_loop/screenshots/semantic_agent_workflow_sidebar.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1900
Set Height 900

Hide
Type "bash visual_loop/run_agent_workflow_sidebar.sh"
Enter
Show

Wait+Screen /WORKFLOW/
Wait+Screen /Workflow Root/
Wait+Screen /workflow/
Screenshot "visual_loop/screenshots/semantic_agent_workflow_sidebar.png"
Sleep 300ms
Type "q"
