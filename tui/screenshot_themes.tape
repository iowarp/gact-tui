Output "/tmp/gact-themes.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1400
Set Height 800

Hide
Type "/tmp/gact --backend $GACT_BACKEND"
Enter
Show

Sleep 800ms
Wait+Screen /SESSIONS/

Ctrl+n
Sleep 400ms
Wait+Screen /CONVERSATION/

# Seed some conversation so themes have real content to colour.
Type "many tools please"
Enter
Sleep 6000ms

# Open Settings → Theme tab.
Ctrl+S
Sleep 200ms
Tab
Tab
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/54-themes-list.png"

# Preview dracula (index 2).
Down
Down
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/55-theme-dracula.png"

# Preview solarized-dark (index 3).
Down
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/56-theme-solarized-dark.png"

# Preview solarized-light (index 4).
Down
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/57-theme-solarized-light.png"

# Preview nord (index 5).
Down
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/58-theme-nord.png"

# Preview tokyo-night (index 6).
Down
Sleep 300ms
Screenshot "/home/jcernuda/tui/screenshots/59-theme-tokyo-night.png"

Escape
Sleep 200ms
