package ui

// sidebar_right_view.go renders the right-hand sidebar column modules.

import (
	"fmt"
	"time"

	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (c *sidebarComponent) renderRight(width, height int, offsetX int) string {
	prevOffset := c.hitOffsetX
	prevFocus := c.hitFocus
	c.hitOffsetX = offsetX
	c.hitFocus = FocusRightSidebar
	defer func() {
		c.hitOffsetX = prevOffset
		c.hitFocus = prevFocus
	}()

	t := c.app.Theme
	style := t.Pane.Width(width - 2).Height(height)
	if c.app.focus == FocusRightSidebar {
		style = t.PaneFoc.Width(width - 2).Height(height)
	}
	c.registerFocusSurface(width, height)

	modules := c.rightModules()
	rows := make([]string, 0, height)
	for _, module := range modules {
		if len(rows) > 0 {
			rows = append(rows, "")
		}
		if module.Disabled {
			rows = append(rows, c.renderDisabledModule(module, width)...)
			continue
		}
		switch module.Definition.ID {
		case sidebarModuleContext:
			rows = append(rows, c.renderRightContextModuleRows(width)...)
		case sidebarModuleAgents:
			rows = append(rows, c.app.agent.renderAgentHierarchyModuleRows(width, len(rows), max(8, height-len(rows)-3))...)
		case sidebarModuleFiles:
			rows = append(rows, c.app.fileViewer.renderModuleRows(width, len(rows), max(8, height-len(rows)-3))...)
		case sidebarModuleSessions:
			rows = append(rows, c.renderRightSessionsModuleRows(width)...)
		default:
			rows = append(rows, c.renderDisabledModule(resolvedSidebarModule{
				Definition: module.Definition,
				Disabled:   true,
				Reason:     "renderer unavailable",
			}, width)...)
		}
	}
	if len(rows) == 0 {
		rows = append(rows, t.HintLabel.Render("no modules"))
	}

	body := lipgloss.JoinVertical(lipgloss.Left, rows...)
	if inner := height - 2; inner > 0 {
		body = clampLines(body, inner)
	}
	return style.Render(body)
}

func (c *sidebarComponent) renderRightContextModuleRows(width int) []string {
	t := c.app.Theme
	title := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).
		Render("▾ " + c.moduleTitle(sidebarModuleContext))
	rows := []string{title}
	c.registerContextHeaderHit(0, width)
	if len(c.app.session.contextFiles) == 0 {
		return append(rows, t.HintLabel.Render(c.app.localizer.t(msgSidebarNoFiles, nil)))
	}
	for i, cf := range c.app.session.contextFiles {
		row := len(rows)
		marker := " "
		selected := c.app.focus == c.hitFocus && c.sectionFocus == sidebarSectionContext && !c.sectionCursor && i == c.app.session.contextFileSel
		if selected {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
		}
		rows = append(rows, c.renderContextFileRows(cf, width, marker, selected, i)...)
		c.registerContextFileHit(row, width, i, cf)
	}
	return rows
}

func (c *sidebarComponent) renderRightSessionsModuleRows(width int) []string {
	t := c.app.Theme
	visIdx := c.app.session.visibleIndexes()
	titleText := c.moduleTitle(sidebarModuleSessions)
	disclosure := "▾ "
	if c.sessionsCollapsed {
		disclosure = "▸ "
		titleText += fmt.Sprintf(" (%d)", len(visIdx))
	}
	title := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).
		Render(disclosure + titleText)
	rows := []string{title}
	c.registerSectionHeaderHit(0, width, sidebarSectionSessions)
	if c.sessionsCollapsed {
		return append(rows, c.sessionCountsRow())
	}
	if len(c.app.session.sessions) == 0 {
		return append(rows,
			t.HintLabel.Render(c.app.localizer.t(msgSidebarNoSessions, nil)),
			t.HintKey.Render("n")+t.HintLabel.Render(" "+c.app.localizer.t(msgSidebarCreate, nil)))
	}
	startIdx, endIdx := c.visibleSessionRange(18, visIdx)
	if startIdx > 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).
			Render(" "+c.app.localizer.tf(msgSidebarMoreAbove, map[string]any{"count": startIdx})))
	}
	for i := startIdx; i < endIdx; i++ {
		sIdx := visIdx[i]
		s := c.app.session.sessions[sIdx]
		row := len(rows)
		c.registerSessionHit(row, width, sIdx, c.sessionRowCount(sIdx))
		marker := " "
		titleStyle := lipgloss.NewStyle().Foreground(t.Fg)
		if sIdx == c.app.session.selected && !c.sectionCursor && c.sectionFocus == sidebarSectionSessions {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
			titleStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
		}
		name := s.Title
		if name == "" {
			name = c.app.localizer.t(msgSidebarUntitled, nil)
		}
		dot := c.app.session.statusDot(s.Status)
		prefix := marker + dot + " "
		nameBudget := width - 6 - lipgloss.Width(prefix)
		if nameBudget < 6 {
			nameBudget = 6
		}
		rows = append(rows, prefix+titleStyle.Render(textutil.Truncate(name, nameBudget)))
		status := s.Status
		if !s.UpdatedAt.IsZero() {
			status += " · " + textutil.HumanAgeShort(time.Since(s.UpdatedAt.UTC()))
		}
		rows = append(rows, "  "+lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render(textutil.Truncate(status, width-8)))
		if summary := c.sessionSummaryText(sIdx); summary != "" {
			c.registerSessionSummaryHit(row+2, width, sIdx)
			rows = append(rows, "  "+lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render(textutil.Truncate("summary: "+summary, width-8)))
		}
		if activation := c.sessionActivationText(sIdx, width-8); activation != "" {
			rows = append(rows, "  "+lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render(textutil.Truncate(activation, width-8)))
		}
	}
	if endIdx < len(visIdx) {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).
			Render(" "+c.app.localizer.tf(msgSidebarMoreBelow, map[string]any{"count": len(visIdx) - endIdx})))
	}
	rows = append(rows, c.sessionCountsRow())
	return rows
}
