package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
)

func TestQuitConfirmButtonsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.quitConfirm.open = true
	a.quitConfirm.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:quit:no")
	if !ok {
		t.Fatal("missing semantic no button hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("clicking no should not quit")
	}
	if a.quitConfirm.open {
		t.Fatal("clicking no should close quit confirmation")
	}
}

func TestQuitConfirmButtonsAlignWithSharedHeader(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.quitConfirm.open = true
	a.quitConfirm.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:quit:no")
	if !ok {
		t.Fatal("missing semantic no button hit target")
	}
	view := a.quitConfirm.view()
	rect := overlayMouseRect(view, a.width, a.height)
	if wantY := rect.y + 2; target.rect.y != wantY {
		t.Fatalf("quit no button y = %d, want shared frame header row %d", target.rect.y, wantY)
	}
}

func TestQuitConfirmButtonsUseSharedLabels(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	buttons := a.quitConfirm.buttons()
	if len(buttons) != len(quitConfirmOptions) {
		t.Fatalf("buttons = %d, want %d", len(buttons), len(quitConfirmOptions))
	}
	for i, button := range buttons {
		if button.id != "quit:"+quitConfirmOptions[i] {
			t.Fatalf("button %d id = %q", i, button.id)
		}
		if button.label == "" || button.action == nil {
			t.Fatalf("button %d should carry render label and action: %+v", i, button)
		}
	}
	row := ansi.Strip(a.modals.renderModalButtons(buttons, 1))
	for _, want := range []string{"close", "no", "detach"} {
		if !strings.Contains(row, want) {
			t.Fatalf("quit button row missing %q: %q", want, row)
		}
	}
}

func TestQuitConfirmNonButtonClickDoesNotChooseByCoordinates(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.quitConfirm.open = true
	a.quitConfirm.selected = 0

	_ = a.View()
	rect := overlayMouseRect(a.quitConfirm.view(), a.width, a.height)
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + rect.w - 2,
		Y:      rect.y + 2 + 4,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("non-button click inside quit modal should not fire a command")
	}
	if !a.quitConfirm.open {
		t.Fatal("non-button click inside quit modal should keep the modal open")
	}
	if a.quitConfirm.selected != 0 {
		t.Fatalf("non-button click should not change selection, got %d", a.quitConfirm.selected)
	}
}

func TestQuitConfirmOutsideClickUsesSharedClosePolicy(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.quitConfirm.open = true
	a.quitConfirm.selected = 0

	_ = a.View()
	rect := overlayMouseRect(a.quitConfirm.view(), a.width, a.height)
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + rect.w + 1,
		Y:      rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("outside quit-confirm click should dismiss without firing quit/detach")
	}
	if a.quitConfirm.open {
		t.Fatal("outside quit-confirm click should close the modal")
	}
	if a.quitConfirm.selected != 0 {
		t.Fatalf("outside click should not choose a different option, got %d", a.quitConfirm.selected)
	}
}
