package ui

// command_palette.go drives the slash-command palette modal: open/close, key routing, and theme cycling.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func (c *commandPaletteComponent) openModal() {
	c.paletteOpen = true
	c.paletteFilter = ""
	c.paletteCursor = 0
	c.paletteCursorSet = true
	c.paletteSel = 0
	c.paletteGroup = ""
}

// handleKey is the slash-command palette key router.
func (c *commandPaletteComponent) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	searchMode := c.inSearchMode()
	groupOverview := c.showingGroupOverview()
	cmdMatches := c.visibleMatches()
	rowCount := len(cmdMatches)
	if searchMode {
		rowCount = len(c.searchMatches)
	} else if groupOverview {
		rowCount = len(c.availableGroups())
	}
	c.clampCursor()

	switch k.String() {
	case "esc", "ctrl+c":
		c.close()
		return c.app, nil
	case "up":
		c.paletteSel = moveSelection(c.paletteSel, rowCount, -1)
	case "down":
		c.paletteSel = moveSelection(c.paletteSel, rowCount, 1)
	case "tab":
		if !searchMode {
			c.selectNextGroup(+1)
		}
	case "shift+tab":
		if !searchMode {
			c.selectNextGroup(-1)
		}
	case "enter":
		if searchMode {
			query := strings.TrimSpace(c.paletteFilter[1:])
			// First Enter submits the search; second Enter (when matches
			// are loaded) jumps the conversation viewport to the hit.
			if len(c.searchMatches) == 0 {
				if sid := c.app.session.currentID(); sid != "" && query != "" {
					c.searching = true
					return c.app, searchMessagesCmd(c.app.c, sid, query)
				}
				return c.app, nil
			}
			if c.paletteSel < len(c.searchMatches) {
				match := c.searchMatches[c.paletteSel]
				c.close()
				c.app.conversation.jumpToMessage(match.MessageID)
				return c.app, nil
			}
			return c.app, nil
		}
		if groupOverview {
			groups := c.availableGroups()
			if c.paletteSel >= 0 && c.paletteSel < len(groups) {
				c.paletteGroup = groups[c.paletteSel]
				c.paletteSel = 0
			}
			return c.app, nil
		}
		if c.paletteSel < len(cmdMatches) {
			cmd := cmdMatches[c.paletteSel]
			c.close()
			return c.app, c.executeCommand(cmd)
		}
	case "backspace":
		if c.paletteCursor > 0 {
			runes := []rune(c.paletteFilter)
			runes = append(runes[:c.paletteCursor-1], runes[c.paletteCursor:]...)
			c.paletteFilter = string(runes)
			c.paletteCursor--
			c.resetAfterFilterEdit()
		} else if strings.TrimSpace(c.paletteFilter) == "" && c.paletteGroup != "" {
			c.paletteGroup = ""
			c.paletteSel = 0
		}
	case "delete":
		runes := []rune(c.paletteFilter)
		if c.paletteCursor < len(runes) {
			runes = append(runes[:c.paletteCursor], runes[c.paletteCursor+1:]...)
			c.paletteFilter = string(runes)
			c.resetAfterFilterEdit()
		}
	case "left":
		c.paletteCursorSet = true
		if c.paletteCursor > 0 {
			c.paletteCursor--
		}
	case "right":
		c.paletteCursorSet = true
		if c.paletteCursor < len([]rune(c.paletteFilter)) {
			c.paletteCursor++
		}
	case "home", "ctrl+a":
		c.paletteCursorSet = true
		c.paletteCursor = 0
	case "end", "ctrl+e":
		c.paletteCursorSet = true
		c.paletteCursor = len([]rune(c.paletteFilter))
	default:
		if k.Text != "" {
			runes := []rune(c.paletteFilter)
			insert := []rune(k.Text)
			out := make([]rune, 0, len(runes)+len(insert))
			out = append(out, runes[:c.paletteCursor]...)
			out = append(out, insert...)
			out = append(out, runes[c.paletteCursor:]...)
			c.paletteFilter = string(out)
			c.paletteCursor += len(insert)
			c.resetAfterFilterEdit()
		}
	}
	return c.app, nil
}

// close resets all palette state — same dance is needed in three
// places (esc, command-Enter, search-Enter) so factor it.
func (c *commandPaletteComponent) close() {
	c.paletteOpen = false
	c.paletteFilter = ""
	c.paletteCursor = 0
	c.paletteCursorSet = false
	c.paletteSel = 0
	c.paletteGroup = ""
	c.searchMatches = nil
	c.searching = false
}

func (c *commandPaletteComponent) closeButtons() []menuButton {
	return []menuButton{closeMenuButton("palette:close", func(app *App) { app.cmdPalette.close() })}
}

// inSearchMode reports whether the palette filter is in message-search
// mode (`?` prefix).
func (c *commandPaletteComponent) inSearchMode() bool {
	return strings.HasPrefix(c.paletteFilter, "?")
}

// cycleTheme advances the active theme by `step` positions through
// AllThemeModes, wrapping at the ends. Preserves CollapseThreshold +
// cost thresholds across the swap, fires SaveConfig so the new theme
// sticks across restart, and returns a tea.Cmd that schedules a
// transient hint to auto-clear. Same plumbing Settings > Theme uses on
// Enter; the key difference is this path skips the modal.
func (c *commandPaletteComponent) cycleTheme(step int) tea.Cmd {
	if len(AllThemeModes) == 0 {
		return nil
	}
	cur := ThemeModeFor(c.app.Theme)
	idx := 0
	for i, m := range AllThemeModes {
		if m == cur {
			idx = i
			break
		}
	}
	idx = (idx + step + len(AllThemeModes)) % len(AllThemeModes)
	next := AllThemeModes[idx]

	c.app.settings.applyThemePalette(ThemeForMode(next))
	c.app.setHint("theme: " + ThemeModeName(next))
	c.app.settings.persistPrefs()
	return scheduleHintExpire(c.app.transientHint)
}

// currentValue returns a short summary of the current state
// for settings-style commands so the palette row can show it inline.
// Empty string = no state worth surfacing (the default for most
// commands). Keep these short — they're rendered in ~30 cells after
// the title.
func (c *commandPaletteComponent) currentValue(id string) string {
	switch id {
	case "/theme", "/themes":
		return "current: " + ThemeModeName(ThemeModeFor(c.app.Theme))
	case "/clear":
		n := len(c.app.conversation.messages)
		if n == 0 {
			return "session empty"
		}
		return fmt.Sprintf("%d messages", n)
	case "/memory":
		if !c.app.session.caps.Capabilities.Memory {
			return "unsupported"
		}
		return "retained context"
	case "/mouse":
		return c.app.clipboard.mouseSelectionModeLabel()
	case "/cancel":
		if c.app.session.currentStatus == gact.StatusRunning ||
			c.app.session.currentStatus == gact.StatusWaitingPermission {
			return "status: " + c.app.session.currentStatus
		}
		return "nothing running"
	case "/agent", "/agents":
		if c.app.session.selected >= 0 && c.app.session.selected < len(c.app.session.sessions) {
			if agent := c.app.session.sessions[c.app.session.selected].Agent.ID; agent != "" {
				return "current: " + agent
			}
		}
	case "/rename":
		if c.app.session.selected >= 0 && c.app.session.selected < len(c.app.session.sessions) {
			return "current: " + c.app.session.sessions[c.app.session.selected].Title
		}
	}
	return ""
}
