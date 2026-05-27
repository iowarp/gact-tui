Output "visual_loop/screenshots/live_clio_sidebar_errors.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "GACT_ATTACH_SESSION_ID=sess_08ebaf83905e ./tui/gact --backend http://127.0.0.1:41917 --no-intro"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1200ms
Screenshot "visual_loop/screenshots/live_clio_error_session.png"

# Expand the selected/latest error result to prove raw failure evidence stays visible.
Tab
Sleep 200ms
Tab
Sleep 300ms
Ctrl+E
Sleep 600ms
Screenshot "visual_loop/screenshots/live_clio_error_detail.png"
Escape
Sleep 300ms

# Toggle child/nanoagent sessions in the sidebar to inspect grouping scale.
Tab
Sleep 200ms
Tab
Sleep 300ms
Type "c"
Sleep 500ms
Screenshot "visual_loop/screenshots/live_clio_child_sessions_expanded.png"

Type "q"
