# Diagnostic: open /mcp, click into a server, screenshot the 404 panel.
Output "/tmp/gact-diag-mcp.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_BACKEND=http://127.0.0.1:17800 /tmp/gact --no-intro"
Enter
Show

Sleep 1500ms
Type "/mcp"
Sleep 200ms
Enter
Sleep 1200ms
Screenshot "/home/jcernuda/tui/screenshots/diag_mcp_list.png"
Sleep 300ms
Enter
Sleep 1200ms
Screenshot "/home/jcernuda/tui/screenshots/diag_mcp_detail.png"
Sleep 300ms
Escape
Sleep 200ms
Type "q"
