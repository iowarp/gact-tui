package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func newFilePickerTreeTestApp() *App {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.filePickerOpen = true
	a.filePicker = &filePickerState{
		loaded:       true,
		treeMode:     true,
		treeExpanded: map[string]bool{},
		entries: []gact.FileEntry{
			{Path: "docs", Type: "dir"},
			{Path: "docs/guide.md", Type: "file", Size: 12},
			{Path: "docs/api/spec.yaml", Type: "file", Size: 20},
			{Path: "README.md", Type: "file", Size: 17},
		},
	}
	return a
}

func TestFilePickerTreeModeExpandsFoldersAndInsertsFiles(t *testing.T) {
	a := newFilePickerTreeTestApp()

	out := stripANSI(a.viewFilePicker())
	if !strings.Contains(out, "▸ docs") || !strings.Contains(out, "README.md") {
		t.Fatalf("tree picker did not render collapsed root rows:\n%s", out)
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "file-picker:item:0")
	if !ok {
		t.Fatal("missing semantic tree folder target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("expanding a folder should not dispatch a command")
	}
	if !a.filePicker.treeExpanded["docs"] || !a.filePickerOpen {
		t.Fatalf("folder click should expand and keep picker open, expanded=%v open=%v", a.filePicker.treeExpanded, a.filePickerOpen)
	}

	_ = a.View()
	target, ok = findHitTargetForTest(a, "file-picker:item:2")
	if !ok {
		t.Fatal("missing semantic tree file target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("inserting a file should not dispatch a command")
	}
	if a.filePickerOpen {
		t.Fatal("selecting a file should close the picker")
	}
	if got := a.input.Value(); !strings.Contains(got, "@docs/guide.md") {
		t.Fatalf("selected file was not inserted, input=%q", got)
	}
}

func TestFilePickerTypingUsesFuzzyFileResultsNotFolderRows(t *testing.T) {
	a := newFilePickerTreeTestApp()
	a.filePicker.filter = "spec"

	matches := a.filePickerMatches()
	if len(matches) != 1 || matches[0].Path != "docs/api/spec.yaml" {
		t.Fatalf("fuzzy matches = %#v, want only docs/api/spec.yaml", matches)
	}
	out := stripANSI(a.viewFilePicker())
	if strings.Contains(out, "▸ docs") || !strings.Contains(out, "docs/api/spec.yaml") {
		t.Fatalf("filtered picker should show flat fuzzy file result, not folder rows:\n%s", out)
	}
}

func TestFilePickerResultRowsScaleWithTerminalHeight(t *testing.T) {
	a := newFilePickerTreeTestApp()

	a.height = 30
	if got := a.filePickerResultRows(); got != 10 {
		t.Fatalf("short terminal result rows = %d, want 10", got)
	}

	a.height = 40
	if got := a.filePickerResultRows(); got != 18 {
		t.Fatalf("tall terminal result rows = %d, want capped 18", got)
	}
}

func TestFilePickerTallTerminalShowsMoreRows(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 42
	a.stage = StageReady
	a.filePickerOpen = true
	a.filePicker = &filePickerState{loaded: true, sel: 16}
	for i := 0; i < 24; i++ {
		a.filePicker.entries = append(a.filePicker.entries, gact.FileEntry{Path: "file_" + itoa2(i) + ".txt"})
	}

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "file-picker:item:16"); !ok {
		t.Fatal("selected row should be visible in tall file picker")
	}
	if _, ok := findHitTargetForTest(a, "file-picker:item:8"); !ok {
		t.Fatal("tall file picker should retain more surrounding rows")
	}
}
