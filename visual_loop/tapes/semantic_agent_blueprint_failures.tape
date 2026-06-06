Output "visual_loop/screenshots/semantic_agent_blueprint_failures.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_agent_blueprint_failures.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/agent-blueprints"
Enter
Wait+Screen /Agent Blueprints/

Type "v"
Wait+Screen /Validate agent blueprint/
Type "/workspace/.clio/agent-blueprints/warning/AGENT.md"
Enter
Wait+Screen /Agent blueprint validation/
Wait+Screen /warning/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_validation_warning.png"
Escape
Wait+Screen /Agent Blueprints/

Type "v"
Wait+Screen /Validate agent blueprint/
Type "/workspace/.clio/agent-blueprints/invalid/AGENT.md"
Enter
Wait+Screen /Agent blueprint validation/
Wait+Screen /root_expert not found/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_validation_error.png"
Escape
Wait+Screen /Agent Blueprints/

Type "i"
Wait+Screen /Install agent blueprint/
Ctrl+A
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Delete
Type "install-fail://missing-agent-md"
Enter
Wait+Screen /source archive is missing AGENT.md/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_install_failure.png"
Escape
Wait+Screen /Agent Blueprints/

Down
Down
Down
Down
Down
Enter
Wait+Screen /Broken Blueprint/

Type "u"
Wait+Screen /validation errors must be fixed first/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_update_failure.png"

Type "d"
Wait+Screen /confirm delete/
Type "d"
Wait+Screen /workspace policy is locking this blueprint/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_delete_failure.png"

Escape
Wait+Screen /Agent Blueprints/
Type "s"
Wait+Screen /Marketplace sources/
Type "r"
Wait+Screen /unable to fetch remote refs/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_agent_blueprint_source_refresh_failure.png"

Type "q"
