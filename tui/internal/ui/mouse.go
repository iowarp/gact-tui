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

func (a *App) registerInputCommandHit(conversationHeight int, hintHeight int) {
	if !a.MouseEnabled || a.hits == nil {
		return
	}
	sidebarW, _, _ := a.mainPaneGeometry()
	a.registerScreenHit("input:command", mouseRect{
		x: sidebarW + 1,
		y: 1 + conversationHeight + hintHeight + 1,
		w: mouseCommandButtonWidth,
		h: 1,
	}, func(app *App) tea.Cmd {
		app.focus = FocusInput
		app.openCommandPalette()
		return nil
	})
}

func (a *App) registerInputTextareaCursorHits(conversationHeight int, hintHeight int) {
	if !a.MouseEnabled || a.hits == nil {
		return
	}
	sidebarW, _, _ := a.mainPaneGeometry()
	startX := sidebarW + 1 + mouseCommandButtonWidth + 2
	startY := 1 + conversationHeight + hintHeight + 1
	for lineIdx, line := range splitTextareaValue(a.input.Value()) {
		runes := []rune(line)
		for col := 0; col <= len(runes); col++ {
			lineIdx := lineIdx
			col := col
			x := startX + lipgloss.Width(string(runes[:col]))
			a.registerScreenHit("input:cursor:"+itoa2(lineIdx)+":"+itoa2(col), mouseRect{
				x: x,
				y: startY + lineIdx,
				w: 1,
				h: 1,
			}, func(app *App) tea.Cmd {
				app.focus = FocusInput
				app.input.Focus()
				setTextareaCursor(&app.input, lineIdx, col)
				return nil
			})
		}
	}
	a.registerInputPastePlaceholderHits(startX, startY)
}

func (a *App) registerInputPastePlaceholderHits(startX int, startY int) {
	if len(a.pastes) == 0 {
		return
	}
	lines := splitTextareaValue(a.input.Value())
	for pasteIdx, paste := range a.pastes {
		placeholder := strings.TrimSpace(paste.placeholder)
		if placeholder == "" {
			continue
		}
		for lineIdx, line := range lines {
			col := strings.Index(line, placeholder)
			if col < 0 {
				continue
			}
			pasteIdx := pasteIdx
			lineIdx := lineIdx
			hitCol := col
			a.registerScreenHit("input:paste:"+itoa2(pasteIdx), mouseRect{
				x: startX + lipgloss.Width(line[:hitCol]),
				y: startY + lineIdx,
				w: lipgloss.Width(placeholder),
				h: 1,
			}, func(app *App) tea.Cmd {
				app.focus = FocusInput
				app.input.Focus()
				setTextareaCursor(&app.input, lineIdx, hitCol)
				app.expandPasteSegment(pasteIdx)
				return nil
			})
			break
		}
	}
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
	open         bool
	view         func() string
	prepare      func(*App)
	valid        func(*App) bool
	closeOutside func(*App)
	click        func(mouseRect, tea.Mouse) (tea.Cmd, bool)
	wheel        func(tea.MouseWheelMsg) (tea.Cmd, bool)
}

func (a *App) mouseOverlays() []mouseOverlay {
	// Reverse of viewMain's rendering order: the visually topmost modal
	// receives mouse input first.
	return []mouseOverlay{
		{open: a.quitConfirmOpen, view: a.viewQuitConfirm, click: a.handleQuitConfirmMouseClick},
		{open: a.mcpRemoveOpen, view: a.viewMcpRemove, closeOutside: func(app *App) { app.closeMcpRemoveModal() }},
		{open: a.mcpInstallOpen, view: a.viewMcpInstall, closeOutside: func(app *App) { app.closeMcpInstallModal() }},
		{
			open:         a.filePickerOpen,
			view:         a.viewFilePicker,
			valid:        func(app *App) bool { return app.filePicker != nil },
			closeOutside: func(app *App) { app.closeFilePicker() },
		},
		{open: a.composeOpen, view: a.viewCompose, closeOutside: func(app *App) { app.cancelCompose() }},
		{open: a.detailViewOpen, view: a.viewDetailView, closeOutside: func(app *App) { app.closeDetailView() }},
		{
			open:         a.catalogBrowserOpen,
			view:         a.viewCatalogBrowser,
			valid:        func(app *App) bool { return app.catalogBrowser != nil },
			closeOutside: func(app *App) { app.closeCatalogBrowser() },
		},
		{open: a.contextAddOpen, view: a.viewContextAdd, closeOutside: func(app *App) { app.closeContextAddModal() }},
		{open: a.conversationActionsOpen, view: a.viewConversationActions, closeOutside: func(app *App) { app.closeConversationActions() }},
		{open: a.contextActionsOpen, view: a.viewContextActions, closeOutside: func(app *App) { app.closeContextActions() }},
		{open: a.sessionActionsOpen, view: a.viewSessionActions, closeOutside: func(app *App) { app.closeSessionActions() }},
		{open: a.renameOpen, view: a.viewRename, closeOutside: func(app *App) { app.closeRenameModal() }},
		{open: a.workspaceSwitchOpen, view: a.viewWorkspaceSwitch, closeOutside: func(app *App) { app.closeWorkspaceSwitchModal() }},
		{open: a.lmConfigOpen, view: a.viewLMConfig, closeOutside: func(app *App) { app.closeLMConfigModal() }},
		{open: a.doctorOpen, view: a.viewDoctor, closeOutside: func(app *App) { app.doctorOpen = false }},
		{open: a.metricsOpen, view: a.viewMetrics, closeOutside: func(app *App) { app.metricsOpen = false }},
		{
			open: a.settingsOpen,
			view: a.viewSettings,
			prepare: func(app *App) {
				if app.settings == nil {
					app.settings = &settingsState{}
				}
			},
			closeOutside: func(app *App) { app.closeSettingsModal() },
		},
		{
			open: a.helpOpen,
			view: a.viewHelp,
			closeOutside: func(app *App) {
				app.helpOpen = false
				app.helpScroll = 0
			},
		},
		{open: a.paletteOpen, view: a.viewPalette, closeOutside: func(app *App) { app.closePalette() }},
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
		if ov.click != nil {
			return ov.click(rect, mouse)
		}
		if !rect.contains(mouse.X, mouse.Y) && ov.closeOutside != nil {
			ov.closeOutside(a)
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

func (a *App) handleQuitConfirmMouseClick(rect mouseRect, mouse tea.Mouse) (tea.Cmd, bool) {
	if !rect.contains(mouse.X, mouse.Y) {
		a.quitConfirmSelected = 1
		_, cmd := a.applyQuitConfirmSelection()
		return cmd, true
	}
	return nil, true
}
