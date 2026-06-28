package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestContextAddModeChipsUseSemanticHitTargets(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	a.contextAdd.open = true
	a.contextAdd.input.SetValue("docs/readme.md")
	a.contextAdd.input.SetCursor(len(a.contextAdd.input.Value()))

	_ = a.View()
	target, ok := findHitTargetForTest(a, "context-add:mode:edit")
	if !ok {
		t.Fatal("missing context-add edit mode hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("mode chip click should not dispatch a command")
	}
	if got := a.contextAdd.modeValue(); got != "edit" {
		t.Fatalf("context-add mode = %q, want edit", got)
	}
	if !a.contextAdd.open {
		t.Fatal("mode chip should keep context-add open")
	}
}

func TestContextAddButtonsUseSemanticHitTargets(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	a.contextAdd.open = true
	a.contextAdd.input.SetValue("docs/readme.md")
	a.contextAdd.input.SetCursor(len(a.contextAdd.input.Value()))

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:context-add:save")
	if !ok {
		t.Fatal("missing context-add save button hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.contextAdd.open {
		t.Fatal("save button should close context-add modal")
	}
	if cmd == nil {
		t.Fatal("save button should dispatch addContextFileCmd")
	}
}

func TestContextAddButtonsAlignWithSharedHeader(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	a.contextAdd.open = true
	a.contextAdd.input.SetValue("docs/readme.md")
	a.contextAdd.input.SetCursor(len(a.contextAdd.input.Value()))

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:context-add:save")
	if !ok {
		t.Fatal("missing context-add save button hit target")
	}
	rect := overlayMouseRect(a.contextAdd.view(), a.width, a.height)
	if wantY := rect.y + 2; target.rect.y != wantY {
		t.Fatalf("context-add save button y = %d, want shared frame header row %d", target.rect.y, wantY)
	}
}

func TestContextAddCancelButtonUsesSharedCloseState(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	a.contextAdd.open = true
	a.contextAdd.input.SetValue("discard/me.md")
	a.contextAdd.input.SetCursor(len(a.contextAdd.input.Value()))

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:context-add:cancel")
	if !ok {
		t.Fatal("missing context-add cancel button hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("cancel button should not dispatch a command")
	}
	if a.contextAdd.open || a.contextAdd.input.Value() != "" || a.contextAdd.input.Cursor() != 0 {
		t.Fatalf("cancel should clear context-add state, open=%v draft=%q cursor=%d", a.contextAdd.open, a.contextAdd.input.Value(), a.contextAdd.input.Cursor())
	}
}

func TestContextAddEditorClickPlacesCursor(t *testing.T) {
	a, _, _ := makeContextAddApp(t)
	a.contextAdd.open = true
	a.contextAdd.input.SetValue("docs/readme.md")
	a.contextAdd.input.SetCursor(len(a.contextAdd.input.Value()))

	_ = a.View()
	target, ok := findHitTargetForTest(a, "text-entry:context-add:cursor:4")
	if !ok {
		t.Fatal("missing context-add editor cursor target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("cursor click should not dispatch a command")
	}
	if a.contextAdd.input.Cursor() != 4 {
		t.Fatalf("context-add cursor = %d, want 4", a.contextAdd.input.Cursor())
	}
	if !a.contextAdd.open {
		t.Fatal("cursor click should keep context-add open")
	}
}
