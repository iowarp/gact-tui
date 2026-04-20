package ui

import (
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// sessionMatchesFilter reports whether the session's title contains
// the filter substring (case-insensitive). Empty filter matches
// everything. Centralising this predicate keeps the renderer and the
// nav code using the same rule.
func (a *App) sessionMatchesFilter(s gact.Session) bool {
	if a.sessionFilter == "" {
		return true
	}
	return strings.Contains(
		strings.ToLower(s.Title),
		strings.ToLower(a.sessionFilter),
	)
}

// visibleSessionIndexes returns the indices of a.sessions that
// currently match every active filter, in sidebar order. Used by
// the sidebar renderer (to compute "N more" indicators from the
// visible set) and by the filter-aware selection adjusters below.
// JJJJJJJJ1: respects showDetachedOnly — when true, keeps only
// sessions whose id is in previouslyDetached.
// XXXXXXXX1: respects showBusyOnly — when true, keeps only
// sessions whose status is running or waiting_permission.
func (a *App) visibleSessionIndexes() []int {
	out := make([]int, 0, len(a.sessions))
	for i, s := range a.sessions {
		if !a.sessionMatchesFilter(s) {
			continue
		}
		if a.showDetachedOnly && !a.previouslyDetached[s.ID] {
			continue
		}
		if a.showBusyOnly && s.Status != gact.StatusRunning &&
			s.Status != gact.StatusWaitingPermission {
			continue
		}
		out = append(out, i)
	}
	return out
}

// handleSidebarFilterKey drives the inline filter editor that opens
// on `/` in sidebar focus. Kept as a narrow, single-line editor (no
// cursor movement — the filter text is short and disposable).
//
// Enter commits (clears the snapshot, exits edit mode, keeps the
// filter applied). Esc cancels (restores the pre-edit filter text
// and exits edit mode). Printable chars append; backspace deletes
// one rune from the end. Any other key is swallowed so arrow-key
// presses don't accidentally navigate the sidebar while typing.
func (a *App) handleSidebarFilterKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c":
		a.sessionFilter = a.filterSnapshot
		a.sessionFilterActive = false
		a.filterSnapshot = ""
		a.ensureSelectedVisible()
		return a, nil
	case "enter":
		a.sessionFilterActive = false
		a.filterSnapshot = ""
		a.ensureSelectedVisible()
		return a, nil
	case "backspace":
		if r := []rune(a.sessionFilter); len(r) > 0 {
			a.sessionFilter = string(r[:len(r)-1])
		}
		return a, nil
	}
	if k.Text != "" {
		a.sessionFilter += k.Text
	}
	return a, nil
}

// stepSelectionVisible moves a.selected by `delta` visible positions
// (positive = down, negative = up) through the filtered view, clamped
// at the ends. Returns true if the selection actually changed.
//
// Used by the sidebar nav branches so ↑/↓ feel natural — they skip
// filtered-out sessions — without every branch having to know about
// the filter. Uses visibleSessionIndexes() once per call so the cost
// stays O(sessions) per keystroke, which is fine at the sidebar
// sizes we actually render (page-size clamps the visible count).
func (a *App) stepSelectionVisible(delta int) bool {
	vis := a.visibleSessionIndexes()
	if len(vis) == 0 {
		return false
	}
	// Find our current position within the visible list.
	curVis := -1
	for i, idx := range vis {
		if idx == a.selected {
			curVis = i
			break
		}
	}
	if curVis < 0 {
		// Selected session isn't visible under the filter — jump to
		// the first visible one.
		a.selected = vis[0]
		return true
	}
	next := curVis + delta
	if next < 0 {
		next = 0
	}
	if next > len(vis)-1 {
		next = len(vis) - 1
	}
	if vis[next] == a.selected {
		return false
	}
	a.selected = vis[next]
	return true
}

// ensureSelectedVisible moves a.selected to the first visible session
// if the current selection isn't visible under any active filter
// (text filter or the JJJJJJJJ1 detached-only / XXXXXXXX1 busy-only
// toggles). Called after filter edits commit so the user isn't
// silently pointing at a hidden session.
func (a *App) ensureSelectedVisible() {
	if a.selected < 0 || a.selected >= len(a.sessions) {
		return
	}
	cur := a.sessions[a.selected]
	stillVisible := a.sessionMatchesFilter(cur)
	if stillVisible && a.showDetachedOnly && !a.previouslyDetached[cur.ID] {
		stillVisible = false
	}
	if stillVisible && a.showBusyOnly && cur.Status != gact.StatusRunning &&
		cur.Status != gact.StatusWaitingPermission {
		stillVisible = false
	}
	if stillVisible {
		return
	}
	vis := a.visibleSessionIndexes()
	if len(vis) == 0 {
		// Filter hides everything — leave selection alone so clearing
		// the filter restores focus to the previously-selected session.
		return
	}
	a.selected = vis[0]
}
