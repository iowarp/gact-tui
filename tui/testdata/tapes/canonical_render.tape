Output canonical_render.gif

Set Shell "bash"
Set FontSize 20
Set Width 1500
Set Height 1500

Hide
Type "GACT_BACKEND=http://127.0.0.1:7811 ./gact"
Enter
Show

Sleep 2500ms
Space
Sleep 1000ms
Ctrl+n
Sleep 1200ms
Enter
Sleep 1200ms
Type "Explore recent seismic activity around Los Angeles"
Enter
Sleep 6s

# Focus the conversation body and scroll to the very top so the first
# delegation boundary (▎main → delegates to geospatial → ▎geospatial → ⤶ returns)
# is visible in the canonical grammar.
Tab
Sleep 300ms
Tab
Sleep 300ms
PageUp 220
Sleep 400ms
Screenshot screenshots/tui-canonical-grammar-top.png
Sleep 200ms
Type "q"
