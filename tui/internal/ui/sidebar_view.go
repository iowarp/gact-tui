package ui

// sidebar_view.go renders the sidebar and its session-counts row.

import (
	"fmt"

	"charm.land/lipgloss/v2"
)

func (c *sidebarComponent) render(width, height int) string {
	prevOffset := c.hitOffsetX
	prevFocus := c.hitFocus
	c.hitOffsetX = 0
	c.hitFocus = FocusSidebar
	defer func() {
		c.hitOffsetX = prevOffset
		c.hitFocus = prevFocus
	}()
	t := c.app.Theme
	// CCCCC1: lipgloss .Height(N) is OUTER height (border included).
	// Previously we passed Height(height-2) treating it as inner content
	// — that left the bordered pane 2 rows short, so the sidebar's `╰╯`
	// floated up while the conversation pane stayed at its full height.
	style := t.Pane.Width(width - 2).Height(height)
	if c.app.focus == FocusSidebar {
		style = t.PaneFoc.Width(width - 2).Height(height)
	}
	c.registerFocusSurface(width, height)
	rows := []string{}
	if c.hasEnabledModule(sidebarModuleSessions) {
		rows = append(rows, c.renderSessionsModuleRows(width, height, len(rows))...)
	}

	for _, module := range c.disabledModules() {
		rows = append(rows, "")
		rows = append(rows, c.renderDisabledModule(module, width)...)
	}

	if c.hasEnabledModule(sidebarModuleAgents) {
		if len(rows) > 0 {
			rows = append(rows, "")
		}
		rows = append(rows, c.app.agent.renderAgentHierarchyModuleRows(width, len(rows), 8)...)
	}

	if c.hasEnabledModule(sidebarModuleFiles) {
		if len(rows) > 0 {
			rows = append(rows, "")
		}
		rows = append(rows, c.app.fileViewer.renderModuleRows(width, len(rows), 8)...)
	}

	// CONTEXT section — show files in the current session's context.
	if c.hasEnabledModule(sidebarModuleContext) && c.app.session.selected >= 0 && c.app.session.selected < len(c.app.session.sessions) {
		contextLines := c.contextRowCount()
		footerLines := 0
		if len(c.app.session.sessions) > 0 {
			footerLines = 2
		}
		if inner := height - 2; inner > 0 {
			allowedBeforeContext := inner - contextLines - footerLines
			if allowedBeforeContext < 1 {
				allowedBeforeContext = 1
			}
			if len(rows) > allowedBeforeContext {
				rows = rows[:allowedBeforeContext]
				rows[len(rows)-1] = lipgloss.NewStyle().Foreground(t.FgMuted).
					Render(" " + c.app.localizer.tf(msgSidebarMoreBelow, map[string]any{"count": 1}))
			}
		}
		contextTitle := c.moduleTitle(sidebarModuleContext)
		contextDisclosure := "▾ "
		if c.contextCollapsed {
			contextDisclosure = "▸ "
			contextTitle += fmt.Sprintf(" · %d", len(c.app.session.contextFiles))
		}
		contextPrefix := ""
		if c.app.focus == c.hitFocus && (c.sessionsCollapsed || c.sectionCursor) && c.sectionFocus == sidebarSectionContext {
			contextPrefix = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
		}
		rows = append(rows,
			contextPrefix+lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render(contextDisclosure+contextTitle))
		contextHeaderRow := len(rows) - 1
		c.registerContextHeaderHit(contextHeaderRow, width)
		if !c.contextCollapsed {
			if len(c.app.session.contextFiles) == 0 {
				rows = append(rows, t.HintLabel.Render(c.app.localizer.t(msgSidebarNoFiles, nil)))
			}
			for i, cf := range c.app.session.contextFiles {
				row := len(rows)
				cf := cf
				marker := " "
				selected := c.app.focus == c.hitFocus && c.sectionFocus == sidebarSectionContext && !c.sectionCursor && i == c.app.session.contextFileSel
				if selected {
					marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
				}
				rows = append(rows, c.renderContextFileRows(cf, width, marker, selected, i)...)
				c.registerContextFileHit(row, width, i, cf)
			}
		}
	}

	// R2: sidebar footer — show "N active · M archived" so users
	// can tell at c.app glance how much history is live vs hidden under
	// the `h` toggle. Placed after CONTEXT so it sits at the bottom
	// of the pane regardless of CONTEXT's length.
	active, archived := 0, 0
	for _, s := range c.app.session.sessions {
		if s.ArchivedAt != nil {
			archived++
		} else {
			active++
		}
	}
	if active > 0 || archived > 0 {
		label := c.app.localizer.tf(msgSidebarCountsActiveFirst, map[string]any{"active": active, "archived": archived})
		if c.showArchived {
			label = c.app.localizer.tf(msgSidebarCountsArchivedFirst, map[string]any{"active": active, "archived": archived})
		}
		countsRow := len(rows) + 1
		rows = append(rows,
			"",
			lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).Render(label))
		c.registerCountsHit(countsRow, width)
	}

	body := lipgloss.JoinVertical(lipgloss.Left, rows...)
	// RRRRRRRRR1: safety clamp — budget math above can still be off
	// by one on edge cases (certain session-count × context-file
	// combinations), and lipgloss.Height(h) pads but doesn't
	// truncate, so an over-tall body would draw past the border and
	// push sibling panes down. clampLines hard-caps at the pane's
	// inner height so the border always closes where expected.
	if inner := height - 2; inner > 0 {
		body = clampLines(body, inner)
	}
	return style.Render(body)
}

func (c *sidebarComponent) sessionCountsRow() string {
	active, archived := 0, 0
	for _, s := range c.app.session.sessions {
		if s.ArchivedAt != nil {
			archived++
		} else {
			active++
		}
	}
	return lipgloss.NewStyle().Foreground(c.app.Theme.FgFaint).Italic(true).
		Render(c.app.localizer.tf(msgSidebarCountsActiveFirst, map[string]any{"active": active, "archived": archived}))
}
