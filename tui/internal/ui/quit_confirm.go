package ui

// quitConfirmModal: the Ctrl+C quit/detach confirmation overlay.

import (
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
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

// quitConfirmModal is the Ctrl+C confirmation overlay: open flag plus the
// highlighted option index (0=close, 1=no, 2=detach), the behaviour that drives
// it, and a back-reference to the root App for shared services.
type quitConfirmModal struct {
	app      *App
	open     bool
	selected int
}

// quitConfirmOptions is the canonical option order + labels.
var quitConfirmOptions = []string{"close", "no", "detach"}

func (m *quitConfirmModal) openModal() {
	m.open = true
	m.selected = 0 // default: close
}

func (m *quitConfirmModal) buttons() []menuButton {
	labels := []string{
		m.app.localizer.t(msgQuitClose, nil),  // 0 - yes, quit
		m.app.localizer.t(msgQuitNo, nil),     // 1 - keep running
		m.app.localizer.t(msgQuitDetach, nil), // 2 - Ctrl+Z style
	}
	keyHints := []string{"y", "n", "d"}
	buttons := make([]menuButton, 0, len(labels))
	for i, label := range labels {
		idx := i
		buttons = append(buttons, menuButton{
			id:    "quit:" + quitConfirmOptions[i],
			label: label + "  (" + keyHints[i] + ")",
			action: func(app *App) tea.Cmd {
				app.quitConfirm.selected = idx
				_, cmd := app.quitConfirm.applySelection()
				return cmd
			},
		})
	}
	return buttons
}

// handleKey drives the modal while it's open.
func (m *quitConfirmModal) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc":
		// Esc is "no" — dismiss without doing anything.
		m.open = false
		return m.app, nil
	case "left", "h":
		if m.selected > 0 {
			m.selected--
		}
		return m.app, nil
	case "right", "l":
		if m.selected < len(quitConfirmOptions)-1 {
			m.selected++
		}
		return m.app, nil
	case "y", "Y":
		m.selected = 0
		return m.applySelection()
	case "n", "N":
		m.selected = 1
		return m.applySelection()
	case "d", "D":
		m.selected = 2
		return m.applySelection()
	case "enter":
		return m.applySelection()
	case "ctrl+c":
		// Double Ctrl+C: accept current selection — keeps the old
		// spam-ctrl+c muscle memory working.
		return m.applySelection()
	}
	return m.app, nil
}

// applySelection fires the action for the currently highlighted option and
// closes the modal.
func (m *quitConfirmModal) applySelection() (tea.Model, tea.Cmd) {
	a := m.app
	defer func() { m.open = false }()
	switch m.selected {
	case 0: // close — original Ctrl+C behaviour
		if a.connection.sseCancel != nil {
			a.connection.sseCancel()
		}
		var cmds []tea.Cmd
		if sid := a.session.currentID(); sid != "" && a.c != nil {
			switch a.session.currentStatus {
			case gact.StatusRunning, gact.StatusWaitingPermission:
				cmds = append(cmds, cancelCmd(a.c, sid))
			}
		}
		cmds = append(cmds, tea.Quit)
		return a, tea.Batch(cmds...)
	case 1: // no — dismiss
		return a, nil
	case 2: // detach — mirror Ctrl+Z flow
		a.DetachedSessionID = a.session.currentID()
		if a.session.selected >= 0 && a.session.selected < len(a.session.sessions) {
			s := a.session.sessions[a.session.selected]
			a.DetachedTitle = s.Title
			a.DetachedWorkspace = s.WorkspaceID
		}
		return a, tea.Quit
	}
	return a, nil
}

// view renders the modal with the shared overlay width so the confirmation does
// not introduce a one-off modal shape.
func (m *quitConfirmModal) view() string {
	if !m.open {
		return ""
	}
	a := m.app
	t := a.Theme
	w := a.modals.modalWidth()

	contentW := modalInnerWidth(w)
	hintStyle := lipgloss.NewStyle().Foreground(t.FgMuted)
	hintLines := textutil.WrapPlainRows(a.localizer.t(msgQuitHint, nil), contentW, "")
	for i, line := range hintLines {
		hintLines[i] = hintStyle.Render(line)
	}
	hint := lipgloss.JoinVertical(lipgloss.Left, hintLines...)

	buttons := m.buttons()
	keyStyle := lipgloss.NewStyle().Foreground(t.FgFaint)
	keyLines := textutil.WrapPlainRows(a.localizer.t(msgQuitKeyHint, nil), contentW, "")
	for i, line := range keyLines {
		keyLines[i] = keyStyle.Render(line)
	}
	keyLine := lipgloss.JoinVertical(lipgloss.Left, keyLines...)

	rendered := a.modals.renderModalFrameWithLayout(modalFrameOptions{
		width:           w,
		title:           a.localizer.t(msgQuitTitle, nil),
		titleColor:      t.Warning,
		border:          t.Warning,
		background:      t.BgSubtle,
		buttons:         buttons,
		buttonSelected:  m.selected,
		buttonSelection: true,
		body:            hint,
		footer:          keyLine,
	})
	return rendered.modal
}
