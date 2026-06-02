Output "visual_loop/screenshots/semantic_agent_blueprint_commands.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_agent_blueprint_commands_palette.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms

Type "/validate"
Sleep 600ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_commands_palette.png"

Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C
