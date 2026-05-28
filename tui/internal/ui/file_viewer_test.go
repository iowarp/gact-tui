package ui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
)

func seedFileViewerTree(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "docs", "api"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "README.md"), []byte("# demo\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "docs", "guide.md"), []byte("guide\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "docs", "api", "spec.md"), []byte("spec\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	return root
}

func TestFileViewerScansCurrentDirectoryTree(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.SetFileViewerRoot(seedFileViewerTree(t))

	visible := a.visibleFileTreeEntries()
	if len(visible) != 2 {
		t.Fatalf("collapsed visible entries = %#v, want docs and README", visible)
	}
	if !visible[0].Dir || visible[0].Path != "docs" || visible[1].Path != "README.md" {
		t.Fatalf("visible entries = %#v, want sorted dirs first", visible)
	}

	a.fileTreeExpanded["docs"] = true
	visible = a.visibleFileTreeEntries()
	paths := make([]string, 0, len(visible))
	for _, entry := range visible {
		paths = append(paths, entry.Path)
	}
	if strings.Join(paths, ",") != "docs,docs/api,docs/guide.md,README.md" {
		t.Fatalf("expanded paths = %#v", paths)
	}
}

func TestFileViewerRendersCollapsibleSidebarModule(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 32
	a.stage = StageReady
	a.SetFileViewerRoot(seedFileViewerTree(t))
	a.SetSidebarLayout([]string{"sessions", "files", "context"}, nil)
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionFiles
	a.sidebarSectionCursor = false

	out := ansi.Strip(a.renderSidebar(42, 26))
	for _, want := range []string{"FILES", "root:", "▸ docs", "README.md"} {
		if !strings.Contains(out, want) {
			t.Fatalf("file viewer render missing %q:\n%s", want, out)
		}
	}
}

func TestFileViewerEnterTogglesFoldersAndOpensFiles(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.SetFileViewerRoot(seedFileViewerTree(t))
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionFiles
	a.sidebarSectionCursor = false
	a.fileTreeSel = 0

	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if !a.fileTreeExpanded["docs"] {
		t.Fatal("Enter on a folder should expand it")
	}

	a.fileTreeSel = 2 // docs/guide.md after docs/api
	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if !a.detailViewOpen || a.detailView == nil || !strings.Contains(a.detailView.fullText, "guide") {
		t.Fatalf("Enter on a file should open detail, open=%v detail=%#v", a.detailViewOpen, a.detailView)
	}
}

func TestFileViewerMouseClickUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 32
	a.stage = StageReady
	a.SetFileViewerRoot(seedFileViewerTree(t))
	a.SetSidebarLayout([]string{"sessions", "files", "context"}, nil)
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionFiles
	a.sidebarSectionCursor = false

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:files:item:0")
	if !ok {
		t.Fatal("missing file tree row hit target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: target.rect.x, Y: target.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if !a.fileTreeExpanded["docs"] {
		t.Fatal("clicking folder row should expand it")
	}
}
