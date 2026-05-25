package ui

import (
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// ZZZZZZZZZ1: quit-confirm modal. User feedback: "ctrl+c should have
// a confirmation window, close? yes no detach".
//
// Three options (left→right):
//
//	close   — original Ctrl+C behaviour: cancel in-flight turn + quit
//	no      — dismiss the modal, keep running
//	detach  — mirror Ctrl+Z: record DetachedSessionID + quit cleanly
//	          (session stays alive server-side, gact attach resumes)
//
// Keybindings:
//
//	← / →   — move the highlight
//	y       — select "close" (yes quit)
//	n       — select "no"    (dismiss)
//	d       — select "detach"
//	Enter   — fire the current selection
//	Esc     — alias for "no" (dismiss)
//	Ctrl+C  — accept current selection (preserves double-Ctrl+C quit
//	          muscle memory from before the confirm was added)

// quitConfirmOptions is the canonical option order + labels.
var quitConfirmOptions = []string{"close", "no", "detach"}

func (a *App) quitConfirmButtons() []menuButton {
	labels := []string{
		a.localizer.t(msgQuitClose, nil),  // 0 - yes, quit
		a.localizer.t(msgQuitNo, nil),     // 1 - keep running
		a.localizer.t(msgQuitDetach, nil), // 2 - Ctrl+Z style
	}
	keyHints := []string{"y", "n", "d"}
	buttons := make([]menuButton, 0, len(labels))
	for i, label := range labels {
		idx := i
		buttons = append(buttons, menuButton{
			id:    "quit:" + quitConfirmOptions[i],
			label: label + "  (" + keyHints[i] + ")",
			action: func(app *App) tea.Cmd {
				app.quitConfirmSelected = idx
				_, cmd := app.applyQuitConfirmSelection()
				return cmd
			},
		})
	}
	return buttons
}

// handleQuitConfirmKey drives the modal while it's open.
func (a *App) handleQuitConfirmKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc":
		// Esc is "no" — dismiss without doing anything.
		a.quitConfirmOpen = false
		return a, nil
	case "left", "h":
		if a.quitConfirmSelected > 0 {
			a.quitConfirmSelected--
		}
		return a, nil
	case "right", "l":
		if a.quitConfirmSelected < len(quitConfirmOptions)-1 {
			a.quitConfirmSelected++
		}
		return a, nil
	case "y", "Y":
		a.quitConfirmSelected = 0
		return a.applyQuitConfirmSelection()
	case "n", "N":
		a.quitConfirmSelected = 1
		return a.applyQuitConfirmSelection()
	case "d", "D":
		a.quitConfirmSelected = 2
		return a.applyQuitConfirmSelection()
	case "enter":
		return a.applyQuitConfirmSelection()
	case "ctrl+c":
		// Double Ctrl+C: accept current selection — keeps the old
		// spam-ctrl+c muscle memory working.
		return a.applyQuitConfirmSelection()
	}
	return a, nil
}

// applyQuitConfirmSelection fires the action for the currently
// highlighted option and closes the modal.
func (a *App) applyQuitConfirmSelection() (tea.Model, tea.Cmd) {
	defer func() { a.quitConfirmOpen = false }()
	switch a.quitConfirmSelected {
	case 0: // close — original Ctrl+C behaviour
		if a.sseCancel != nil {
			a.sseCancel()
		}
		var cmds []tea.Cmd
		if sid := a.currentSessionID(); sid != "" && a.c != nil {
			switch a.currentStatus {
			case gact.StatusRunning, gact.StatusWaitingPermission:
				cmds = append(cmds, cancelCmd(a.c, sid))
			}
		}
		cmds = append(cmds, tea.Quit)
		return a, tea.Batch(cmds...)
	case 1: // no — dismiss
		return a, nil
	case 2: // detach — mirror Ctrl+Z flow
		a.DetachedSessionID = a.currentSessionID()
		if a.selected >= 0 && a.selected < len(a.sessions) {
			s := a.sessions[a.selected]
			a.DetachedTitle = s.Title
			a.DetachedWorkspace = s.WorkspaceID
		}
		return a, tea.Quit
	}
	return a, nil
}

// viewQuitConfirm renders the modal. Kept narrow — this is a 3-option
// prompt, not a content surface.
func (a *App) viewQuitConfirm() string {
	if !a.quitConfirmOpen {
		return ""
	}
	t := a.Theme
	w := 54
	if w > a.width-8 {
		w = a.width - 8
	}
	if w < 30 {
		w = 30
	}

	title := lipgloss.NewStyle().Bold(true).Foreground(t.Warning).
		Render(a.localizer.t(msgQuitTitle, nil))
	hint := lipgloss.NewStyle().Foreground(t.FgMuted).
		Render(a.localizer.t(msgQuitHint, nil))

	buttons := a.quitConfirmButtons()
	row := a.renderModalButtons(buttons, a.quitConfirmSelected)
	keyLine := lipgloss.NewStyle().Foreground(t.FgFaint).Render(
		a.localizer.t(msgQuitKeyHint, nil))

	box := lipgloss.JoinVertical(lipgloss.Left,
		title, "", hint, "", row, "", keyLine)
	modal := a.renderModalSurface(w, t.Warning, t.BgSubtle, box)
	a.registerModalButtons(modal, 4, 0, buttons)
	return modal
}
