package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestCtrlIPaneCycleMatchesTab(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.stage = StageReady
	a.focus = FocusInput
	a.sidebar.SetLayout([]string{"sessions"}, []string{"files"})

	model, _ := a.Update(tea.KeyPressMsg{Code: 'i', Mod: tea.ModCtrl})
	a = model.(*App)
	if a.focus != FocusSidebar {
		t.Fatalf("focus after ctrl+i = %v, want sidebar", a.focus)
	}

	model, _ = a.Update(tea.KeyPressMsg{Code: 'i', Mod: tea.ModCtrl})
	a = model.(*App)
	if a.focus != FocusBody {
		t.Fatalf("focus after second ctrl+i = %v, want body", a.focus)
	}

	model, _ = a.Update(tea.KeyPressMsg{Code: 'i', Mod: tea.ModCtrl})
	a = model.(*App)
	if a.focus != FocusRightSidebar {
		t.Fatalf("focus after third ctrl+i = %v, want right sidebar", a.focus)
	}
}
