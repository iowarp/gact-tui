Output "visual_loop/screenshots/semantic_agent_blueprint_management.gif"

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
Wait+Screen /Agent Blueprints/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_management_catalog.png"

Enter
Wait+Screen /Install agent blueprint/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_management_install.png"
Type "/workspace/.clio/agent-blueprints/new-blueprint"
Enter
Wait+Screen /agent blueprint installed/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_management_installed.png"

Down
Enter
Wait+Screen /Validate agent blueprint/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_management_validate.png"
Type "/workspace/.clio/agent-blueprints/data/AGENT.md"
Enter
Wait+Screen /Agent blueprint validation/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_management_validation_detail.png"
Escape
Sleep 300ms

Down
Enter
Wait+Screen /Update installed blueprint/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_management_builtin_detail.png"
Escape
Sleep 300ms

Down
Enter
Wait+Screen /Broken Blueprint/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_management_workspace_detail.png"

Down
Down
Enter
Wait+Screen /agent blueprint updated/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_management_updated.png"

Type "q"
