Output "visual_loop/screenshots/codex_blueprint_catalog_uiux.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_prompt_catalog.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 800ms

Type "/agent-blueprints"
Enter
Wait+Screen /Blueprint library/
Wait+Screen /Setup flow/
Wait+Screen /s browse sources/
Wait+Screen /i manual install/
Wait+Screen /v validate file/
Sleep 500ms
Screenshot "visual_loop/screenshots/codex_blueprint_catalog_uiux.png"

Type "q"
