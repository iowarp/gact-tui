Output "visual_loop/screenshots/live_clio_ndp.gif"

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
Screenshot "visual_loop/screenshots/live_clio_ndp_bottom.png"

# Move focus to the conversation pane, scroll away, then test bottom reattach.
Tab
Sleep 200ms
Tab
Sleep 300ms
PageUp
Sleep 300ms
PageUp
Sleep 300ms
Screenshot "visual_loop/screenshots/live_clio_ndp_scrolled_up.png"

Type "G"
Sleep 500ms
Screenshot "visual_loop/screenshots/live_clio_ndp_after_end.png"

PageUp
Sleep 300ms
PageDown
Sleep 300ms
Screenshot "visual_loop/screenshots/live_clio_ndp_after_pagedown.png"

# Open detail for the currently selected bottom block.
Ctrl+E
Sleep 500ms
Screenshot "visual_loop/screenshots/live_clio_ndp_detail.png"

Escape
Sleep 200ms
Type "q"
