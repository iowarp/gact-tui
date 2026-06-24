package ui

// sidebar_sessions_view.go renders the sidebar sessions module rows.

import (
	"fmt"
	"time"

	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (c *sidebarComponent) renderSessionsModuleRows(width, height, baseRow int) []string {
	t := c.app.Theme
	rows := []string{}

	// Build the filter-filtered view once so the scroll math and the
	// render loop work off the same subset.
	visIdx := c.app.session.visibleIndexes()

	// JJJJJJJJ1 + XXXXXXXX1: surface the active sidebar filter in
	// the title so the narrower view is visible even after the
	// transient hint fades. Two mutually-non-exclusive filters —
	// if both d and b were on, stacked suffix.
	titleText := c.moduleTitle(sidebarModuleSessions)
	switch {
	case c.showDetachedOnly && c.showBusyOnly:
		titleText = c.app.localizer.t(msgSidebarTitleDetachedBusy, nil)
	case c.showDetachedOnly:
		titleText = c.app.localizer.t(msgSidebarTitleDetached, nil)
	case c.showBusyOnly:
		titleText = c.app.localizer.t(msgSidebarTitleBusy, nil)
	}
	if c.showChildSessions && !c.sessionsCollapsed {
		titleText += " · " + c.app.localizer.t(msgSidebarTitleChildren, nil)
	}
	disclosure := "▾ "
	if c.sessionsCollapsed {
		disclosure = "▸ "
		titleText += fmt.Sprintf(" (%d)", len(visIdx))
	}
	titlePrefix := ""
	if c.app.focus == c.hitFocus && (c.sessionsCollapsed || c.sectionCursor) && c.sectionFocus == sidebarSectionSessions {
		titlePrefix = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
	}
	title := titlePrefix + lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render(disclosure+titleText)
	rows = append(rows, title, "")
	c.registerSectionHeaderHit(baseRow, width, sidebarSectionSessions)
	if len(c.app.session.sessions) == 0 {
		rows = append(rows,
			t.HintLabel.Render(c.app.localizer.t(msgSidebarNoSessions, nil)),
			"",
			t.HintKey.Render("n")+t.HintLabel.Render(" "+c.app.localizer.t(msgSidebarCreate, nil)))
	}

	// Filter indicator row — shown above the session list whenever c.app
	// filter is active. "editing" while sessionFilterActive, static
	// after commit. Blank when no filter so existing layout is
	// unchanged.
	if c.sessionFilterActive || c.sessionFilter != "" {
		filterText := c.sessionFilter
		if c.sessionFilterActive {
			filterText += "_"
		}
		label := c.app.localizer.t(msgSidebarFilter, nil) + " "
		if c.sessionFilter == "" && c.sessionFilterActive {
			label = c.app.localizer.t(msgSidebarFilterPrompt, nil)
			filterText = ""
		}
		rows = append(rows,
			lipgloss.NewStyle().Foreground(t.Warning).Italic(true).
				Render(label+filterText),
			"")
		c.registerFilterHit(baseRow+len(rows)-2, width)
	}

	// The shared range helper accounts for variable-height parent, child, and
	// collapsed-child rows so visible session rows and semantic hit rows stay in
	// one geometry model.
	startIdx, endIdx := c.visibleSessionRange(height, visIdx)
	if !c.sessionsCollapsed && startIdx > 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).
			Render(" "+c.app.localizer.tf(msgSidebarMoreAbove, map[string]any{"count": startIdx})))
	}
	if !c.sessionsCollapsed && c.sessionFilter != "" && len(visIdx) == 0 {
		rows = append(rows, t.HintLabel.Render(" "+c.app.localizer.t(msgSidebarNoMatches, nil)))
	}
	for i := startIdx; i < endIdx; i++ {
		sIdx := visIdx[i]
		s := c.app.session.sessions[sIdx]
		row := baseRow + len(rows)
		c.registerSessionHit(row, width, sIdx, c.sessionRowCount(sIdx))
		marker := " "
		titleIndent := ""
		statusIndent := "  "
		titleStyle := lipgloss.NewStyle().Foreground(t.Fg)
		statusStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
		if isChildSession(s) {
			titleIndent = " └─ "
			if i+1 < endIdx {
				next := c.app.session.sessions[visIdx[i+1]]
				if isChildSession(next) && next.ParentSessionID == s.ParentSessionID {
					titleIndent = " ├─ "
				}
			}
			statusIndent = "    "
			titleStyle = titleStyle.Foreground(t.FgMuted).Italic(true)
		}
		if sIdx == c.app.session.selected && !c.sectionCursor && c.sectionFocus == sidebarSectionSessions {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
			titleStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
		}
		title := s.Title
		if title == "" {
			title = c.app.localizer.t(msgSidebarUntitled, nil)
		}
		if isChildSession(s) {
			title = childSessionDisplayTitle(s, title)
		}
		// Sidebar row layout: marker · indent · dot+space · title (truncated)
		// The status dot replaces the old second-line italic status text,
		// collapsing two lines into one and giving the status c.app splash of
		// colour/motion (spinner for running, ⚠ for waiting_permission,
		// muted · for idle). The raw status word is preserved on the second
		// line as c.app muted caption so accessibility doesn't lose information.
		dot := c.app.session.statusDot(s.Status)
		// UUU1: append `(N tasks)` badge when the session has open
		// pending/running §6.18 tasks. Loaded lazily on selectSession.
		taskBadge := ""
		if n := c.app.session.taskCountBySession[s.ID]; n > 0 {
			taskBadge = "  " + lipgloss.NewStyle().Foreground(t.Warning).Italic(true).
				Render(fmt.Sprintf("(%d tasks)", n))
		}
		// BBBBBBBB1: ↩ marker for sessions the user has previously
		// detached from (loaded from the local detached.json registry
		// at startup). Tells the user "this is one I walked away
		// from" without leaving the TUI to run `gact detached`.
		detachBadge := ""
		if c.app.previouslyDetached[s.ID] {
			detachBadge = " " + lipgloss.NewStyle().Foreground(t.Secondary).
				Render("↩")
		}
		childMeta := ""
		if isChildSession(s) {
			childMeta = childSidebarMeta(s)
		}
		// Reserve room for the actual prefix/badges so title truncation cannot
		// wrap into c.app second visual row inside the narrow bordered pane.
		prefix := marker + titleIndent + dot
		titleBudget := (width - 6) - lipgloss.Width(prefix) -
			lipgloss.Width(taskBadge) - lipgloss.Width(detachBadge)
		if childMeta != "" {
			titleBudget -= lipgloss.Width(" · " + childMeta)
		}
		minTitleBudget := 6
		if isChildSession(s) {
			minTitleBudget = 4
		}
		if titleBudget < minTitleBudget {
			titleBudget = minTitleBudget
		}
		if titleBudget < 1 {
			titleBudget = 6
		}
		titleLine := prefix + titleStyle.Render(textutil.Truncate(title, titleBudget)) + detachBadge + taskBadge
		// HHHHHHHH1: append humanized "Nm ago" to the status line so
		// users can tell which sessions are stale at c.app glance. Sits
		// next to the status word in the same muted italic — same
		// row, no extra vertical space. Zero UpdatedAt (fresh sessions
		// the backend hasn't filled in yet) renders without the age
		// suffix so the row isn't c.app lie.
		statusText := s.Status
		if tools := sessionToolCount(s); tools > 0 {
			statusText += fmt.Sprintf(" · %d tool%s", tools, plural(tools))
		}
		if !s.UpdatedAt.IsZero() && !isChildSession(s) {
			statusText += " · " + textutil.HumanAgeShort(time.Since(s.UpdatedAt.UTC()))
		}
		if isChildSession(s) {
			if childMeta != "" {
				titleLine += statusStyle.Render(" · " + childMeta)
			}
			rows = append(rows, titleLine)
			continue
		}
		statusBudget := width - 6 - lipgloss.Width(statusIndent)
		if statusBudget < 4 {
			statusBudget = 4
		}
		statusLine := statusIndent + statusStyle.Render(textutil.Truncate(statusText, statusBudget))
		rows = append(rows, titleLine, statusLine)
		if summary := c.sessionSummaryText(sIdx); summary != "" {
			summaryText := "summary: " + summary
			c.registerSessionSummaryHit(row+2, width, sIdx)
			rows = append(rows, statusIndent+statusStyle.Render(textutil.Truncate(summaryText, statusBudget)))
		}
		if activation := c.sessionActivationText(sIdx, statusBudget); activation != "" {
			rows = append(rows, statusIndent+statusStyle.Render(textutil.Truncate(activation, statusBudget)))
		}
		if !c.showChildSessions {
			if children := c.childSessionCount(s.ID); children > 0 {
				childWord := "children"
				if children == 1 {
					childWord = "child"
				}
				childText := fmt.Sprintf("%d %s collapsed", children, childWord)
				rows = append(rows, statusIndent+statusStyle.Render(textutil.Truncate(childText, statusBudget)))
			}
		}
	}
	if !c.sessionsCollapsed && endIdx < len(visIdx) {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).
			Render(" "+c.app.localizer.tf(msgSidebarMoreBelow, map[string]any{"count": len(visIdx) - endIdx})))
	}
	return rows
}
