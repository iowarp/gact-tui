package ui

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// bulkyPartRef identifies a tool_result we want to show in full
// inside the floating detail view. Captured at expand time so the
// modal has its own copy of the text (cheap — the alternative is
// re-walking a.messages every render).
type bulkyPartRef struct {
	messageID string
	partID    string
	title     string // rendered header ("ReadFile(main.go) → output")
	fullText  string
}

// handleDetailViewKey drives the expand-detail modal. Esc/Ctrl+E
// close; ↑/↓ · j/k · PgUp/PgDn scroll through long content; g/G
// jump to top/bottom.
func (a *App) handleDetailViewKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c", "ctrl+e":
		a.detailViewOpen = false
		a.detailView = nil
		a.detailScroll = 0
		return a, nil
	case "up", "k":
		if a.detailScroll > 0 {
			a.detailScroll--
		}
	case "down", "j":
		a.detailScroll++
	case "g", "home":
		a.detailScroll = 0
	case "G", "end":
		a.detailScroll = 1 << 20 // clamped by the render
	case "pgup", "ctrl+u":
		a.detailScroll -= a.detailPageSize()
		if a.detailScroll < 0 {
			a.detailScroll = 0
		}
	case "pgdown", "ctrl+d":
		a.detailScroll += a.detailPageSize()
	}
	return a, nil
}

// detailPageSize estimates how many lines fit in the detail pane at
// the current terminal height. Accounts for the border (2), the
// title + hint rows (4), and the default padding. Keeps PgUp/PgDn
// in lockstep with what the user can see.
func (a *App) detailPageSize() int {
	// Pane inside the border = height - 2 border - 4 chrome rows.
	n := a.height - 2 - 4
	if n < 1 {
		n = 1
	}
	return n
}

// findLatestBulkyPart walks a.messages in reverse order and returns
// a bulkyPartRef for the newest tool_result whose flattened text
// exceeds the inline preview budget. Used by Ctrl+E to decide what
// to expand; picking "the most recent bulky one" is the same cheap
// heuristic K10's clipboard copy uses, and matches the user's
// mental model that Ctrl+E expands "what I just saw previewed".
//
// Returns (nil, false) when there's no bulky part to expand; the
// caller surfaces a "nothing to expand" toast in that case.
func findLatestBulkyPart(msgs []gact.Message) (bulkyPartRef, bool) {
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		for _, p := range m.Parts {
			if p.Type != gact.PartTypeToolResult {
				continue
			}
			text := flattenToolResult(p)
			if lineCount(text) <= toolResultPreviewLines {
				continue
			}
			return bulkyPartRef{
				messageID: m.ID,
				partID:    p.ID,
				title:     fmt.Sprintf("tool_result · %d lines", lineCount(text)),
				fullText:  text,
			}, true
		}
	}
	return bulkyPartRef{}, false
}

// flattenToolResult returns the concatenated text content of a
// tool_result part's sub-parts. Joins with blank lines between
// sibling text parts (matching how the inline render lays them out).
func flattenToolResult(p gact.Part) string {
	var b strings.Builder
	for i, c := range p.Content {
		if i > 0 {
			b.WriteString("\n")
		}
		if c.Type == gact.PartTypeText {
			b.WriteString(c.Text)
		}
	}
	return b.String()
}

// viewDetailView renders the floating detail modal. Mirrors the
// other modals' chrome (L2) so width and borders stay consistent.
func (a *App) viewDetailView() string {
	if a.detailView == nil {
		return ""
	}
	t := a.Theme
	w := a.modalWidth()
	// Inner width: pane width - 2 padding - 2 border.
	innerW := w - 4
	if innerW < 10 {
		innerW = 10
	}

	ref := a.detailView
	// Wrap the full text at the inner width so long log lines don't
	// overflow the modal box.
	wrapped := wrap(ref.fullText, innerW)
	lines := strings.Split(wrapped, "\n")
	budget := a.detailPageSize()
	if budget < 1 {
		budget = 1
	}

	// Clamp scroll against the new content size.
	maxScroll := len(lines) - budget
	if maxScroll < 0 {
		maxScroll = 0
	}
	if a.detailScroll > maxScroll {
		a.detailScroll = maxScroll
	}
	if a.detailScroll < 0 {
		a.detailScroll = 0
	}

	end := a.detailScroll + budget
	if end > len(lines) {
		end = len(lines)
	}
	visible := strings.Join(lines[a.detailScroll:end], "\n")

	scrollHint := ""
	if len(lines) > budget {
		scrollHint = fmt.Sprintf("  (line %d–%d of %d)",
			a.detailScroll+1, end, len(lines))
	}

	title := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).
		Render(ref.title) +
		lipgloss.NewStyle().Foreground(t.FgMuted).Render(scrollHint)

	hint := t.HintLabel.Render(
		"↑/↓ scroll  PgUp/PgDn page  g/G top/bottom  Esc / Ctrl+E close")

	body := lipgloss.NewStyle().Foreground(t.Fg).Render(visible)

	box := lipgloss.JoinVertical(lipgloss.Left, title, "", body, "", hint)
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Primary).
		Background(t.BgSubtle).
		Padding(1, 2).
		Width(w).
		Render(box)
}
