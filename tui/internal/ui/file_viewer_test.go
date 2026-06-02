package ui

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
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
	a.SetFileViewerRoot(seedFileViewerTree(t))

	visible := a.visibleFileTreeEntries()
	if len(visible) != 2 {
		t.Fatalf("collapsed visible entries = %#v, want docs and README", visible)
	}
	if !visible[0].Dir || visible[0].Path != "docs" || visible[1].Path != "README.md" {
		t.Fatalf("visible entries = %#v, want sorted dirs first", visible)
	}

	if len(a.fileTreeEntries) != 2 {
		t.Fatalf("root load should only include immediate children, got %#v", a.fileTreeEntries)
	}
	a.fileTreeSel = 0
	a.activateFileTreeSelection()
	visible = a.visibleFileTreeEntries()
	paths := make([]string, 0, len(visible))
	for _, entry := range visible {
		paths = append(paths, entry.Path)
	}
	if strings.Join(paths, ",") != "docs,docs/api,docs/guide.md,README.md" {
		t.Fatalf("expanded paths = %#v", paths)
	}
	if len(a.fileTreeEntries) != 4 {
		t.Fatalf("expanding docs should load only docs' immediate children, got %#v", a.fileTreeEntries)
	}
}

func TestFileViewerFollowsActiveWorkspaceRoot(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	root := seedFileViewerTree(t)
	a.workspaces = []gact.Workspace{{ID: "ws_demo", Name: "demo", RootPath: root}}
	a.wsID = "ws_demo"

	a.syncFileViewerRootToWorkspace()

	if a.fileViewerRoot != root {
		t.Fatalf("file viewer root = %q, want workspace root %q", a.fileViewerRoot, root)
	}
	if a.fileTreeRootMode != "workspace" {
		t.Fatalf("file viewer root mode = %q, want workspace", a.fileTreeRootMode)
	}
	out := ansi.Strip(a.renderFileViewerModuleRows(42, 0, 8)[1])
	if !strings.Contains(out, "workspace:") {
		t.Fatalf("root label should indicate workspace mode, got %q", out)
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

func TestFileViewerDetailUploadActionUploadsAttachment(t *testing.T) {
	root := seedFileViewerTree(t)
	var uploadBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/sessions/s1/attachments" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&uploadBody); err != nil {
			t.Fatalf("decode upload body: %v", err)
		}
		_ = json.NewEncoder(w).Encode(gact.ContextFile{
			Path:     ".clio/attachments/s1/README.md",
			Mode:     "read",
			Size:     7,
			Uploaded: true,
		})
	}))
	defer srv.Close()

	a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
	a.stage = StageReady
	a.caps.Capabilities.AttachmentsUpload = true
	a.sessions = []gact.Session{{ID: "s1", Title: "demo"}}
	a.selected = 0
	a.SetFileViewerRoot(root)
	a.fileTreeSel = 1 // README.md
	a.activateFileTreeSelection()
	if !a.detailViewOpen || a.detailView == nil || a.detailView.localPath == "" {
		t.Fatalf("expected file detail with local path, detail=%#v", a.detailView)
	}

	model, cmd := a.handleDetailViewKey(tea.KeyPressMsg{Code: 'u', Text: "u"})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("upload action should dispatch a command")
	}
	msg := cmd()
	if batch, ok := msg.(tea.BatchMsg); ok {
		if len(batch) != 2 {
			t.Fatalf("upload action batch length = %d, want hint + upload", len(batch))
		}
		msg = batch[1]()
	}
	uploaded, ok := msg.(contextFileUploadedMsg)
	if !ok {
		t.Fatalf("upload command returned %T, want contextFileUploadedMsg", msg)
	}
	if uploaded.err != nil {
		t.Fatalf("upload failed: %v", uploaded.err)
	}
	if uploadBody["filename"] != "README.md" || uploadBody["mode"] != "read" {
		t.Fatalf("upload body = %#v", uploadBody)
	}
	if uploadBody["file"] != base64.StdEncoding.EncodeToString([]byte("# demo\n")) {
		t.Fatalf("upload file = %#v", uploadBody["file"])
	}

	model, _ = a.Update(uploaded)
	a = model.(*App)
	if len(a.contextFiles) != 1 || !a.contextFiles[0].Uploaded {
		t.Fatalf("context files after upload = %#v", a.contextFiles)
	}
	if !strings.Contains(a.transientHint, "uploaded .clio/attachments/s1/README.md to context") {
		t.Fatalf("hint = %q", a.transientHint)
	}
}

func TestFileViewerDetailUploadRequiresCapability(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0
	a.detailViewOpen = true
	a.detailView = &bulkyPartRef{messageID: "files", localPath: "/tmp/report.txt"}

	_, cmd := a.handleDetailViewKey(tea.KeyPressMsg{Code: 'u', Text: "u"})
	if cmd == nil {
		t.Fatal("unsupported upload should still schedule hint expiry")
	}
	if a.transientHint != "attachment upload unsupported by this backend" {
		t.Fatalf("hint = %q", a.transientHint)
	}
}
