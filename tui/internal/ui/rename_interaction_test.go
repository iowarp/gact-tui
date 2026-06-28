package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestRenameButtonsUseSemanticHitTargets(t *testing.T) {
	a, _, _ := makeRenameApp(t)
	a.rename.open = true
	a.rename.input.SetValue("clicked title")
	a.rename.input.SetCursor(len(a.rename.input.Value()))

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:rename:save")
	if !ok {
		t.Fatal("missing rename save button hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.rename.open {
		t.Fatal("save button should close rename modal")
	}
	if a.session.sessions[0].Title != "clicked title" {
		t.Fatalf("save button did not commit title: %q", a.session.sessions[0].Title)
	}
	if cmd == nil {
		t.Fatal("save button should dispatch patch command")
	}
}

func TestRenameButtonsAlignWithSharedHeader(t *testing.T) {
	a, _, _ := makeRenameApp(t)
	a.rename.open = true
	a.rename.input.SetValue("clicked title")
	a.rename.input.SetCursor(len(a.rename.input.Value()))

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:rename:save")
	if !ok {
		t.Fatal("missing rename save button hit target")
	}
	rect := overlayMouseRect(a.rename.view(), a.width, a.height)
	if wantY := rect.y + 2; target.rect.y != wantY {
		t.Fatalf("rename save button y = %d, want shared frame header row %d", target.rect.y, wantY)
	}
}

func TestRenameCancelButtonUsesSharedCloseState(t *testing.T) {
	a, _, _ := makeRenameApp(t)
	a.rename.open = true
	a.rename.input.SetValue("discard me")
	a.rename.input.SetCursor(len(a.rename.input.Value()))

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:rename:cancel")
	if !ok {
		t.Fatal("missing rename cancel button hit target")
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
	if a.rename.open || a.rename.input.Value() != "" || a.rename.input.Cursor() != 0 {
		t.Fatalf("cancel should clear rename state, open=%v draft=%q cursor=%d", a.rename.open, a.rename.input.Value(), a.rename.input.Cursor())
	}
}

func TestRenameEditorClickPlacesCursor(t *testing.T) {
	a, _, _ := makeRenameApp(t)
	a.rename.open = true
	a.rename.input.SetValue("abcdef")
	a.rename.input.SetCursor(len(a.rename.input.Value()))

	_ = a.View()
	target, ok := findHitTargetForTest(a, "text-entry:rename:cursor:2")
	if !ok {
		t.Fatal("missing rename editor cursor target")
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
	if a.rename.input.Cursor() != 2 {
		t.Fatalf("rename cursor = %d, want 2", a.rename.input.Cursor())
	}
	if !a.rename.open {
		t.Fatal("cursor click should keep rename open")
	}
}

func TestRenameSurfaceWheelUsesSharedTextEntryBlocker(t *testing.T) {
	a, _, _ := makeRenameApp(t)
	a.width, a.height = 120, 36
	a.rename.open = true
	a.rename.input.SetValue("abcdef")
	a.rename.input.SetCursor(len(a.rename.input.Value()))

	_ = a.View()
	target, ok := findHitTargetForTest(a, "rename:surface:wheel")
	if !ok {
		t.Fatal("missing rename surface wheel target")
	}
	model, cmd := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("rename surface wheel should not dispatch a command")
	}
	if !a.rename.open || a.rename.input.Cursor() != len(a.rename.input.Value()) {
		t.Fatalf("rename surface wheel should keep modal and cursor stable, open=%v cursor=%d", a.rename.open, a.rename.input.Cursor())
	}
}
