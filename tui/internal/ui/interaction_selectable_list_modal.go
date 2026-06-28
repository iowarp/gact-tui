package ui

// interaction_selectable_list_modal.go renders the reusable selectable-list modal.

import (
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

type selectableListModalOptions struct {
	frame          modalFrameOptions
	rows           []string
	list           modalListRender
	listStart      int
	listWidth      int
	bodyRows       int
	window         scrollWindow
	wheelID        string
	wheelAction    uiWheelAction
	railAction     func(*App, int) tea.Cmd
	surfaceWheelID string
}

func (m *modalkit) renderSelectableListModal(opts selectableListModalOptions) modalFrameRender {
	frame := opts.frame
	registerButtons := !frame.suppressButtonHits
	registerTabs := !frame.suppressTabHits
	buttons := frame.buttons
	tabs := frame.tabs
	tabPadding := frame.tabPadding
	tabSpacing := frame.tabSpacing
	frame.suppressButtonHits = true
	frame.suppressTabHits = true
	body := lipgloss.JoinVertical(lipgloss.Left, opts.rows...)
	if opts.bodyRows > 0 {
		body = m.renderScrollableModalBody(body, opts.bodyRows, frame.width, opts.window)
	}
	frame.body = body
	rendered := m.renderModalFrameWithLayout(frame)
	if opts.surfaceWheelID != "" {
		m.app.interaction.registerModalSurfaceAndBodyWheel(rendered, opts.surfaceWheelID, 0, nil)
	}
	if opts.wheelID != "" && opts.wheelAction != nil && rendered.bodyRow >= 0 && opts.bodyRows > 0 {
		bodyWidth := modalScrollableBodyWidth(lipgloss.Width(rendered.modal))
		m.app.interaction.registerModalContentWheelHit(rendered.modal, opts.wheelID+":body:wheel", rendered.bodyRow, 0, bodyWidth, opts.bodyRows, opts.wheelAction)
	}
	if len(opts.list.rows) > 0 || len(opts.list.hits) > 0 {
		m.app.interaction.registerModalListRegion(rendered.modal, rendered.bodyRow+opts.listStart, 0, opts.listWidth, opts.list, opts.wheelID, opts.wheelAction)
	}
	if opts.railAction != nil && opts.wheelID != "" {
		m.app.interaction.registerSelectableListRailHits(rendered, opts.wheelID, opts.window, opts.bodyRows, opts.railAction)
	}
	if rendered.tabRow >= 0 && registerTabs {
		m.app.interaction.registerModalTabsWithLayout(rendered.modal, rendered.tabRow, tabs, tabPadding, tabSpacing)
	}
	if registerButtons {
		m.app.interaction.registerModalButtons(rendered.modal, 0, rendered.buttonCol, buttons)
	}
	return rendered
}
