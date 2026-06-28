package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// ZZZZZZZZZ1: Ctrl+C opens the confirm modal instead of quitting
// immediately. User feedback: "ctrl+c should have a confirmation
// window, close? yes no detach".
func TestQuitConfirm_CtrlCOpensModal(t *testing.T) {
	a := newReadyApp(
		[]gact.Session{{ID: "s1", Status: gact.StatusIdle}},
		nil,
	)
	a.width, a.height = 120, 30
	a.focus = FocusInput

	if a.quitConfirm.open {
		t.Fatalf("confirm modal should start closed")
	}
	out, cmd := a.Update(tea.KeyPressMsg{Code: 'c', Mod: tea.ModCtrl, Text: ""})
	a = out.(*App)
	if !a.quitConfirm.open {
		t.Errorf("Ctrl+C should open the confirm modal")
	}
	if cmd != nil {
		t.Errorf("opening the modal should NOT fire a command (cmd=%v)", cmd)
	}
	if a.quitConfirm.selected != 0 {
		t.Errorf("default selection should be 0 (close); got %d", a.quitConfirm.selected)
	}
}

// ZZZZZZZZZ1: left/right move the highlight; n dismisses; enter fires
// the current selection.
func TestQuitConfirm_KeyboardNav(t *testing.T) {
	a := newReadyApp(
		[]gact.Session{{ID: "s1", Status: gact.StatusIdle}},
		nil,
	)
	a.width, a.height = 120, 30
	a.quitConfirm.open = true
	a.quitConfirm.selected = 0

	// → moves to 1 (no).
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
	a = out.(*App)
	if a.quitConfirm.selected != 1 {
		t.Errorf("after right, selected=%d, want 1", a.quitConfirm.selected)
	}
	// → moves to 2 (detach).
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
	a = out.(*App)
	if a.quitConfirm.selected != 2 {
		t.Errorf("after second right, selected=%d, want 2", a.quitConfirm.selected)
	}
	// Clamp at end.
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
	a = out.(*App)
	if a.quitConfirm.selected != 2 {
		t.Errorf("past end: selected=%d, want 2 (clamped)", a.quitConfirm.selected)
	}
	// ← back to 1.
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
	a = out.(*App)
	if a.quitConfirm.selected != 1 {
		t.Errorf("after left, selected=%d, want 1", a.quitConfirm.selected)
	}
	// `n` dismisses (selects 1 + applies → no-op quit, modal closes).
	out, _ = a.Update(tea.KeyPressMsg{Code: 'n', Text: "n"})
	a = out.(*App)
	if a.quitConfirm.open {
		t.Errorf("after 'n', modal should be closed")
	}
}

// ZZZZZZZZZ1: Esc dismisses without acting.
func TestQuitConfirm_EscDismisses(t *testing.T) {
	a := newReadyApp(
		[]gact.Session{{ID: "s1", Status: gact.StatusIdle}},
		nil,
	)
	a.width, a.height = 120, 30
	a.quitConfirm.open = true

	out, cmd := a.Update(tea.KeyPressMsg{Code: tea.KeyEscape})
	a = out.(*App)
	if a.quitConfirm.open {
		t.Errorf("Esc should close the modal")
	}
	if cmd != nil {
		t.Errorf("Esc should NOT fire any command")
	}
}

// ZZZZZZZZZ1: `d` picks detach — the cleanup path that records
// DetachedSessionID + quits (mirrors Ctrl+Z). No backend cancel.
func TestQuitConfirm_DetachPath(t *testing.T) {
	a := newReadyApp(
		[]gact.Session{{ID: "s1", Title: "t", Status: gact.StatusIdle, WorkspaceID: "ws"}},
		nil,
	)
	a.width, a.height = 120, 30
	a.quitConfirm.open = true

	out, cmd := a.Update(tea.KeyPressMsg{Code: 'd', Text: "d"})
	a = out.(*App)
	if a.quitConfirm.open {
		t.Errorf("after 'd', modal should close")
	}
	if a.DetachedSessionID != "s1" {
		t.Errorf("detach should capture session id; got %q", a.DetachedSessionID)
	}
	if a.DetachedTitle != "t" {
		t.Errorf("detach should capture title; got %q", a.DetachedTitle)
	}
	if cmd == nil {
		t.Errorf("detach should fire tea.Quit command")
	}
}

// ZZZZZZZZZ1: double Ctrl+C accepts the current highlighted option —
// keeps the old "spam ctrl+c to quit" muscle memory working.
func TestQuitConfirm_DoubleCtrlCAccepts(t *testing.T) {
	a := newReadyApp(
		[]gact.Session{{ID: "s1", Status: gact.StatusIdle}},
		nil,
	)
	a.width, a.height = 120, 30
	a.focus = FocusInput

	// First Ctrl+C: opens modal with selected=0 (close).
	out, _ := a.Update(tea.KeyPressMsg{Code: 'c', Mod: tea.ModCtrl, Text: ""})
	a = out.(*App)
	if !a.quitConfirm.open {
		t.Fatal("first Ctrl+C should open the modal")
	}
	// Second Ctrl+C: accepts selected=0 (close) → quits + closes modal.
	out, cmd := a.Update(tea.KeyPressMsg{Code: 'c', Mod: tea.ModCtrl, Text: ""})
	a = out.(*App)
	if a.quitConfirm.open {
		t.Errorf("second Ctrl+C should close the modal")
	}
	if cmd == nil {
		t.Errorf("second Ctrl+C should fire a quit-family command")
	}
}
