Output "visual_loop/screenshots/agent_runtime_sidebar.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "visual_loop/run_agent_runtime_sidebar.sh"
Enter
Show

Wait+Screen /AGENTS/
Wait+Screen /active/
Wait+Screen /observed/
Screenshot "visual_loop/screenshots/agent_runtime_sidebar.png"
Sleep 300ms
Type "q"
