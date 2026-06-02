Output "visual_loop/screenshots/semantic_agent_blueprint_sources.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_prompt_catalog.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/agent-blueprints"
Enter
Wait+Screen /Marketplace source/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_sources_catalog.png"

Down 5
Enter
Wait+Screen /Marketplace Source/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_sources_detail.png"

Type "q"
