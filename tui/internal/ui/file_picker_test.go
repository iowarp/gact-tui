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
