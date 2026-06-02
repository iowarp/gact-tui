# Release 0.7 verification: the TUI drives a real turn against a live
# clio-agent-gact (develop @ 176518d, ALCF Metis gpt-oss-120b on :17803).
#
# Run from the repo root:  vhs visual_loop/tapes/release_07_tui_live_turn.tape
# Prereq: a clio with an LM wired on 127.0.0.1:17803 and ./tui/gact built.
Output "visual_loop/screenshots/release_07_tui_live_turn.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "./tui/gact --backend http://127.0.0.1:17803 --no-intro"
Enter
Show

Wait+Screen@30s /CONVERSATION/
Sleep 1200ms

Type "What is the capital of France? Answer in one short sentence."
Enter

# ALCF Metis turn lands in ~5-15s; wait for the reply, not a blind sleep.
Wait+Screen@120s /Paris/
Sleep 1500ms
Screenshot "visual_loop/screenshots/release_07_tui_live_turn.png"

Sleep 500ms
Type "q"
