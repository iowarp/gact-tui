package ui

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
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

func TestFileViewerLazilyLoadsCurrentDirectoryTree(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.fileViewer.setRoot(seedFileViewerTree(t))

	visible := a.fileViewer.visibleEntries()
	if len(visible) != 2 {
		t.Fatalf("collapsed visible entries = %#v, want docs and README", visible)
	}
	if !visible[0].Dir || visible[0].Path != "docs" || visible[1].Path != "README.md" {
		t.Fatalf("visible entries = %#v, want sorted dirs first", visible)
	}

	if len(a.fileViewer.fileTreeEntries) != 2 {
		t.Fatalf("root load should only include immediate children, got %#v", a.fileViewer.fileTreeEntries)
	}
	a.fileViewer.fileTreeSel = 0
	a.fileViewer.activateSelection()
	visible = a.fileViewer.visibleEntries()
	paths := make([]string, 0, len(visible))
	for _, entry := range visible {
		paths = append(paths, entry.Path)
	}
	if strings.Join(paths, ",") != "docs,docs/api,docs/guide.md,README.md" {
		t.Fatalf("expanded paths = %#v", paths)
	}
	if len(a.fileViewer.fileTreeEntries) != 4 {
		t.Fatalf("expanding docs should load only docs' immediate children, got %#v", a.fileViewer.fileTreeEntries)
	}
}

func TestFileViewerFollowsActiveWorkspaceRoot(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	root := seedFileViewerTree(t)
	a.session.workspaces = []gact.Workspace{{ID: "ws_demo", Name: "demo", RootPath: root}}
	a.session.wsID = "ws_demo"

	a.fileViewer.syncRootToWorkspace()

	if a.fileViewer.fileViewerRoot != root {
		t.Fatalf("file viewer root = %q, want workspace root %q", a.fileViewer.fileViewerRoot, root)
	}
	if a.fileViewer.fileTreeRootMode != "workspace" {
		t.Fatalf("file viewer root mode = %q, want workspace", a.fileViewer.fileTreeRootMode)
	}
	out := ansi.Strip(a.fileViewer.renderModuleRows(42, 0, 8)[1])
	if !strings.Contains(out, "workspace:") {
		t.Fatalf("root label should indicate workspace mode, got %q", out)
	}
}

func TestFileViewerUsesPathLikeWorkspaceNameWhenClioReportsScratchRoot(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	realRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(realRoot, "agent-demo-marker.txt"), []byte("demo"), 0o644); err != nil {
		t.Fatal(err)
	}
	scratchRoot := filepath.Join(os.TempDir(), "grind-es-"+filepath.Base(t.TempDir()))
	if err := os.MkdirAll(scratchRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(scratchRoot) })
	a.session.workspaces = []gact.Workspace{{ID: "ws_demo", Name: realRoot, RootPath: scratchRoot}}
	a.session.wsID = "ws_demo"

	a.fileViewer.syncRootToWorkspace()

	if a.fileViewer.fileViewerRoot != realRoot {
		t.Fatalf("file viewer root = %q, want path-like workspace name %q", a.fileViewer.fileViewerRoot, realRoot)
	}
	if len(a.fileViewer.fileTreeEntries) != 1 || a.fileViewer.fileTreeEntries[0].Name != "agent-demo-marker.txt" {
		t.Fatalf("file tree entries = %#v, want named workspace contents", a.fileViewer.fileTreeEntries)
	}
}

func TestFileViewerRefreshDetectsNewWorkspaceFiles(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "initial.txt"), []byte("initial"), 0o644); err != nil {
		t.Fatal(err)
	}
	a.session.workspaces = []gact.Workspace{{ID: "ws_demo", Name: "demo", RootPath: root}}
	a.session.wsID = "ws_demo"
	a.fileViewer.syncRootToWorkspace()

	if err := os.WriteFile(filepath.Join(root, "created-by-agent.txt"), []byte("artifact"), 0o644); err != nil {
		t.Fatal(err)
	}
	a.fileViewer.refreshFromWorkspace()

	var names []string
	for _, entry := range a.fileViewer.fileTreeEntries {
		names = append(names, entry.Name)
	}
	if !slices.Contains(names, "created-by-agent.txt") {
		t.Fatalf("file tree entries = %#v, want newly created file", a.fileViewer.fileTreeEntries)
	}
}

func TestFileViewerRefreshTickDetectsNewWorkspaceFiles(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "initial.txt"), []byte("initial"), 0o644); err != nil {
		t.Fatal(err)
	}
	a.stage = StageReady
	a.session.workspaces = []gact.Workspace{{ID: "ws_demo", Name: "demo", RootPath: root}}
	a.session.wsID = "ws_demo"
	a.sidebar.SetLayout([]string{"sessions", "files", "context"}, nil)
	a.fileViewer.syncRootToWorkspace()

	if err := os.WriteFile(filepath.Join(root, "created-after-start.txt"), []byte("artifact"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, cmd := a.Update(fileViewerRefreshTickMsg{})
	if cmd == nil {
		t.Fatal("file refresh tick should reschedule while the TUI is ready")
	}

	var names []string
	for _, entry := range a.fileViewer.fileTreeEntries {
		names = append(names, entry.Name)
	}
	if !slices.Contains(names, "created-after-start.txt") {
		t.Fatalf("file tree entries = %#v, want newly created file after tick", a.fileViewer.fileTreeEntries)
	}
	if a.fileViewer.fileTreeUpdated.IsZero() {
		t.Fatal("file refresh should stamp the last updated time")
	}
	out := ansi.Strip(strings.Join(a.fileViewer.renderModuleRows(60, 0, 8), "\n"))
	if !strings.Contains(out, "updated") {
		t.Fatalf("file viewer root row should show refresh freshness, got %q", out)
	}
}

func TestFileViewerRefreshesOnLiveSSEEvent(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "initial.txt"), []byte("initial"), 0o644); err != nil {
		t.Fatal(err)
	}
	a.stage = StageReady
	a.session.workspaces = []gact.Workspace{{ID: "ws_demo", Name: "demo", RootPath: root}}
	a.session.wsID = "ws_demo"
	a.sidebar.SetLayout([]string{"sessions", "files", "context"}, nil)
	a.fileViewer.syncRootToWorkspace()

	if err := os.WriteFile(filepath.Join(root, "artifact-from-agent.txt"), []byte("artifact"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, _ = a.Update(sseEventMsg{Event: client.SSEEvent{
		Type: "tool.call.completed",
		Payload: map[string]any{
			"payload": map[string]any{
				"session_id": "s1",
				"tool":       "write_file",
			},
		},
	}})

	var names []string
	for _, entry := range a.fileViewer.fileTreeEntries {
		names = append(names, entry.Name)
	}
	if !slices.Contains(names, "artifact-from-agent.txt") {
		t.Fatalf("file tree entries = %#v, want newly created file after live event", a.fileViewer.fileTreeEntries)
	}
}

func TestFileViewerRefreshPreservesExpandedFoldersAndSelection(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "outputs"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "outputs", "first.txt"), []byte("first"), 0o644); err != nil {
		t.Fatal(err)
	}
	a.session.workspaces = []gact.Workspace{{ID: "ws_demo", Name: "demo", RootPath: root}}
	a.session.wsID = "ws_demo"
	a.fileViewer.syncRootToWorkspace()
	a.fileViewer.fileTreeExpanded["outputs"] = true
	a.fileViewer.reload()
	a.fileViewer.fileTreeSel = 1 // outputs/first.txt

	if err := os.WriteFile(filepath.Join(root, "outputs", "second.txt"), []byte("second"), 0o644); err != nil {
		t.Fatal(err)
	}
	a.fileViewer.refreshFromWorkspace()

	visible := a.fileViewer.visibleEntries()
	if len(visible) != 3 {
		t.Fatalf("visible entries = %#v, want folder plus two files", visible)
	}
	if !slices.ContainsFunc(visible, func(entry fileTreeEntry) bool { return entry.Path == "outputs/second.txt" }) {
		t.Fatalf("visible entries = %#v, want newly created child file", visible)
	}
	if a.fileViewer.fileTreeSel < 0 || a.fileViewer.fileTreeSel >= len(visible) || visible[a.fileViewer.fileTreeSel].Path != "outputs/first.txt" {
		t.Fatalf("selection moved unexpectedly: sel=%d visible=%#v", a.fileViewer.fileTreeSel, visible)
	}
}

func TestFileViewerUnavailableWorkspaceUsesOperatorSummary(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	missing := filepath.Join(t.TempDir(), "missing-workspace")
	a.session.workspaces = []gact.Workspace{{ID: "ws_demo", Name: "demo", RootPath: missing}}
	a.session.wsID = "ws_demo"

	a.fileViewer.syncRootToWorkspace()

	rows := a.fileViewer.renderModuleRows(44, 0, 8)
	out := ansi.Strip(strings.Join(rows, "\n"))
	if !strings.Contains(out, "folder unavailable") {
		t.Fatalf("sidebar should summarize unavailable workspace:\n%s", out)
	}
	if strings.Contains(out, "stat "+missing) || strings.Contains(out, "no such file or directory") {
		t.Fatalf("sidebar should not expose raw stat error:\n%s", out)
	}

	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionFiles
	a.sidebar.sectionCursor = false
	a.sidebar.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("Enter on unavailable file viewer should open detail")
	}
	detail := a.detail.ref.fullText
	for _, want := range []string{"root: " + missing, "mode: workspace", "status: unavailable", "details:"} {
		if !strings.Contains(detail, want) {
			t.Fatalf("detail missing %q:\n%s", want, detail)
		}
	}
	// The raw OS "file not found" error must be preserved, but its wording is
	// platform-specific ("no such file or directory" on unix, "cannot find the
	// file specified" on Windows) — accept either.
	fileNotFound := strings.Contains(detail, "no such file") ||
		strings.Contains(detail, "cannot find the file")
	if !strings.Contains(detail, missing) || !fileNotFound {
		t.Fatalf("detail should preserve raw path/error evidence:\n%s", detail)
	}
}

func TestFileViewerRendersCollapsibleSidebarModule(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 32
	a.stage = StageReady
	a.fileViewer.setRoot(seedFileViewerTree(t))
	a.sidebar.SetLayout([]string{"sessions", "files", "context"}, nil)
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionFiles
	a.sidebar.sectionCursor = false

	out := ansi.Strip(a.sidebar.render(42, 26))
	for _, want := range []string{"FILES", "root:", "▸ docs", "README.md"} {
		if !strings.Contains(out, want) {
			t.Fatalf("file viewer render missing %q:\n%s", want, out)
		}
	}
}

func TestFileViewerEnterTogglesFoldersAndOpensFiles(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.fileViewer.setRoot(seedFileViewerTree(t))
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionFiles
	a.sidebar.sectionCursor = false
	a.fileViewer.fileTreeSel = 0

	a.sidebar.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if !a.fileViewer.fileTreeExpanded["docs"] {
		t.Fatal("Enter on a folder should expand it")
	}

	a.fileViewer.fileTreeSel = 2 // docs/guide.md after docs/api
	a.sidebar.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if !a.detail.visible || a.detail.ref == nil || !strings.Contains(a.detail.ref.fullText, "guide") {
		t.Fatalf("Enter on a file should open detail, open=%v detail=%#v", a.detail.visible, a.detail.ref)
	}
}

func TestFileViewerMouseClickUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 32
	a.stage = StageReady
	a.fileViewer.setRoot(seedFileViewerTree(t))
	a.sidebar.SetLayout([]string{"sessions", "files", "context"}, nil)
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionFiles
	a.sidebar.sectionCursor = false

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:files:item:0")
	if !ok {
		t.Fatal("missing file tree row hit target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: target.rect.x, Y: target.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if !a.fileViewer.fileTreeExpanded["docs"] {
		t.Fatal("clicking folder row should expand it")
	}
}
