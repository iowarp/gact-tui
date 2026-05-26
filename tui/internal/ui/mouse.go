package ui

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

type mouseRect struct {
	x int
	y int
	w int
	h int
}

const mouseCommandButtonWidth = 4

func (a *App) renderMouseInputCommand(inputView string) string {
	lines := strings.Split(inputView, "\n")
	if len(lines) == 0 {
		return inputView
	}
	chip := lipgloss.NewStyle().
		Foreground(a.Theme.Bg).
		Background(a.Theme.Primary).
		Bold(true).
		Padding(0, 1).
		Render("/")
	prefix := chip + " "
	indent := strings.Repeat(" ", lipgloss.Width(prefix))
	for i := range lines {
		if i == 0 {
			lines[i] = prefix + lines[i]
			continue
		}
		lines[i] = indent + lines[i]
	}
	return strings.Join(lines, "\n")
}

func (a *App) mouseCommandButtonAt(x, y, sidebarW, convH int) bool {
	if !a.MouseEnabled {
		return false
	}
	inputTop := 1 + convH
	if a.transientHint != "" {
		inputTop++
	}
	buttonY := inputTop + 1
	buttonX := sidebarW + 1
	return y == buttonY && x >= buttonX && x < buttonX+mouseCommandButtonWidth
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
	y := (screenH - h) / 2
	if x < 0 {
		x = 0
	}
	if y < 0 {
		y = 0
	}
	return mouseRect{x: x, y: y, w: w, h: h}
}

func (r mouseRect) contains(x, y int) bool {
	return x >= r.x && x < r.x+r.w && y >= r.y && y < r.y+r.h
}

func (r mouseRect) contentRow(screenY int) int {
	return screenY - r.y - 2
}

func (r mouseRect) contentCol(screenX int) int {
	return screenX - r.x - 3
}

type mouseOverlay struct {
	open  bool
	view  func() string
	click func(mouseRect, tea.Mouse) (tea.Cmd, bool)
	wheel func(tea.MouseWheelMsg) (tea.Cmd, bool)
}

func (a *App) mouseOverlays() []mouseOverlay {
	// Reverse of viewMain's rendering order: the visually topmost modal
	// receives mouse input first.
	return []mouseOverlay{
		{open: a.quitConfirmOpen, view: a.viewQuitConfirm, click: a.handleQuitConfirmMouseClick},
		{open: a.mcpRemoveOpen, view: a.viewMcpRemove, click: a.handleMcpRemoveMouseClick},
		{open: a.mcpInstallOpen, view: a.viewMcpInstall, click: a.handleMcpInstallMouseClick},
		{open: a.catalogBrowserOpen, view: a.viewCatalogBrowser, click: a.handleCatalogBrowserMouseClick},
		{open: a.filePickerOpen, view: a.viewFilePicker, click: a.handleFilePickerMouseClick},
		{open: a.composeOpen, view: a.viewCompose, click: a.handleComposeMouseClick},
		{open: a.detailViewOpen, view: a.viewDetailView, click: a.handleDetailMouseClick, wheel: a.handleDetailMouseWheel},
		{open: a.contextAddOpen, view: a.viewContextAdd, click: a.handleContextAddMouseClick},
		{open: a.renameOpen, view: a.viewRename, click: a.handleRenameMouseClick},
		{open: a.workspaceSwitchOpen, view: a.viewWorkspaceSwitch, click: a.handleWorkspaceSwitchMouseClick, wheel: a.handleWorkspaceSwitchMouseWheel},
		{open: a.lmConfigOpen, view: a.viewLMConfig, click: a.handleLMConfigMouseClick},
		{open: a.doctorOpen, view: a.viewDoctor, click: a.handleDoctorMouseClick, wheel: a.handleDoctorMouseWheel},
		{open: a.metricsOpen, view: a.viewMetrics, click: a.handleMetricsMouseClick, wheel: a.handleMetricsMouseWheel},
		{open: a.settingsOpen, view: a.viewSettings, click: a.handleSettingsMouseClick, wheel: a.handleSettingsMouseWheel},
		{open: a.helpOpen, view: a.viewHelp, click: a.handleHelpMouseClick, wheel: a.handleHelpMouseWheel},
		{open: a.paletteOpen, view: a.viewPalette, click: a.handlePaletteMouseClick, wheel: a.handlePaletteMouseWheel},
	}
}

func (a *App) handleOverlayMouseWheel(m tea.MouseWheelMsg) (tea.Cmd, bool) {
	for _, ov := range a.mouseOverlays() {
		if !ov.open {
			continue
		}
		if ov.wheel != nil {
			return ov.wheel(m)
		}
		return nil, true
	}
	return nil, false
}

func (a *App) handleOverlayMouseClick(m tea.MouseClickMsg) (tea.Cmd, bool) {
	mouse := m.Mouse()
	for _, ov := range a.mouseOverlays() {
		if !ov.open {
			continue
		}
		if mouse.Button != tea.MouseLeft {
			return nil, true
		}
		rect := overlayMouseRect(ov.view(), a.width, a.height)
		if ov.click != nil {
			return ov.click(rect, mouse)
		}
		return nil, true
	}
	return nil, false
}

func mouseWheelDelta(button tea.MouseButton) int {
	switch button {
	case tea.MouseWheelUp:
		return -1
	case tea.MouseWheelDown:
		return 1
	default:
		return 0
	}
}

func moveSelectionByWheel(sel int, count int, button tea.MouseButton) int {
	return moveSelection(sel, count, mouseWheelDelta(button))
}

func moveScrollOffsetByWheel(scroll int, button tea.MouseButton) int {
	return moveScrollOffset(scroll, mouseWheelDelta(button))
}

func keyMsg(s string) tea.KeyPressMsg {
	switch s {
	case "enter":
		return tea.KeyPressMsg{Code: tea.KeyEnter}
	case "esc":
		return tea.KeyPressMsg{Code: tea.KeyEsc}
	case "up":
		return tea.KeyPressMsg{Code: tea.KeyUp}
	case "down":
		return tea.KeyPressMsg{Code: tea.KeyDown}
	case "left":
		return tea.KeyPressMsg{Code: tea.KeyLeft}
	case "right":
		return tea.KeyPressMsg{Code: tea.KeyRight}
	case "tab":
		return tea.KeyPressMsg{Code: tea.KeyTab}
	case "backspace":
		return tea.KeyPressMsg{Code: tea.KeyBackspace}
	case " ":
		return tea.KeyPressMsg{Code: ' ', Text: " "}
	default:
		if len(s) == 1 {
			return tea.KeyPressMsg{Code: []rune(s)[0], Text: s}
		}
		return tea.KeyPressMsg{Text: s}
	}
}

func textKeyMsg(s string) tea.KeyPressMsg {
	return tea.KeyPressMsg{Text: s}
}

func (a *App) closeOverlayOnOutside(rect mouseRect, mouse tea.Mouse, close func()) (tea.Cmd, bool) {
	if rect.contains(mouse.X, mouse.Y) {
		return nil, true
	}
	close()
	return nil, true
}

func (a *App) handleDetailMouseWheel(m tea.MouseWheelMsg) (tea.Cmd, bool) {
	a.detailScroll = moveScrollOffsetByWheel(a.detailScroll, m.Mouse().Button)
	return nil, true
}

func (a *App) handleDetailMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	return a.closeOverlayOnOutside(rect, mouse, a.closeDetailView)
}

func (a *App) handleWorkspaceSwitchMouseWheel(m tea.MouseWheelMsg) (tea.Cmd, bool) {
	if len(a.workspaces) == 0 {
		return nil, true
	}
	a.workspaceSwitchSel = moveSelectionByWheel(a.workspaceSwitchSel, len(a.workspaces), m.Mouse().Button)
	return nil, true
}

func (a *App) handleWorkspaceSwitchMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	return a.closeOverlayOnOutside(rect, mouse, a.closeWorkspaceSwitchModal)
}

func (a *App) handleQuitConfirmMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	if !rect.contains(mouse.X, mouse.Y) {
		a.quitConfirmSelected = 1
		_, cmd := a.applyQuitConfirmSelection()
		return cmd, true
	}
	return nil, true
}

func (a *App) handlePaletteMouseWheel(m tea.MouseWheelMsg) (tea.Cmd, bool) {
	searchMode := a.isSearchMode()
	rowCount := len(a.paletteMatches())
	if searchMode {
		rowCount = len(a.searchMatches)
	}
	a.paletteSel = moveSelectionByWheel(a.paletteSel, rowCount, m.Mouse().Button)
	return nil, true
}

func (a *App) handlePaletteMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	return a.closeOverlayOnOutside(rect, mouse, a.closePalette)
}

func (a *App) handleHelpMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	if !rect.contains(mouse.X, mouse.Y) {
		a.helpOpen = false
		a.helpScroll = 0
		return nil, true
	}
	return nil, true
}

func (a *App) handleHelpMouseWheel(m tea.MouseWheelMsg) (tea.Cmd, bool) {
	a.helpScroll = moveScrollOffsetByWheel(a.helpScroll, m.Mouse().Button)
	return nil, true
}

func (a *App) handleFilePickerMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	if a.filePicker == nil {
		a.closeFilePicker()
		return nil, true
	}
	if !rect.contains(mouse.X, mouse.Y) {
		a.closeFilePicker()
		return nil, true
	}
	return nil, true
}

func (a *App) handleCatalogBrowserMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	if a.catalogBrowser == nil {
		a.closeCatalogBrowser()
		return nil, true
	}
	if !rect.contains(mouse.X, mouse.Y) {
		a.closeCatalogBrowser()
		return nil, true
	}
	return nil, true
}

func (a *App) handleMcpRemoveMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	return a.closeOverlayOnOutside(rect, mouse, a.closeMcpRemoveModal)
}

func (a *App) handleMcpInstallMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	return a.closeOverlayOnOutside(rect, mouse, a.closeMcpInstallModal)
}

func (a *App) handleSettingsMouseWheel(m tea.MouseWheelMsg) (tea.Cmd, bool) {
	if a.settings == nil {
		a.settings = &settingsState{}
	}
	switch m.Mouse().Button {
	case tea.MouseWheelUp:
		a.handleSettingsKey(keyMsg("up"))
	case tea.MouseWheelDown:
		a.handleSettingsKey(keyMsg("down"))
	}
	return nil, true
}

func (a *App) handleSettingsMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	if a.settings == nil {
		a.settings = &settingsState{}
	}
	return a.closeOverlayOnOutside(rect, mouse, a.closeSettingsModal)
}

func (a *App) handleMetricsMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	return a.closeOverlayOnOutside(rect, mouse, func() { a.metricsOpen = false })
}

func (a *App) handleMetricsMouseWheel(m tea.MouseWheelMsg) (tea.Cmd, bool) {
	if a.metrics == nil {
		return nil, true
	}
	a.metrics.scroll = moveScrollOffsetByWheel(a.metrics.scroll, m.Mouse().Button)
	return nil, true
}

func (a *App) handleDoctorMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	if !rect.contains(mouse.X, mouse.Y) {
		a.doctorOpen = false
		return nil, true
	}
	return nil, true
}

func (a *App) handleDoctorMouseWheel(m tea.MouseWheelMsg) (tea.Cmd, bool) {
	if a.doctor == nil {
		return nil, true
	}
	a.doctor.scroll = moveScrollOffsetByWheel(a.doctor.scroll, m.Mouse().Button)
	return nil, true
}

func (a *App) handleLMConfigMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	return a.closeOverlayOnOutside(rect, mouse, a.closeLMConfigModal)
}

func (a *App) handleRenameMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	return a.closeOverlayOnOutside(rect, mouse, a.closeRenameModal)
}

func (a *App) handleContextAddMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	return a.closeOverlayOnOutside(rect, mouse, a.closeContextAddModal)
}

func (a *App) handleComposeMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	return a.closeOverlayOnOutside(rect, mouse, a.cancelCompose)
}
