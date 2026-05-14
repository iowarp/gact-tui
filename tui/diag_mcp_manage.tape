# Verify the new /mcp-install and /mcp-remove flows.
Output "/tmp/gact-diag-mcp-manage.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms
Type "/mcp-install"
Sleep 200ms
Enter
Sleep 1000ms
Screenshot "/home/jcernuda/tui/screenshots/diag_mcp_install_open.png"

Type "everything stdio npx -y @modelcontextprotocol/server-everything"
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/diag_mcp_install_typed.png"

Sleep 200ms
Escape
Sleep 200ms
Type "/mcp-remove"
Sleep 200ms
Enter
Sleep 1500ms
Screenshot "/home/jcernuda/tui/screenshots/diag_mcp_remove.png"

Sleep 300ms
Escape
Sleep 200ms
Type "/clear"
Sleep 200ms
Enter
Sleep 500ms
Screenshot "/home/jcernuda/tui/screenshots/diag_clear_armed.png"
Sleep 200ms
Escape
Sleep 200ms

Type "q"
