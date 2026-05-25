package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestHitRegistryReturnsTopmostTarget(t *testing.T) {
	var hits uiHitRegistry
	hits.add(uiHitTarget{id: "base", rect: mouseRect{x: 0, y: 0, w: 10, h: 10}, action: func(*App) tea.Cmd { return nil }})
	hits.add(uiHitTarget{id: "modal", rect: mouseRect{x: 2, y: 2, w: 4, h: 4}, action: func(*App) tea.Cmd { return nil }})

	got, ok := hits.at(3, 3)
	if !ok {
		t.Fatal("expected hit")
	}
	if got.id != "modal" {
		t.Fatalf("hit id = %q, want topmost modal", got.id)
	}
}

func TestDoctorTabsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.doctorOpen = true
	a.doctor = &doctorState{tab: doctorTabHealth}

	_ = a.View()
	rect := overlayMouseRect(a.viewDoctor(), a.width, a.height)
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 3 + 15,
		Y:      rect.y + 2 + 2,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.doctor == nil || a.doctor.tab != doctorTabCapabilities {
		t.Fatalf("doctor tab = %v, want capabilities", a.doctor)
	}
}

func TestSettingsTabsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 0}

	_ = a.View()
	rect := overlayMouseRect(a.viewSettings(), a.width, a.height)
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 3 + 31,
		Y:      rect.y + 2 + 2,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.settings == nil || a.settings.tab != 3 {
		t.Fatalf("settings tab = %v, want TUI tab", a.settings)
	}
	if !a.settingsOpen {
		t.Fatal("clicking a settings tab should not close settings")
	}
}

func TestSettingsTUIRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3, tuiRow: 0}

	_ = a.View()
	rect := overlayMouseRect(a.viewSettings(), a.width, a.height)
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 3 + 4,
		Y:      rect.y + 2 + 12,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.settings == nil || a.settings.tuiRow != 2 {
		t.Fatalf("settings TUI row = %v, want row 2", a.settings)
	}
	if !a.settingsOpen {
		t.Fatal("clicking a TUI option should not close settings")
	}
}

func TestSettingsLanguageRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 4, languageSel: 0}

	_ = a.View()
	rect := overlayMouseRect(a.viewSettings(), a.width, a.height)
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 3 + 4,
		Y:      rect.y + 2 + 8,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.settings == nil || a.settings.languageSel != 2 {
		t.Fatalf("settings language row = %v, want row 2", a.settings)
	}
	if !a.settingsOpen {
		t.Fatal("clicking a language row should select without closing settings")
	}
}

func TestQuitConfirmButtonsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.quitConfirmOpen = true
	a.quitConfirmSelected = 0

	_ = a.View()
	rect := overlayMouseRect(a.viewQuitConfirm(), a.width, a.height)
	closeW := len([]rune(a.localizer.t(msgQuitClose, nil)+"  (y)")) + 4
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 3 + closeW + 2,
		Y:      rect.y + 2 + 4,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("clicking no should not quit")
	}
	if a.quitConfirmOpen {
		t.Fatal("clicking no should close quit confirmation")
	}
}
