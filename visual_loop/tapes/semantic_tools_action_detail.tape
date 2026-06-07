Output "visual_loop/screenshots/semantic_tools_action_detail.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_seeded_sidebar.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 800ms

Type "/tools"
Enter
Wait+Screen /Actions and MCP/
Wait+Screen /Built-in tools/
Wait+Screen /MCP connection/
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_tools_action_detail_catalog.png"

Down
Wait+Screen /bash/
Enter
Wait+Screen /Tool · Run shell command/
Wait+Screen /required: command/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_tools_action_detail_builtin.png"

Type "q"
