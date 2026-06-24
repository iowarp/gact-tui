package ui

// mouseOverlay: a generic open/view/close overlay wrapper driven by mouse interaction.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

type mouseOverlay struct {
	open         bool
	view         func() string
	prepare      func(*App)
	valid        func(*App) bool
	closeOutside func(*App)
}

func overlayMouseRect(top string, screenW, screenH int) mouseRect {
	lines := strings.Split(top, "\n")
	h := len(lines)
	w := 0
	for _, line := range lines {
		if lw := lipgloss.Width(line); lw > w {
			w = lw
		}
	}
	x := (screenW - w) / 2
	y := modalOverlayTop(screenH, h)
	if x < 0 {
		x = 0
	}
	return mouseRect{x: x, y: y, w: w, h: h}
}

func (c *interactionComponent) mouseOverlays() []mouseOverlay {
	a := c.app
	// Reverse of viewMain's rendering order: the visually topmost modal
	// receives mouse input first.
	return []mouseOverlay{
		{open: a.quitConfirm.open, view: a.quitConfirm.view, closeOutside: func(app *App) { app.quitConfirm.open = false }},
		{open: a.mcpRemove.open, view: a.mcpRemove.view, closeOutside: func(app *App) { app.mcpRemove.close() }},
		{open: a.mcpInstall.open, view: a.mcpInstall.view, closeOutside: func(app *App) { app.mcpInstall.close() }},
		{open: a.agentEdit.open, view: a.agentEdit.view, closeOutside: func(app *App) { app.agentEdit.close() }},
		{open: a.expertPackInstall.open, view: a.expertPackInstall.view, closeOutside: func(app *App) { app.expertPackInstall.close() }},
		{open: a.agentBlueprintManage.open, view: a.agentBlueprintManage.view, closeOutside: func(app *App) { app.agentBlueprintManage.close() }},
		{
			open:         a.filePicker.open,
			view:         a.filePicker.view,
			valid:        func(app *App) bool { return app.filePicker.open },
			closeOutside: func(app *App) { app.filePicker.close() },
		},
		{
			open:         a.inputComposer.composeOpen,
			view:         a.inputComposer.viewCompose,
			closeOutside: func(app *App) { app.inputComposer.cancelCompose() },
		},
		{open: a.detail.visible, view: a.detail.view, closeOutside: func(app *App) { app.detail.close() }},
		{open: a.session.setupOpen, view: a.session.viewSetup, closeOutside: func(app *App) { app.session.closeSetup() }},
		{
			open:         a.catalog.open,
			view:         a.catalog.view,
			valid:        func(app *App) bool { return app.catalog.current != nil },
			closeOutside: func(app *App) { app.catalog.close() },
		},
		{open: a.contextAdd.open, view: a.contextAdd.view, closeOutside: func(app *App) { app.contextAdd.close() }},
		{open: a.conversation.actions.open, view: a.conversation.viewActions, closeOutside: func(app *App) { app.conversation.closeActions() }},
		{open: a.askUser.open, view: a.askUser.view, closeOutside: func(app *App) { app.askUser.close() }},
		{open: a.retryNotes.open, view: a.retryNotes.view, closeOutside: func(app *App) { app.retryNotes.close() }},
		{open: a.retryModel.open, view: a.retryModel.view, closeOutside: func(app *App) { app.retryModel.close() }},
		{open: a.contextActions.open, view: a.contextActions.view, closeOutside: func(app *App) { app.contextActions.close() }},
		{open: a.session.actions.open, view: a.session.viewActions, closeOutside: func(app *App) { app.session.closeActions() }},
		{open: a.rename.open, view: a.rename.view, closeOutside: func(app *App) { app.rename.close() }},
		{open: a.workspace.switchOpen, view: a.workspace.view, closeOutside: func(app *App) { app.workspace.close() }},
		{open: a.lmConfig.open, view: a.lmConfig.view, closeOutside: func(app *App) { app.lmConfig.close() }},
		{open: a.doctor.open, view: a.doctor.view, closeOutside: func(app *App) { app.doctor.reset() }},
		{open: a.metrics.open, view: a.metrics.view, closeOutside: func(app *App) { app.metrics.open = false }},
		{open: a.sidebarLayout.open, view: a.sidebar.viewLayoutEditor, closeOutside: func(app *App) { app.sidebar.closeLayoutEditor() }},
		{
			open:         a.settings.open,
			view:         a.settings.view,
			closeOutside: func(app *App) { app.settings.close() },
		},
		{
			open: a.help.open,
			view: a.help.view,
			closeOutside: func(app *App) {
				app.help.open = false
				app.help.scroll = 0
			},
		},
		{open: a.cmdPalette.paletteOpen, view: func() string { return a.cmdPalette.view() }, closeOutside: func(app *App) { app.cmdPalette.close() }},
	}
}

func (c *interactionComponent) mouseOverlayOpen() bool {
	for _, ov := range c.mouseOverlays() {
		if ov.open {
			return true
		}
	}
	return false
}

func (c *interactionComponent) mouseClickInsideTopOverlay(mouse tea.Mouse) bool {
	a := c.app
	for _, ov := range c.mouseOverlays() {
		if !ov.open {
			continue
		}
		if ov.prepare != nil {
			ov.prepare(a)
		}
		if ov.valid != nil && !ov.valid(a) {
			return false
		}
		return overlayMouseRect(ov.view(), a.width, a.height).contains(mouse.X, mouse.Y)
	}
	return false
}

func (c *interactionComponent) handleOverlayMouseWheel(m tea.MouseWheelMsg) (tea.Cmd, bool) {
	for _, ov := range c.mouseOverlays() {
		if !ov.open {
			continue
		}
		return nil, true
	}
	return nil, false
}

func (c *interactionComponent) handleOverlayMouseClick(m tea.MouseClickMsg) (tea.Cmd, bool) {
	a := c.app
	mouse := m.Mouse()
	for _, ov := range c.mouseOverlays() {
		if !ov.open {
			continue
		}
		if mouse.Button != tea.MouseLeft {
			return nil, true
		}
		if ov.prepare != nil {
			ov.prepare(a)
		}
		if ov.valid != nil && !ov.valid(a) {
			if ov.closeOutside != nil {
				ov.closeOutside(a)
			}
			return nil, true
		}
		rect := overlayMouseRect(ov.view(), a.width, a.height)
		if !rect.contains(mouse.X, mouse.Y) && ov.closeOutside != nil {
			ov.closeOutside(a)
		}
		return nil, true
	}
	return nil, false
}
