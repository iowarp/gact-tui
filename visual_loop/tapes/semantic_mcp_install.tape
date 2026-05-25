Output "visual_loop/screenshots/semantic_mcp_install.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_690ac12e0908 ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms

Type "/mcp"
Enter
Wait+Screen /MCP/
Sleep 700ms

Type "i"
Sleep 400ms
Screenshot "visual_loop/screenshots/semantic_mcp_install.png"

Escape
Sleep 200ms
Escape
Sleep 200ms
Ctrl+C
Sleep 100ms
Ctrl+C
