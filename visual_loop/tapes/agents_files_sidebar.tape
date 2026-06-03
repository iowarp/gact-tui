Output "visual_loop/screenshots/agents_files_sidebar.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "visual_loop/run_agents_files_sidebar.sh"
Enter
Show

Wait+Screen /AGENTS/
Wait+Screen /FILES/
Screenshot "visual_loop/screenshots/agents_files_sidebar.png"
Sleep 300ms
Type "q"
