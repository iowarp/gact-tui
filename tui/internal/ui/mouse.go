package ui

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

type mouseRect struct {
	x int
	y int
	w int
	h int
}

func (a *App) inputCommandChipPlain() string {
	chip := lipgloss.NewStyle().
		Foreground(a.Theme.Bg).
		Background(a.Theme.Primary).
		Bold(true).
		Padding(0, 1).
		Render("/")
	return ansi.Strip(chip) + " "
}

func (a *App) inputCommandChipWidth() int {
	return lipgloss.Width(a.inputCommandChipPlain())
}

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

func (a *App) registerInputCommandHit(conversationHeight int, hintHeight int) {
	if !a.MouseEnabled || a.hits == nil {
		return
	}
	plain := a.inputCommandChipPlain()
	a.registerScreenHit("input:command", mouseRect{
		x: a.bodyPaneOffsetX() + 2,
		y: 1 + conversationHeight + hintHeight + 1,
		w: lipgloss.Width(plain),
		h: 1,
	}, func(app *App) tea.Cmd {
		app.focus = FocusInput
		app.openCommandPalette()
		return nil
	})
}

func (a *App) registerInputFocusSurface(conversationHeight int, hintHeight int, inputHeight int, bodyWidth int) {
	if !a.MouseEnabled || a.hits == nil || inputHeight <= 0 || bodyWidth <= 0 {
		return
	}
	a.registerFocusSurfaceHit("input:focus", a.inputFocusSurfaceRect(conversationHeight, hintHeight, inputHeight, bodyWidth), FocusInput, func(app *App) {
		app.input.Focus()
	})
}

func (a *App) inputFocusSurfaceRect(conversationHeight int, hintHeight int, inputHeight int, bodyWidth int) mouseRect {
	return mouseRect{
		x: a.bodyPaneOffsetX(),
		y: 1 + conversationHeight,
		w: renderedPaneOuterWidth(bodyWidth),
		h: hintHeight + inputHeight,
	}
}

func (a *App) registerInputTextareaCursorHits(conversationHeight int, hintHeight int) {
	if !a.MouseEnabled || a.hits == nil {
		return
	}
	startX := a.bodyPaneOffsetX() + 2 + a.inputCommandChipWidth() + 2
	startY := 1 + conversationHeight + hintHeight + 1
	a.registerScreenTextareaRegion("input", startX, startY, a.input.Value(), func(app *App, lineIdx int, col int) {
		app.focus = FocusInput
		app.input.Focus()
		setTextareaCursor(&app.input, lineIdx, col)
	})
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
			a.registerScreenTextSpanHit("input:paste:"+itoa2(pasteIdx), startX, startY+lineIdx, line, hitCol, placeholder, func(app *App) tea.Cmd {
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
}

func (a *App) mouseOverlays() []mouseOverlay {
	// Reverse of viewMain's rendering order: the visually topmost modal
	// receives mouse input first.
	return []mouseOverlay{
		{open: a.quitConfirmOpen, view: a.viewQuitConfirm, closeOutside: func(app *App) { app.quitConfirmOpen = false }},
		{open: a.mcpRemoveOpen, view: a.viewMcpRemove, closeOutside: func(app *App) { app.closeMcpRemoveModal() }},
		{open: a.mcpInstallOpen, view: a.viewMcpInstall, closeOutside: func(app *App) { app.closeMcpInstallModal() }},
		{open: a.agentEditOpen, view: a.viewAgentEdit, closeOutside: func(app *App) { app.closeAgentEdit() }},
		{open: a.expertPackInstallOpen, view: a.viewExpertPackInstall, closeOutside: func(app *App) { app.closeExpertPackInstall() }},
		{open: a.agentBlueprintManageOpen, view: a.viewAgentBlueprintManage, closeOutside: func(app *App) { app.closeAgentBlueprintManage() }},
		{
			open:         a.filePickerOpen,
			view:         a.viewFilePicker,
			valid:        func(app *App) bool { return app.filePicker != nil },
			closeOutside: func(app *App) { app.closeFilePicker() },
		},
		{
			open:         a.composeOpen,
			view:         a.viewCompose,
			closeOutside: func(app *App) { app.cancelCompose() },
		},
		{open: a.detailViewOpen, view: a.viewDetailView, closeOutside: func(app *App) { app.closeDetailView() }},
		{open: a.sessionSetupOpen, view: a.viewSessionSetup, closeOutside: func(app *App) { app.closeSessionSetup() }},
		{
			open:         a.catalogBrowserOpen,
			view:         a.viewCatalogBrowser,
			valid:        func(app *App) bool { return app.catalogBrowser != nil },
			closeOutside: func(app *App) { app.closeCatalogBrowser() },
		},
		{open: a.contextAddOpen, view: a.viewContextAdd, closeOutside: func(app *App) { app.closeContextAddModal() }},
		{open: a.conversationActionsOpen, view: a.viewConversationActions, closeOutside: func(app *App) { app.closeConversationActions() }},
		{open: a.askUserOpen, view: a.viewAskUser, closeOutside: func(app *App) { app.closeAskUserModal() }},
		{open: a.retryNotesOpen, view: a.viewRetryNotes, closeOutside: func(app *App) { app.closeRetryNotesModal() }},
		{open: a.retryModelOpen, view: a.viewRetryModel, closeOutside: func(app *App) { app.closeRetryModelModal() }},
		{open: a.contextActionsOpen, view: a.viewContextActions, closeOutside: func(app *App) { app.closeContextActions() }},
		{open: a.sessionActionsOpen, view: a.viewSessionActions, closeOutside: func(app *App) { app.closeSessionActions() }},
		{open: a.renameOpen, view: a.viewRename, closeOutside: func(app *App) { app.closeRenameModal() }},
		{open: a.workspaceSwitchOpen, view: a.viewWorkspaceSwitch, closeOutside: func(app *App) { app.closeWorkspaceSwitchModal() }},
		{open: a.lmConfigOpen, view: a.viewLMConfig, closeOutside: func(app *App) { app.closeLMConfigModal() }},
		{open: a.doctorOpen, view: a.viewDoctor, closeOutside: func(app *App) { app.doctorOpen = false }},
		{open: a.metricsOpen, view: a.viewMetrics, closeOutside: func(app *App) { app.metricsOpen = false }},
		{open: a.sidebarLayoutOpen, view: a.viewSidebarLayoutEditor, closeOutside: func(app *App) { app.closeSidebarLayoutEditor() }},
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

func (a *App) mouseOverlayOpen() bool {
	for _, ov := range a.mouseOverlays() {
		if ov.open {
			return true
		}
	}
	return false
}

func (a *App) mouseClickInsideTopOverlay(mouse tea.Mouse) bool {
	for _, ov := range a.mouseOverlays() {
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

func (a *App) handleOverlayMouseWheel(m tea.MouseWheelMsg) (tea.Cmd, bool) {
	for _, ov := range a.mouseOverlays() {
		if !ov.open {
			continue
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
