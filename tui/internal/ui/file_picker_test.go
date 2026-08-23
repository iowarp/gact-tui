package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func newFilePickerTreeTestApp() *App {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.filePicker.open = true
	a.filePicker.filePickerState = filePickerState{
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

	out := stripANSI(a.filePicker.view())
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
	if !a.filePicker.treeExpanded["docs"] || !a.filePicker.open {
		t.Fatalf("folder click should expand and keep picker open, expanded=%v open=%v", a.filePicker.treeExpanded, a.filePicker.open)
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
	if a.filePicker.open {
		t.Fatal("selecting a file should close the picker")
	}
	if got := a.inputComposer.input.Value(); !strings.Contains(got, "@docs/guide.md") {
		t.Fatalf("selected file was not inserted, input=%q", got)
	}
}

func TestFilePickerTypingUsesFuzzyFileResultsNotFolderRows(t *testing.T) {
	a := newFilePickerTreeTestApp()
	a.filePicker.filter = "spec"

	matches := a.filePicker.matches()
	if len(matches) != 1 || matches[0].Path != "docs/api/spec.yaml" {
		t.Fatalf("fuzzy matches = %#v, want only docs/api/spec.yaml", matches)
	}
	out := stripANSI(a.filePicker.view())
	if strings.Contains(out, "▸ docs") || !strings.Contains(out, "docs/api/spec.yaml") {
		t.Fatalf("filtered picker should show flat fuzzy file result, not folder rows:\n%s", out)
	}
}

func TestFilePickerResultRowsScaleWithTerminalHeight(t *testing.T) {
	a := newFilePickerTreeTestApp()

	a.height = 30
	if got := a.filePicker.resultRows(); got != 10 {
		t.Fatalf("short terminal result rows = %d, want 10", got)
	}

	a.height = 40
	if got := a.filePicker.resultRows(); got != 18 {
		t.Fatalf("tall terminal result rows = %d, want capped 18", got)
	}
}

func TestFilePickerTallTerminalShowsMoreRows(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 42
	a.stage = StageReady
	a.filePicker.open = true
	a.filePicker.filePickerState = filePickerState{loaded: true, sel: 16}
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

func TestFilePickerLoadClampsStaleSelection(t *testing.T) {
	a := newFilePickerTreeTestApp()
	a.filePicker.treeMode = false
	a.filePicker.sel = 12

	model, cmd := a.Update(filePickerLoadedMsg{entries: []gact.FileEntry{{Path: "README.md", Type: "file"}}})
	a = model.(*App)
	if cmd != nil {
		t.Fatal("file picker load should not dispatch a command")
	}
	if a.filePicker.sel != 0 {
		t.Fatalf("file picker selection = %d, want clamped to 0", a.filePicker.sel)
	}

	model, cmd = a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = model.(*App)
	if cmd != nil {
		t.Fatal("file picker insert should not dispatch a command")
	}
	if a.filePicker.open {
		t.Fatal("enter after clamped load should insert and close picker")
	}
	if got := a.inputComposer.input.Value(); !strings.Contains(got, "@README.md") {
		t.Fatalf("clamped selection did not insert loaded file, input=%q", got)
	}
}

func TestFilePickerTreeRailUsesTreeRowCount(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 30
	a.stage = StageReady
	a.filePicker.open = true
	a.filePicker.filePickerState = filePickerState{loaded: true, treeMode: true, treeExpanded: map[string]bool{}}
	for i := 0; i < 20; i++ {
		a.filePicker.entries = append(a.filePicker.entries, gact.FileEntry{Path: "dir_" + itoa2(i), Type: "dir"})
	}
	a.filePicker.entries = append(a.filePicker.entries, gact.FileEntry{Path: "z.txt", Type: "file"})

	rows := a.filePicker.treeRows()
	if len(rows) <= len(a.filePicker.matches()) {
		t.Fatalf("test setup should have more tree rows than file matches, rows=%d matches=%d", len(rows), len(a.filePicker.matches()))
	}

	_ = a.View()
	var rail uiHitTarget
	found := false
	for _, target := range a.interaction.hits.targets {
		if strings.HasPrefix(target.id, "file-picker:list:wheel:rail:") && (!found || target.rect.y > rail.rect.y) {
			rail = target
			found = true
		}
	}
	if !found {
		t.Fatal("missing file picker rail hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rail.rect.x,
		Y:      rail.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("rail click should not dispatch a command")
	}
	if want := len(rows) - 1; a.filePicker.sel != want {
		t.Fatalf("tree rail selection = %d, want %d from tree row count", a.filePicker.sel, want)
	}
}
