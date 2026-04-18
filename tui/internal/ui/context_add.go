package ui

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// handleContextAddKey drives the inline "add to context" prompt —
// a narrower sibling of handleRenameKey. Same editor primitives
// (rune-indexed cursor, arrow/home/end/backspace/delete) so muscle
// memory carries over. Enter POSTs; Esc cancels.
func (a *App) handleContextAddKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c":
		a.contextAddOpen = false
		a.contextAddDraft = ""
		a.contextAddCursor = 0
		return a, nil
	case "enter":
		return a.commitContextAdd()
	case "backspace":
		if a.contextAddCursor == 0 {
			return a, nil
		}
		runes := []rune(a.contextAddDraft)
		runes = append(runes[:a.contextAddCursor-1], runes[a.contextAddCursor:]...)
		a.contextAddDraft = string(runes)
		a.contextAddCursor--
		return a, nil
	case "delete":
		runes := []rune(a.contextAddDraft)
		if a.contextAddCursor >= len(runes) {
			return a, nil
		}
		runes = append(runes[:a.contextAddCursor], runes[a.contextAddCursor+1:]...)
		a.contextAddDraft = string(runes)
		return a, nil
	case "left":
		if a.contextAddCursor > 0 {
			a.contextAddCursor--
		}
		return a, nil
	case "right":
		if a.contextAddCursor < len([]rune(a.contextAddDraft)) {
			a.contextAddCursor++
		}
		return a, nil
	case "home", "ctrl+a":
		a.contextAddCursor = 0
		return a, nil
	case "end", "ctrl+e":
		a.contextAddCursor = len([]rune(a.contextAddDraft))
		return a, nil
	}
	if k.Text != "" {
		runes := []rune(a.contextAddDraft)
		insert := []rune(k.Text)
		out := make([]rune, 0, len(runes)+len(insert))
		out = append(out, runes[:a.contextAddCursor]...)
		out = append(out, insert...)
		out = append(out, runes[a.contextAddCursor:]...)
		a.contextAddDraft = string(out)
		a.contextAddCursor += len(insert)
	}
	return a, nil
}

// commitContextAdd closes the modal and dispatches the add Cmd.
// Whitespace-only input is treated as "cancel" — matching K2 rename's
// "don't commit an empty title" philosophy; an empty path on the wire
// would 400 the backend anyway.
func (a *App) commitContextAdd() (tea.Model, tea.Cmd) {
	path := strings.TrimSpace(a.contextAddDraft)
	a.contextAddOpen = false
	a.contextAddDraft = ""
	a.contextAddCursor = 0
	if path == "" {
		a.transientHint = "add cancelled (empty path)"
		return a, nil
	}
	sid := a.currentSessionID()
	if sid == "" {
		return a, nil
	}
	return a, addContextFileCmd(a.c, sid, path)
}

// addContextFileCmd POSTs the file to /v1/sessions/{id}/context/files.
// Returns contextFileAddedMsg; on success the handler folds the new
// entry into a.contextFiles so the sidebar updates without a list
// refetch.
func addContextFileCmd(c *client.Client, sessionID, path string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		cf, err := c.AddContextFile(ctx, sessionID, path, "read")
		return contextFileAddedMsg{sessionID: sessionID, file: cf, err: err}
	}
}

type contextFileAddedMsg struct {
	sessionID string
	file      gact.ContextFile
	err       error
}

// viewContextAdd renders the prompt. Matches the rename/workspace
// modal chrome so muscle memory carries over.
func (a *App) viewContextAdd() string {
	t := a.Theme
	w := a.modalWidth()

	runes := []rune(a.contextAddDraft)
	cur := a.contextAddCursor
	if cur > len(runes) {
		cur = len(runes)
	}
	cursorStyle := lipgloss.NewStyle().Reverse(true).Foreground(t.Fg)
	var editor string
	if cur == len(runes) {
		editor = string(runes) + cursorStyle.Render(" ")
	} else {
		editor = string(runes[:cur]) +
			cursorStyle.Render(string(runes[cur:cur+1])) +
			string(runes[cur+1:])
	}

	rows := []string{
		lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render("Add file to context"),
		"",
		lipgloss.NewStyle().Foreground(t.Fg).Render("> " + editor),
		"",
		t.HintLabel.Render("Enter save  Esc cancel  mode=read  (use /drop to remove)"),
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
