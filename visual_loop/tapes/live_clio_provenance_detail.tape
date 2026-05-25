Output "visual_loop/screenshots/live_clio_provenance_detail.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_674829ad532b ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms

Tab
Sleep 200ms
Tab
Sleep 300ms
Type "g"
Sleep 400ms

# Move from the initial block to the first promoted tool result.
Type "j"
Sleep 120ms
Type "j"
Sleep 120ms
Type "j"
Sleep 120ms
Type "j"
Sleep 120ms
Type "j"
Sleep 120ms
Type "j"
Sleep 120ms
Type "j"
Sleep 300ms
Screenshot "visual_loop/screenshots/live_clio_provenance_selection.png"

Ctrl+E
Sleep 600ms
Screenshot "visual_loop/screenshots/live_clio_provenance_detail.png"

Escape
Sleep 200ms
Type "q"
