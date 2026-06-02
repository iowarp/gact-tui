Output "visual_loop/screenshots/rewind_before_after.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "visual_loop/run_rewind_before_after.sh"
Enter
Show

Wait+Screen /seeded assistant reply 2/
Tab
Sleep 100ms
Tab
Sleep 100ms
Type "g"
Sleep 100ms
Type "m"
Wait+Screen /Rewind to here/
Screenshot "visual_loop/screenshots/rewind_action_menu.png"
Type "W"
Wait+Screen /rewound/
Screenshot "visual_loop/screenshots/rewind_after.png"
Sleep 300ms
Type "q"
