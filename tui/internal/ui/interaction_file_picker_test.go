package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestFilePickerRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.filePicker.open = true
	a.filePicker.filePickerState = filePickerState{
		loaded: true,
		entries: []gact.FileEntry{
			{Path: "alpha.csv"},
			{Path: "beta.parquet"},
		},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "file-picker:item:1")
	if !ok {
		t.Fatal("missing semantic file picker row target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.filePicker.open {
		t.Fatal("file picker should close after clicked insert")
	}
	if got := a.inputComposer.input.Value(); !strings.Contains(got, "@beta.parquet ") {
		t.Fatalf("input = %q, want clicked beta path inserted", got)
	}
}

func TestFilePickerTargetsAlignWithSharedFrameBody(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.filePicker.open = true
	a.filePicker.filePickerState = filePickerState{
		loaded: true,
		entries: []gact.FileEntry{
			{Path: "alpha.csv"},
			{Path: "beta.parquet"},
		},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "file-picker:item:0")
	if !ok {
		t.Fatal("missing semantic first file picker row target")
	}
	rect := overlayMouseRect(a.filePicker.view(), a.width, a.height)
	if wantY := rect.y + 2 + 4; target.rect.y != wantY {
		t.Fatalf("first file picker row y = %d, want shared frame body/list row %d", target.rect.y, wantY)
	}
}

func TestFilePickerUsesSharedScrollAffordanceForLongLists(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.filePicker.open = true
	a.filePicker.filePickerState = filePickerState{
		loaded: true,
		sel:    12,
	}
	for i := 0; i < 18; i++ {
		n := itoa2(i)
		if i < 10 {
			n = "0" + n
		}
		a.filePicker.entries = append(a.filePicker.entries, gact.FileEntry{
			Path: "file_" + n + ".txt",
		})
	}

	out := stripANSI(a.filePicker.view())
	if !strings.Contains(out, "file_12.txt") {
		t.Fatalf("selected file should remain visible in bounded picker:\n%s", out)
	}
	if strings.Contains(out, "file_0.txt") {
		t.Fatalf("bounded file picker should not render every file:\n%s", out)
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("bounded file picker should show shared side scroll rail:\n%s", out)
	}

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "file-picker:item:12"); !ok {
		t.Fatal("missing semantic target for selected file inside scrolled picker")
	}
	if _, ok := findHitTargetForTest(a, "file-picker:item:0"); ok {
		t.Fatal("offscreen file picker row should not register a stale hit target")
	}
}

func TestFilePickerCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.filePicker.open = true
	a.filePicker.filePickerState = filePickerState{
		loaded: true,
		filter: "beta",
		entries: []gact.FileEntry{
			{Path: "alpha.csv"},
			{Path: "beta.parquet"},
		},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:file-picker:close")
	if !ok {
		t.Fatal("missing semantic file picker close target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("file picker close should not dispatch a command")
	}
	if a.filePicker.open {
		t.Fatalf("file picker close should clear picker state, open=%v picker=%v", a.filePicker.open, a.filePicker)
	}
	if got := a.inputComposer.input.Value(); strings.Contains(got, "@") {
		t.Fatalf("close should not insert a file, input=%q", got)
	}
}

func TestFilePickerNonRowClickDoesNotChooseByCoordinates(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.filePicker.open = true
	a.filePicker.filePickerState = filePickerState{
		loaded: true,
		entries: []gact.FileEntry{
			{Path: "alpha.csv"},
			{Path: "beta.parquet"},
		},
	}

	_ = a.View()
	rect := overlayMouseRect(a.filePicker.view(), a.width, a.height)
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + rect.w - 2,
		Y:      rect.y + 2 + 3,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("non-row click inside file picker should not dispatch")
	}
	if !a.filePicker.open {
		t.Fatal("non-row click inside file picker should keep picker open")
	}
	if got := a.inputComposer.input.Value(); strings.Contains(got, "@") {
		t.Fatalf("non-row click should not insert a file, input=%q", got)
	}
}

func TestFilePickerMouseWheelMovesSelectionOnlyOverList(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.filePicker.open = true
	a.filePicker.filePickerState = filePickerState{
		loaded: true,
		entries: []gact.FileEntry{
			{Path: "alpha.csv"},
			{Path: "beta.parquet"},
			{Path: "gamma.txt"},
		},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "file-picker:list:wheel")
	if !ok {
		t.Fatal("missing semantic file picker list wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.filePicker.sel != 1 {
		t.Fatalf("wheel over list should move file picker selection, got %d", a.filePicker.sel)
	}

	_ = a.View()
	rect := overlayMouseRect(a.filePicker.view(), a.width, a.height)
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      rect.x + rect.w - 2,
		Y:      rect.y + 2,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.filePicker.sel != 1 {
		t.Fatalf("wheel outside list should not move file picker selection, got %d", a.filePicker.sel)
	}
}
