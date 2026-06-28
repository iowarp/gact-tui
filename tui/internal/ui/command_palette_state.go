package ui

// commandPaletteComponent + appCommandState: the command palette, slash-command list, and palette search.

import (
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// appCommandState groups slash command data, plugin commands, destructive
// command confirmation, and command-palette search state. It is embedded in
// commandPaletteComponent so the palette's methods read these fields directly
// via promotion (c.commands, c.paletteOpen, …).
type appCommandState struct {
	commands []gact.Command
	plugins  []pluginCommand

	pendingClearSessionID string

	paletteOpen      bool
	paletteFilter    string
	paletteCursor    int
	paletteCursorSet bool
	paletteSel       int
	paletteGroup     string
	searchMatches    []client.SearchMatch
	searching        bool
}

// commandPaletteComponent owns the slash-command palette: its backing command
// data (embedded appCommandState, so its methods keep reading c.commands /
// c.paletteFilter / … directly), and a back-reference to the root App for
// shared services (client, theme, modal chrome, cross-domain coordinators).
type commandPaletteComponent struct {
	app *App
	appCommandState
}
