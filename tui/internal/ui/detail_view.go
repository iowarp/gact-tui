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

// openDetailForSelection opens the floating detail view on the
// body cursor's bulky part, falling back to the latest bulky in
// the whole conversation (Z1 + L3 behaviour). Shared by Ctrl+E
// and ZZZZZZZZ1 body-Enter so both paths stay in lockstep.
//
// TTTTTTTTT1: when bodySelPartIdx points at a specific addressable
// part, target THAT part directly — so if the assistant read two
// large files in one turn, the user can expand either one
// individually. The old findBulkyPartIn fallback (first bulky in
// the selected message) still covers the unset-partIdx case.
func (a *App) openDetailForSelection() {
	var (
		ref bulkyPartRef
		ok  bool
	)
	if a.bodySelMsgIdx >= 0 && a.bodySelMsgIdx < len(a.messages) {
		m := a.messages[a.bodySelMsgIdx]
		if a.bodySelPartIdx >= 0 {
			ref, ok = findBulkyPartForSelected(m, a.bodySelPartIdx, a.messages, a.bodySelMsgIdx)
		}
		if !ok {
			ref, ok = findBulkyPartIn(m)
		}
	}
	if !ok {
		ref, ok = findLatestBulkyPart(a.messages)
	}
	if !ok {
		a.transientHint = "nothing to expand — no bulky outputs in selection"
		return
	}
	a.detailView = &ref
	a.detailViewOpen = true
	a.detailScroll = 0
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

// TTTTTTTTT1: findBulkyPartForSelected builds a bulkyPartRef for the
// specific addressable part the body cursor points at. Handles three
// cases:
//
//   - the selected part is a tool_call: drill forward through sibling
//     tool messages (pairToolResults-style) to find the matching
//     tool_result. Expands the *output*, not the call header — that's
//     what the user wants to see when there are two bulky reads.
//   - the selected part is a tool_result / text / file_diff: expand
//     it directly (same flattenToolResult for tool_result).
//   - the selected part is below the bulky threshold: return !ok so
//     the caller can decide to toast or fall through.
//
// Input:
//
//	m       — the currently selected message
//	addrIdx — bodySelPartIdx (index into addressablePartsOf(m))
//	allMsgs — full messages slice, needed to walk forward into
//	          sibling tool messages for tool_call pairing
//	msgIdx  — m's position in allMsgs
func findBulkyPartForSelected(m gact.Message, addrIdx int, allMsgs []gact.Message, msgIdx int) (bulkyPartRef, bool) {
	addr := addressablePartsOf(m)
	if addrIdx < 0 || addrIdx >= len(addr) {
		return bulkyPartRef{}, false
	}
	partIdx := addr[addrIdx]
	if partIdx < 0 || partIdx >= len(m.Parts) {
		return bulkyPartRef{}, false
	}
	p := m.Parts[partIdx]

	switch p.Type {
	case gact.PartTypeToolCall:
		// Find the matching tool_result in the same message or the
		// following sibling tool messages. Mirrors pairToolResults.
		if p.CallID == "" {
			return bulkyPartRef{}, false
		}
		// Same-message scan.
		for _, sib := range m.Parts {
			if sib.Type == gact.PartTypeToolResult && sib.CallID == p.CallID {
				text := flattenToolResult(sib)
				if lineCount(text) <= toolResultPreviewLines {
					return bulkyPartRef{}, false
				}
				return bulkyPartRef{
					messageID: m.ID,
					partID:    sib.ID,
					title:     fmt.Sprintf("%s · %d lines", p.ToolName, lineCount(text)),
					fullText:  text,
				}, true
			}
		}
		// Walk forward through sibling tool messages.
		for j := msgIdx + 1; j < len(allMsgs); j++ {
			tm := allMsgs[j]
			if tm.Role != gact.RoleTool {
				break
			}
			for _, rp := range tm.Parts {
				if rp.Type == gact.PartTypeToolResult && rp.CallID == p.CallID {
					text := flattenToolResult(rp)
					if lineCount(text) <= toolResultPreviewLines {
						return bulkyPartRef{}, false
					}
					return bulkyPartRef{
						messageID: tm.ID,
						partID:    rp.ID,
						title:     fmt.Sprintf("%s · %d lines", p.ToolName, lineCount(text)),
						fullText:  text,
					}, true
				}
			}
		}
		return bulkyPartRef{}, false

	case gact.PartTypeToolResult:
		text := flattenToolResult(p)
		if lineCount(text) <= toolResultPreviewLines {
			return bulkyPartRef{}, false
		}
		return bulkyPartRef{
			messageID: m.ID,
			partID:    p.ID,
			title:     fmt.Sprintf("tool_result · %d lines", lineCount(text)),
			fullText:  text,
		}, true

	case gact.PartTypeText:
		if lineCount(p.Text) <= toolResultPreviewLines {
			return bulkyPartRef{}, false
		}
		return bulkyPartRef{
			messageID: m.ID,
			partID:    p.ID,
			title:     fmt.Sprintf("%s text · %d lines", strings.ToLower(m.Role), lineCount(p.Text)),
			fullText:  p.Text,
		}, true

	case gact.PartTypeFileDiff:
		// For diffs, "expanding" shows the concatenated before+after
		// so the modal can scroll both sides. Keep the title helpful
		// by naming the path.
		before, after := "", ""
		if p.Before != nil {
			before = *p.Before
		}
		if p.After != nil {
			after = *p.After
		}
		body := "--- before ---\n" + before + "\n\n+++ after +++\n" + after
		return bulkyPartRef{
			messageID: m.ID,
			partID:    p.ID,
			title:     fmt.Sprintf("file_diff · %s", p.Path),
			fullText:  body,
		}, true
	}
	return bulkyPartRef{}, false
}

// findBulkyPartIn scans a single message for a bulky tool_result or
// text part (same threshold as findLatestBulkyPart). Used by the
// Z1 Ctrl+E routing when a body cursor is set — the user wants to
// expand "this one", not "the newest bulky anywhere".
func findBulkyPartIn(m gact.Message) (bulkyPartRef, bool) {
	for _, p := range m.Parts {
		switch p.Type {
		case gact.PartTypeToolResult:
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
		case gact.PartTypeText:
			if lineCount(p.Text) <= toolResultPreviewLines {
				continue
			}
			return bulkyPartRef{
				messageID: m.ID,
				partID:    p.ID,
				title:     fmt.Sprintf("%s text · %d lines", strings.ToLower(m.Role), lineCount(p.Text)),
				fullText:  p.Text,
			}, true
		}
	}
	return bulkyPartRef{}, false
}

// findLatestBulkyPart walks a.messages in reverse order and returns
// a bulkyPartRef for the newest tool_result OR text part whose body
// exceeds the inline preview budget. Used by Ctrl+E to decide what
// to expand; picking "the most recent bulky one" is the same cheap
// heuristic K10's clipboard copy uses, and matches the user's
// mental model that Ctrl+E expands "what I just saw previewed".
//
// S2 extension: long assistant text (e.g. the ~60-line "long
// explain" scenario) now qualifies as bulky too so users can open
// it in the paginated detail view instead of scrolling.
//
// Returns (nil, false) when there's no bulky part to expand; the
// caller surfaces a "nothing to expand" toast in that case.
func findLatestBulkyPart(msgs []gact.Message) (bulkyPartRef, bool) {
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		for _, p := range m.Parts {
			switch p.Type {
			case gact.PartTypeToolResult:
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
			case gact.PartTypeText:
				if lineCount(p.Text) <= toolResultPreviewLines {
					continue
				}
				return bulkyPartRef{
					messageID: m.ID,
					partID:    p.ID,
					title:     fmt.Sprintf("%s text · %d lines", strings.ToLower(m.Role), lineCount(p.Text)),
					fullText:  p.Text,
				}, true
			}
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
