# clio_mcp demo: TUI /mcp slash command shows bundled (in-process)
# servers AND any third-party server installed via POST /v1/mcp/servers.
# Driver script installed @modelcontextprotocol/server-everything via
# npx before invoking VHS so the catalog has 4 rows.

Output "/tmp/gact-clio-mcp.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Sleep 1500ms
Type "/"
Sleep 200ms
Type "mcp"
Sleep 200ms
Enter
Sleep 800ms
Screenshot "/home/jcernuda/tui/screenshots/clio_mcp_servers.png"

Sleep 300ms
Escape
Sleep 200ms
Type "q"
