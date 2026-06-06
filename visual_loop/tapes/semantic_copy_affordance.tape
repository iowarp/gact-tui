Output "visual_loop/screenshots/semantic_copy_affordance.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "visual_loop/run_semantic_earthscope_tool.sh"
Enter
Show

Wait+Screen /sac result:/
Tab
Sleep 200ms
Tab
Sleep 300ms
Type "G"
Sleep 300ms
Type "y"
Wait+Screen /copied/
Screenshot "visual_loop/screenshots/semantic_copy_affordance.png"
Sleep 300ms
Type "q"
