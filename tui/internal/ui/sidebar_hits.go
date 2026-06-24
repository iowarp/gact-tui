package ui

// sidebar_hits.go registers sidebar mouse hit regions for sections, sessions, context, and counts.

import (
	"fmt"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (c *sidebarComponent) registerSectionHeaderHit(row int, width int, section sidebarSection) {
	if c.app.interaction.hits == nil {
		return
	}
	zone := c.hitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	id := "sidebar:sessions:header"
	if zone == FocusRightSidebar {
		id = "right-" + id
	}
	if section == sidebarSectionContext {
		id = "sidebar:context:header"
		if zone == FocusRightSidebar {
			id = "right-sidebar:context:header"
		}
	} else if section == sidebarSectionAgents {
		id = "sidebar:agents:header"
		if zone == FocusRightSidebar {
			id = "right-sidebar:agents:header"
		}
	} else if section == sidebarSectionFiles {
		id = "sidebar:files:header"
		if zone == FocusRightSidebar {
			id = "right-sidebar:files:header"
		}
	}
	c.registerContentHit(id, row, width, 1, func(app *App) tea.Cmd {
		app.focus = zone
		app.sidebar.activateSection(section)
		return nil
	})
}

func (c *sidebarComponent) registerFocusSurface(width, height int) {
	if c.app.interaction.hits == nil || width <= 0 || height <= 0 {
		return
	}
	zone := c.hitFocus
	id := "sidebar:focus"
	if zone == FocusRightSidebar {
		id = "right-sidebar:focus"
	} else {
		zone = FocusSidebar
	}
	rect := c.focusSurfaceRect(width, height)
	c.app.interaction.registerFocusSurfaceHit(id, rect, zone, nil)
	c.app.interaction.registerScreenWheelHit(id+":wheel", rect, func(app *App, button tea.MouseButton) tea.Cmd {
		return app.interaction.handleSidebarWheel(zone, button)
	})
}

func (c *sidebarComponent) focusSurfaceRect(width, height int) mouseRect {
	return mouseRect{x: c.hitOffsetX, y: 1, w: renderedPaneOuterWidth(width), h: height}
}

func (c *sidebarComponent) registerSessionHit(row int, width int, index int, rowCount int) {
	if c.app.interaction.hits == nil || index < 0 || index >= len(c.app.session.sessions) || rowCount <= 0 {
		return
	}
	id := c.app.session.sessions[index].ID
	if id == "" {
		id = fmt.Sprintf("%d", index)
	}
	zone := c.hitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	} else {
		id = "right-" + id
	}
	c.registerContentHitActions(
		"sidebar:session:"+id,
		row,
		width,
		rowCount,
		func(app *App) tea.Cmd {
			app.focus = zone
			return app.sidebar.activateSession(index)
		},
		func(app *App) tea.Cmd {
			app.focus = zone
			return app.session.openActionsForIndex(index)
		},
	)
}

func (c *sidebarComponent) registerSessionSummaryHit(row int, width int, index int) {
	if c.app.interaction.hits == nil || index < 0 || index >= len(c.app.session.sessions) {
		return
	}
	id := c.app.session.sessions[index].ID
	if id == "" {
		id = fmt.Sprintf("%d", index)
	}
	zone := c.hitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	} else {
		id = "right-" + id
	}
	c.registerContentHitActions(
		"sidebar:session:"+id+":summary",
		row,
		width,
		1,
		func(app *App) tea.Cmd {
			app.focus = zone
			app.sidebar.sectionFocus = sidebarSectionSessions
			app.sidebar.sectionCursor = false
			if index != app.session.selected {
				app.session.selectSessionIndex(index)
			}
			return app.sidebar.openSessionSummaryDetail(index)
		},
		func(app *App) tea.Cmd {
			app.focus = zone
			return app.session.openActionsForIndex(index)
		},
	)
}

func (c *sidebarComponent) registerFilterHit(row int, width int) {
	if c.app.interaction.hits == nil {
		return
	}
	c.registerContentHit("sidebar:filter", row, width, 1, func(app *App) tea.Cmd {
		app.session.enterFilter(false)
		return nil
	})
}

func (c *sidebarComponent) registerContextHeaderHit(row int, width int) {
	c.registerSectionHeaderHit(row, width, sidebarSectionContext)
}

func (c *sidebarComponent) registerContextFileHit(row int, width int, index int, cf gact.ContextFile) {
	if c.app.interaction.hits == nil {
		return
	}
	zone := c.hitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	id := "sidebar:context:file:" + cf.Path
	if zone == FocusRightSidebar {
		id = "right-sidebar:context:file:" + cf.Path
	}
	c.registerContentHitActions(
		id,
		row,
		width,
		c.contextFileRowCount(index),
		func(app *App) tea.Cmd {
			app.focus = zone
			app.sidebar.sectionFocus = sidebarSectionContext
			app.sidebar.sectionCursor = true
			app.session.selectContextFile(index)
			return app.contextFiles.openDetail(cf)
		},
		func(app *App) tea.Cmd {
			return app.contextActions.openForIndexInZone(index, zone)
		},
	)
}

func (c *sidebarComponent) registerCountsHit(row int, width int) {
	if c.app.interaction.hits == nil {
		return
	}
	zone := c.hitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	c.registerContentHit("sidebar:counts", row, width, 1, func(app *App) tea.Cmd {
		app.focus = zone
		return app.session.toggleArchived()
	})
}

func (c *sidebarComponent) registerContentHit(id string, row int, width int, height int, action uiHitAction) {
	c.registerContentHitActions(id, row, width, height, action, nil)
}

func (c *sidebarComponent) registerContentHitActions(id string, row int, width int, height int, action uiHitAction, secondaryAction uiHitAction) {
	if c.app.interaction.hits == nil {
		return
	}
	rect := c.contentRect(row, width)
	if height < 1 {
		height = 1
	}
	rect.h = height
	c.app.interaction.registerScreenHitActions(id, rect, action, secondaryAction)
}

func (c *sidebarComponent) contentRect(row int, width int) mouseRect {
	w := width - 4
	if w < 1 {
		w = 1
	}
	return mouseRect{x: c.hitOffsetX + 2, y: row + 2, w: w, h: 1}
}
