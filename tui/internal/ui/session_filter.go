package ui

// session_filter.go computes session visibility under sidebar filters (archived/detached/busy/children).

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// matchesFilter reports whether the session's title contains
// the filter substring (case-insensitive). Empty filter matches
// everything. Centralising this predicate keeps the renderer and the
// nav code using the same rule.
func (c *sessionComponent) matchesFilter(s gact.Session) bool {
	if c.app.sidebar.sessionFilter == "" {
		return true
	}
	return strings.Contains(
		strings.ToLower(s.Title),
		strings.ToLower(c.app.sidebar.sessionFilter),
	)
}

// visibleIndexes returns the indices of c.sessions that
// currently match every active filter, in sidebar order. Used by
// the sidebar renderer (to compute "N more" indicators from the
// visible set) and by the filter-aware selection adjusters below.
// Respects showDetachedOnly — when true, keeps only
// sessions whose id is in previouslyDetached.
// Respects showBusyOnly — when true, keeps only
// sessions whose status is running or waiting_permission.
func (c *sessionComponent) visibleIndexes() []int {
	out := make([]int, 0, len(c.sessions))
	childrenByParent := map[string][]int{}
	expandedParent := c.selectedChildGroupParentID()
	for i, s := range c.sessions {
		if c.app.sidebar.showChildSessions && isChildSession(s) && c.passesSidebarFilters(s) {
			childrenByParent[s.ParentSessionID] = append(childrenByParent[s.ParentSessionID], i)
		}
	}
	for i, s := range c.sessions {
		if isChildSession(s) {
			continue
		}
		if !c.passesSidebarFilters(s) {
			continue
		}
		out = append(out, i)
		if s.ID == expandedParent {
			out = append(out, childrenByParent[s.ID]...)
			delete(childrenByParent, s.ID)
		}
	}
	// If a backend returns a child whose parent is absent from the current
	// page/filter, keep it visible after top-level rows instead of dropping it.
	// This preserves evidence without letting child rows lead the main list.
	if c.app.sidebar.showChildSessions && expandedParent != "" {
		for i, s := range c.sessions {
			if !isChildSession(s) {
				continue
			}
			if s.ParentSessionID != expandedParent {
				continue
			}
			if _, grouped := childrenByParent[s.ParentSessionID]; !grouped {
				continue
			}
			out = append(out, i)
		}
	}
	return out
}

func (c *sessionComponent) selectedChildGroupParentID() string {
	if !c.app.sidebar.showChildSessions || c.selected < 0 || c.selected >= len(c.sessions) {
		return ""
	}
	selected := c.sessions[c.selected]
	if selected.ParentSessionID != "" {
		return selected.ParentSessionID
	}
	return selected.ID
}

func (c *sessionComponent) passesSidebarFilters(s gact.Session) bool {
	if !c.matchesFilter(s) {
		return false
	}
	if c.app.sidebar.showDetachedOnly && !c.app.previouslyDetached[s.ID] {
		return false
	}
	if c.app.sidebar.showBusyOnly && s.Status != gact.StatusRunning &&
		s.Status != gact.StatusWaitingPermission {
		return false
	}
	return true
}

func archivedViewHint(showArchived bool) string {
	if showArchived {
		return "showing archived sessions (h to go back)"
	}
	return "showing active sessions"
}

func detachedOnlyHint(showDetachedOnly bool, detachedCount int) string {
	if !showDetachedOnly {
		return "showing all sessions"
	}
	if detachedCount > 0 {
		return fmt.Sprintf("showing %d detached session(s) (d to go back)", detachedCount)
	}
	return "no detached sessions on this server (d to go back)"
}

func busyOnlySessionCount(sessions []gact.Session) int {
	busyCount := 0
	for _, s := range sessions {
		if s.Status == gact.StatusRunning || s.Status == gact.StatusWaitingPermission {
			busyCount++
		}
	}
	return busyCount
}

func busyOnlyHint(showBusyOnly bool, busyCount int) string {
	if !showBusyOnly {
		return "showing all sessions"
	}
	if busyCount > 0 {
		return fmt.Sprintf("showing %d busy session(s) (b to go back)", busyCount)
	}
	return "no busy sessions on this server (b to go back)"
}

// stepSelectionVisible moves c.selected by `delta` visible positions
// (positive = down, negative = up) through the filtered view, clamped
// at the ends. Returns true if the selection actually changed.
//
// Used by the sidebar nav branches so ↑/↓ feel natural — they skip
// filtered-out sessions — without every branch having to know about
// the filter. Uses visibleSessionIndexes() once per call so the cost
// stays O(sessions) per keystroke, which is fine at the sidebar
// sizes we actually render (page-size clamps the visible count).
func (c *sessionComponent) stepSelectionVisible(delta int) bool {
	vis := c.visibleIndexes()
	if len(vis) == 0 {
		return false
	}
	// Find our current position within the visible list.
	curVis := -1
	for i, idx := range vis {
		if idx == c.selected {
			curVis = i
			break
		}
	}
	if curVis < 0 {
		// Selected session isn't visible under the filter — jump to
		// the first visible one.
		c.selected = vis[0]
		return true
	}
	next := curVis + delta
	if next < 0 {
		next = 0
	}
	if next > len(vis)-1 {
		next = len(vis) - 1
	}
	if vis[next] == c.selected {
		return false
	}
	c.selected = vis[next]
	return true
}

// ensureSelectedVisible moves c.selected to the first visible session
// if the current selection isn't visible under any active filter
// (text filter or the detached-only / busy-only
// toggles). Called after filter edits commit so the user isn't
// silently pointing at a hidden session.
func (c *sessionComponent) ensureSelectedVisible() {
	if c.selected < 0 || c.selected >= len(c.sessions) {
		return
	}
	cur := c.sessions[c.selected]
	if (!isChildSession(cur) || c.app.sidebar.showChildSessions) && c.passesSidebarFilters(cur) {
		return
	}
	vis := c.visibleIndexes()
	if len(vis) == 0 {
		// Filter hides everything — leave selection alone so clearing
		// the filter restores focus to the previously-selected session.
		return
	}
	c.selected = vis[0]
}
