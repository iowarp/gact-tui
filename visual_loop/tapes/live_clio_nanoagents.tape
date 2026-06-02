Output "visual_loop/screenshots/live_clio_nanoagents.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_1fb7b4b568f2 ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms
Screenshot "visual_loop/screenshots/live_clio_nanoagents_collapsed.png"

Tab
Sleep 300ms
Type "c"
Sleep 500ms
Screenshot "visual_loop/screenshots/live_clio_nanoagents_expanded.png"

# Open the first visible nanoagent child to verify child-session drill-down.
Down
Sleep 150ms
Down
Sleep 150ms
Enter
Wait+Screen /CONVERSATION/
Sleep 800ms
Screenshot "visual_loop/screenshots/live_clio_nanoagent_child_open.png"

Type "q"
