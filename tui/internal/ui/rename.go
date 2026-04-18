package ui

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

// handleRenameKey drives the rename-session overlay. Minimal line
// editor — backspace/delete, home/end, arrow keys, printable chars,
// Enter to commit, Esc to cancel. Deliberately narrower than a full
// textarea: single line, no multi-line paste, no rich bindings.
func (a *App) handleRenameKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c":
		a.renameOpen = false
		a.renameDraft = ""
		a.renameCursor = 0
		return a, nil
	case "enter":
		return a.commitRename()
	case "backspace":
		if a.renameCursor == 0 {
			return a, nil
		}
		runes := []rune(a.renameDraft)
		runes = append(runes[:a.renameCursor-1], runes[a.renameCursor:]...)
		a.renameDraft = string(runes)
		a.renameCursor--
		return a, nil
	case "delete":
		runes := []rune(a.renameDraft)
		if a.renameCursor >= len(runes) {
			return a, nil
		}
		runes = append(runes[:a.renameCursor], runes[a.renameCursor+1:]...)
		a.renameDraft = string(runes)
		return a, nil
	case "left":
		if a.renameCursor > 0 {
			a.renameCursor--
		}
		return a, nil
	case "right":
		if a.renameCursor < len([]rune(a.renameDraft)) {
			a.renameCursor++
		}
		return a, nil
	case "home", "ctrl+a":
		a.renameCursor = 0
		return a, nil
	case "end", "ctrl+e":
		a.renameCursor = len([]rune(a.renameDraft))
		return a, nil
	}
	// Printable chars (including space). We forward anything with a
	// non-empty Text field — lipgloss/bubbles events already filter
	// out control bytes for us.
	if k.Text != "" {
		runes := []rune(a.renameDraft)
		insert := []rune(k.Text)
		out := make([]rune, 0, len(runes)+len(insert))
		out = append(out, runes[:a.renameCursor]...)
		out = append(out, insert...)
		out = append(out, runes[a.renameCursor:]...)
		a.renameDraft = string(out)
		a.renameCursor += len(insert)
	}
	return a, nil
}

// commitRename dispatches the PATCH /v1/sessions/{id} and closes the
// overlay. Empty input (after trimming) is treated as "cancel" — we
// don't want to clobber a session title with "" by accident.
func (a *App) commitRename() (tea.Model, tea.Cmd) {
	title := strings.TrimSpace(a.renameDraft)
	a.renameOpen = false
	a.renameDraft = ""
	a.renameCursor = 0
	if title == "" {
		a.transientHint = "rename cancelled (empty title)"
		return a, nil
	}
	sid := a.currentSessionID()
	if sid == "" {
		return a, nil
	}
	// Optimistically update the sidebar so the user sees the change
	// immediately; patchSessionTitleCmd will overwrite with the
	// server's authoritative value (or silently fail, leaving our
	// optimistic value). This mirrors J6's msg-based update path —
	// both terminate with sessionTitleRenamedMsg.
	for i := range a.sessions {
		if a.sessions[i].ID == sid {
			a.sessions[i].Title = title
			break
		}
	}
	return a, patchSessionTitleCmd(a.c, sid, title)
}

// viewRename renders the inline rename prompt. Matches the workspace-
// switcher / settings overlay shape.
func (a *App) viewRename() string {
	t := a.Theme
	w := a.modalWidth()

	// Minimal cursor rendering — a reverse-video block at a.renameCursor.
	runes := []rune(a.renameDraft)
	cur := a.renameCursor
	if cur > len(runes) {
		cur = len(runes)
	}
	var editor string
	cursorStyle := lipgloss.NewStyle().Reverse(true).Foreground(t.Fg)
	if cur == len(runes) {
		editor = string(runes) + cursorStyle.Render(" ")
	} else {
		editor = string(runes[:cur]) +
			cursorStyle.Render(string(runes[cur:cur+1])) +
			string(runes[cur+1:])
	}

	rows := []string{
		lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render("Rename session"),
		"",
		lipgloss.NewStyle().Foreground(t.Fg).Render("> " + editor),
		"",
		t.HintLabel.Render("Enter save  Esc cancel  ←/→ move  Home/End jump"),
	}
	body := lipgloss.JoinVertical(lipgloss.Left, rows...)
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Primary).
		Background(t.BgSubtle).
		Padding(1, 2).
		Width(w).
		Render(body)
}
