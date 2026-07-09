Output "/tmp/gact-per-part.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Sleep 800ms
Wait+Screen /SESSIONS/

Ctrl+n
Sleep 400ms
Wait+Screen /CONVERSATION/

# SSSSSSSSS1: "many tools please" now reads TWO files, greps, and
# proposes a diff — the exact shape the user flagged ("what happens if
# an agent reads two large files?"). Each tool_result + the file_diff
# is an individually-addressable block under TTTTTTTTT1's per-part
# cursor.
Type "many tools please"
Enter

# Let the whole turn stream in.
Sleep 14000ms

# Focus body — cursor seeds on the last addressable part (the diff).
# Focus cycle is input → sidebar → body → input, so two Tabs from
# input lands us on body.
Tab
Sleep 200ms
Tab
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/TTTTTTTTT1_body_cursor_on_diff.png"

# Walk back through the addressable parts. Starting on the last part
# of the last asst (the followup text). Going backwards in order:
# diff, edit_file, grep, read_file#2, read_file#1, intro.
Type "k"
Sleep 100ms
Type "k"
Sleep 100ms
Type "k"
Sleep 100ms
Type "k"
Sleep 300ms
# Now on read_file #2 (the handlers.go read). ▸ marker should sit on
# the ReadFile(internal/handlers/handlers.go) header.
Screenshot "/home/jcernuda/tui/screenshots/TTTTTTTTT1_body_cursor_on_second_read.png"

Type "k"
Sleep 300ms
# Now on read_file #1 (main.go).
Screenshot "/home/jcernuda/tui/screenshots/TTTTTTTTT1_body_cursor_on_first_read.png"

# Ctrl+E — opens THE FIRST READ's tool_result (the 52-line main.go)
# in the floating detail view. Demonstrates that each read is
# individually addressable.
Ctrl+E
Sleep 600ms
Screenshot "/home/jcernuda/tui/screenshots/TTTTTTTTT1_ctrl_e_first_read.png"

Escape
Sleep 300ms

# Jump back to the diff (G = last block), so the UUUUUUUUU1 unified
# diff is the headline element in the screenshot.
Type "G"
Sleep 400ms
Screenshot "/home/jcernuda/tui/screenshots/UUUUUUUUU1_unified_diff_inline.png"

Sleep 500ms
Type "q"
