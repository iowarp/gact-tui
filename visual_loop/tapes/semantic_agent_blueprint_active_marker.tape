Output "visual_loop/screenshots/semantic_agent_blueprint_active_marker.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_agent_blueprint_active_marker.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/agent-blueprints"
Enter
Wait+Screen /Agent Blueprints/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_active_marker_catalog.png"

Down
Enter
Wait+Screen /Agent Blueprint/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_active_marker_detail.png"

Type "q"
