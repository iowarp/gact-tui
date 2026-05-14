# Aurora dry-run: deploy + connect via the proper one-liner.
Output "/tmp/gact-vdc.gif"
Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "/tmp/gact connect aurora-demo --no-intro"
Enter
Show
Sleep 2500ms
Screenshot "/home/jcernuda/tui/screenshots/verify_deploy_connect_initial.png"

Type "/doctor"
Sleep 200ms
Enter
Sleep 2000ms
Screenshot "/home/jcernuda/tui/screenshots/verify_deploy_connect_doctor.png"

Sleep 200ms
Escape
Sleep 200ms
Type "q"
