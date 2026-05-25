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
		{open: a.catalogBrowserOpen, view: a.viewCatalogBrowser, click: a.handleCatalogBrowserMouseClick, wheel: a.handleCatalogBrowserMouseWheel},
		{open: a.filePickerOpen, view: a.viewFilePicker, click: a.handleFilePickerMouseClick, wheel: a.handleFilePickerMouseWheel},
		{open: a.composeOpen, view: a.viewCompose, click: a.handleComposeMouseClick},
		{open: a.detailViewOpen, view: a.viewDetailView, click: a.handleDetailMouseClick, wheel: a.handleDetailMouseWheel},
		{open: a.contextAddOpen, view: a.viewContextAdd, click: a.handleContextAddMouseClick},
		{open: a.renameOpen, view: a.viewRename, click: a.handleRenameMouseClick},
		{open: a.workspaceSwitchOpen, view: a.viewWorkspaceSwitch, click: a.handleWorkspaceSwitchMouseClick, wheel: a.handleWorkspaceSwitchMouseWheel},
		{open: a.lmConfigOpen, view: a.viewLMConfig, click: a.handleLMConfigMouseClick},
		{open: a.doctorOpen, view: a.viewDoctor, click: a.handleDoctorMouseClick},
		{open: a.metricsOpen, view: a.viewMetrics, click: a.handleMetricsMouseClick},
		{open: a.settingsOpen, view: a.viewSettings, click: a.handleSettingsMouseClick, wheel: a.handleSettingsMouseWheel},
		{open: a.helpOpen, view: a.viewHelp, click: a.handleHelpMouseClick},
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
	switch m.Mouse().Button {
	case tea.MouseWheelUp:
		if a.detailScroll > 0 {
			a.detailScroll--
		}
	case tea.MouseWheelDown:
		a.detailScroll++
	}
	return nil, true
}

func (a *App) handleDetailMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	return a.closeOverlayOnOutside(rect, mouse, func() {
		a.detailViewOpen = false
		a.detailView = nil
		a.detailScroll = 0
	})
}

func (a *App) handleWorkspaceSwitchMouseWheel(m tea.MouseWheelMsg) (tea.Cmd, bool) {
	if len(a.workspaces) == 0 {
		return nil, true
	}
	switch m.Mouse().Button {
	case tea.MouseWheelUp:
		if a.workspaceSwitchSel > 0 {
			a.workspaceSwitchSel--
		}
	case tea.MouseWheelDown:
		if a.workspaceSwitchSel < len(a.workspaces)-1 {
			a.workspaceSwitchSel++
		}
	}
	return nil, true
}

func (a *App) handleWorkspaceSwitchMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	if !rect.contains(mouse.X, mouse.Y) {
		a.workspaceSwitchOpen = false
		return nil, true
	}
	return nil, true
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
	delta := mouseWheelDelta(m.Mouse().Button)
	if delta == 0 {
		return nil, true
	}
	searchMode := a.isSearchMode()
	rowCount := len(a.paletteMatches())
	if searchMode {
		rowCount = len(a.searchMatches)
	}
	if delta < 0 && a.paletteSel > 0 {
		a.paletteSel--
	}
	if delta > 0 && a.paletteSel < rowCount-1 {
		a.paletteSel++
	}
	return nil, true
}

func (a *App) handlePaletteMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	if !rect.contains(mouse.X, mouse.Y) {
		a.paletteOpen = false
		return nil, true
	}
	return nil, true
}

func (a *App) handleHelpMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	if !rect.contains(mouse.X, mouse.Y) {
		a.helpOpen = false
		return nil, true
	}
	if rect.contentRow(mouse.Y) == 2 {
		col := rect.contentCol(mouse.X)
		if col < 0 {
			return nil, true
		}
		switch {
		case col < 16:
			a.helpTab = 0
		case col < 34:
			a.helpTab = 1
		default:
			a.helpTab = 2
		}
	}
	return nil, true
}

func (a *App) handleFilePickerMouseWheel(m tea.MouseWheelMsg) (tea.Cmd, bool) {
	if a.filePicker == nil {
		return nil, true
	}
	matches := a.filePickerMatches()
	switch m.Mouse().Button {
	case tea.MouseWheelUp:
		if a.filePicker.sel > 0 {
			a.filePicker.sel--
		}
	case tea.MouseWheelDown:
		if a.filePicker.sel < len(matches)-1 {
			a.filePicker.sel++
		}
	}
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

func (a *App) handleCatalogBrowserMouseWheel(m tea.MouseWheelMsg) (tea.Cmd, bool) {
	if a.catalogBrowser == nil {
		return nil, true
	}
	cb := a.catalogBrowser
	switch m.Mouse().Button {
	case tea.MouseWheelUp:
		if cb.sel > 0 {
			cb.sel--
		}
	case tea.MouseWheelDown:
		if cb.sel < len(cb.items)-1 {
			cb.sel++
		}
	}
	cb.offset = catalogBrowserClampOffset(cb.sel, cb.offset, len(cb.items))
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
	if idx, ok := a.catalogBrowserIndexAtContentRow(rect.contentRow(mouse.Y)); ok {
		a.catalogBrowser.sel = idx
		a.catalogBrowser.offset = catalogBrowserClampOffset(idx, a.catalogBrowser.offset, len(a.catalogBrowser.items))
		_, cmd := a.handleCatalogBrowserKey(keyMsg("enter"))
		return cmd, true
	}
	return nil, true
}

func (a *App) catalogBrowserIndexAtContentRow(row int) (int, bool) {
	if a.catalogBrowser == nil {
		return 0, false
	}
	cb := a.catalogBrowser
	renderRow := 2
	if cb.offset > 0 {
		if row == renderRow {
			return 0, false
		}
		renderRow++
	}
	start := cb.offset
	end := min(len(cb.items), start+catalogBrowserRowBudget)
	for i := start; i < end; i++ {
		if row == renderRow || (cb.items[i].desc != "" && row == renderRow+1) {
			return i, true
		}
		renderRow++
		if cb.items[i].desc != "" {
			renderRow++
		}
	}
	return 0, false
}

func (a *App) handleMcpRemoveMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	if !rect.contains(mouse.X, mouse.Y) {
		a.mcpRemoveOpen = false
		a.mcpRemoveOptions = nil
		return nil, true
	}
	return nil, true
}

func (a *App) handleMcpInstallMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	if !rect.contains(mouse.X, mouse.Y) {
		a.mcpInstallOpen = false
		a.mcpInstallInput = ""
		a.mcpInstallErr = ""
	}
	return nil, true
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
	if !rect.contains(mouse.X, mouse.Y) {
		a.settingsOpen = false
		return nil, true
	}
	row := rect.contentRow(mouse.Y)
	if row == 2 {
		col := rect.contentCol(mouse.X)
		tab := settingsTabAtColumn(a, col)
		if tab >= 0 {
			a.settings.tab = tab
		}
		return nil, true
	}
	if idx, ok := a.settingsSelectableIndexAtContentRow(row); ok {
		switch a.settings.tab {
		case 1:
			a.settings.agentSel = idx
		case 2:
			a.settings.themeSel = idx
			a.previewTheme(idx)
		case 3:
			a.settings.tuiRow = idx
		case 4:
			a.settings.languageSel = idx
			a.previewLanguage(idx)
		}
		_, cmd := a.handleSettingsKey(keyMsg("enter"))
		return cmd, true
	}
	return nil, true
}

func settingsTabAtColumn(a *App, col int) int {
	if col < 0 {
		return -1
	}
	labels := []string{
		a.localizer.t(msgSettingsTabModel, nil),
		a.localizer.t(msgSettingsTabAgent, nil),
		a.localizer.t(msgSettingsTabTheme, nil),
		a.localizer.t(msgSettingsTabTUI, nil),
		a.localizer.t(msgSettingsTabLanguage, nil),
	}
	x := 0
	for i, label := range labels {
		w := lipgloss.Width(label) + 4
		if col >= x && col < x+w {
			return i
		}
		x += w + 1
	}
	return -1
}

func (a *App) settingsSelectableIndexAtContentRow(row int) (int, bool) {
	if a.settings == nil {
		return 0, false
	}
	switch a.settings.tab {
	case 0:
		if row == 6 {
			return 0, true
		}
	case 1:
		start, end := a.visibleAgentRange()
		base := 6
		if start > 0 {
			base++
		}
		idx := start + row - base
		if idx >= start && idx < end {
			return idx, true
		}
	case 2:
		idx := row - 6
		if idx >= 0 && idx < len(AllThemeModes) {
			return idx, true
		}
	case 3:
		// TUI preference rows render as label, hint, blank triples.
		idx := (row - 6) / 3
		if row >= 6 && idx >= 0 && idx < tuiPrefsRowCount {
			return idx, true
		}
	case 4:
		idx := row - 4
		if idx >= 0 && idx < len(availableLanguageOptions()) {
			return idx, true
		}
	}
	return 0, false
}

func (a *App) handleMetricsMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	return a.closeOverlayOnOutside(rect, mouse, func() { a.metricsOpen = false })
}

func (a *App) handleDoctorMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	if !rect.contains(mouse.X, mouse.Y) {
		a.doctorOpen = false
		return nil, true
	}
	row := rect.contentRow(mouse.Y)
	col := rect.contentCol(mouse.X)
	if row == 2 && a.doctor != nil {
		if col < 24 {
			a.doctor.tab = 0
		} else {
			a.doctor.tab = 1
		}
	}
	return nil, true
}

func (a *App) handleLMConfigMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	return a.closeOverlayOnOutside(rect, mouse, func() {
		a.lmConfigOpen = false
		a.lmConfig = nil
	})
}

func (a *App) handleRenameMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	if !rect.contains(mouse.X, mouse.Y) {
		a.renameOpen = false
		a.renameDraft = ""
		a.renameCursor = 0
	}
	return nil, true
}

func (a *App) handleContextAddMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	if !rect.contains(mouse.X, mouse.Y) {
		a.contextAddOpen = false
		a.contextAddDraft = ""
		a.contextAddCursor = 0
	}
	return nil, true
}

func (a *App) handleComposeMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	if !rect.contains(mouse.X, mouse.Y) {
		a.composeOpen = false
		a.compose = nil
	}
	return nil, true
}
