package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// makeSwitcherApp returns an App with two workspaces loaded, currently
// on ws_a (selected = first workspace). The httptest server answers
// /v1/sessions for whichever workspace_id the test dispatches, so the
// Enter-switch flow can complete without a real emulator.
func makeSwitcherApp(t *testing.T) *App {
	t.Helper()
	sessionsByWS := map[string][]gact.Session{
		"ws_a": {{ID: "s_a1", Title: "first"}},
		"ws_b": {{ID: "s_b1", Title: "other"}, {ID: "s_b2", Title: "more"}},
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/sessions" {
			ws := r.URL.Query().Get("workspace_id")
			_ = json.NewEncoder(w).Encode(map[string]any{"sessions": sessionsByWS[ws]})
			return
		}
		// Swallow SSE opens so selectSession's post-switch reload
		// doesn't hang the test. Return a 200 that closes immediately;
		// the TUI's SSE consumer handles that as a disconnect.
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	a := New(srv.URL)
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.session.workspaces = []gact.Workspace{
		{ID: "ws_a", Name: "alpha", RootPath: "/tmp/alpha"},
		{ID: "ws_b", Name: "bravo", RootPath: "/tmp/bravo", Metadata: map[string]any{"source": "git", "git_url": "git@github.com:org/bravo.git"}},
	}
	a.session.wsID = "ws_a"
	a.session.sessions = sessionsByWS["ws_a"]
	a.session.selected = 0
	return a
}

func TestWorkspaceSwitcher_CtrlWOpensWithCurrentSelected(t *testing.T) {
	a := makeSwitcherApp(t)
	a.handleKey(tea.KeyPressMsg{Code: 'w', Mod: tea.ModCtrl})
	if !a.workspace.switchOpen {
		t.Fatal("Ctrl+W should open the switcher")
	}
	if a.workspace.switchSel != 0 {
		t.Errorf("selection should default to current workspace (index 0), got %d", a.workspace.switchSel)
	}
}

func TestWorkspaceHeaderLabelIncludesCompactRoot(t *testing.T) {
	short := workspaceHeaderLabelPlain(gact.Workspace{ID: "ws_b", Name: "bravo", RootPath: "/tmp/bravo"})
	if short != "bravo @ /tmp/bravo" {
		t.Fatalf("short workspace header = %q", short)
	}

	long := workspaceHeaderLabelPlain(gact.Workspace{
		ID:       "ws_demo",
		Name:     "demo",
		RootPath: "/home/jcernuda/projects/clio/benchmarks/current",
	})
	if long != "demo @ /.../benchmarks/current" {
		t.Fatalf("long workspace header = %q", long)
	}

	noRoot := workspaceHeaderLabelPlain(gact.Workspace{ID: "ws_default", Name: "default"})
	if noRoot != "default" {
		t.Fatalf("no-root workspace header = %q", noRoot)
	}
}

func TestWorkspaceSwitcherExplainsFolderGitRemoveWorkflow(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.switchOpen = true
	a.workspace.switchSel = 1

	out := stripANSI(a.workspace.view())
	for _, want := range []string{
		"Workspace manager",
		"Current workspace: /tmp/alpha",
		"Add workspace",
		"open folder: register an existing local folder",
		"clone Git: clone a repository into a local folder, then switch into it",
		"Existing workspaces",
		"Remove unregisters inactive entries only. Local files stay on disk; switch away before",
		"removing the current workspace.",
		"current workspace",
		"open folder",
		"clone git",
		"Git  bravo",
		"root: /tmp/bravo",
		"n open folder",
		"g clone git",
		"d remove",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("workspace switcher missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "ws_b") {
		t.Fatalf("workspace switcher should not expose backend IDs in primary named rows:\n%s", out)
	}
	for _, old := range []string{"current workspace root:", "current cannot be removed", "Remove only unregisters inactive workspace entries"} {
		if strings.Contains(out, old) {
			t.Fatalf("workspace switcher leaked stale wording %q:\n%s", old, out)
		}
	}
}

func TestWorkspaceSwitcher_EscClosesWithoutSideEffects(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.switchOpen = true
	a.workspace.switchSel = 1
	a.workspace.handleKey(tea.KeyPressMsg{Code: tea.KeyEsc})
	if a.workspace.switchOpen {
		t.Error("Esc should close the modal")
	}
	if a.session.wsID != "ws_a" {
		t.Errorf("wsID should be unchanged, got %q", a.session.wsID)
	}
}

func TestWorkspaceSwitcher_DownMovesSelection(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.switchOpen = true
	a.workspace.switchSel = 0
	a.workspace.handleKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.workspace.switchSel != 1 {
		t.Errorf("↓ moved to %d, want 1", a.workspace.switchSel)
	}
	// Over-run: pressing ↓ at the last entry should clamp, not wrap.
	a.workspace.handleKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.workspace.switchSel != 1 {
		t.Errorf("↓ past end clamped to %d, want 1", a.workspace.switchSel)
	}
}

func TestWorkspaceSwitcher_GOpensGitCreateMode(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.switchOpen = true

	_, cmd := a.workspace.handleKey(tea.KeyPressMsg{Code: 'g', Text: "g"})
	if cmd != nil {
		t.Fatal("git create shortcut should not dispatch immediately")
	}
	if !a.workspace.create.open || a.workspace.create.mode != "git" {
		t.Fatalf("git create mode not opened: open=%v mode=%q", a.workspace.create.open, a.workspace.create.mode)
	}
	if a.workspace.create.field != 1 {
		t.Fatalf("git create should focus repo URL field, got %d", a.workspace.create.field)
	}
}

func TestWorkspaceSwitcher_EnterOnCurrentIsNoop(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.switchOpen = true
	a.workspace.switchSel = 0 // already on ws_a
	_, cmd := a.workspace.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd != nil {
		t.Error("Enter on current workspace should not trigger a reload cmd")
	}
	if a.workspace.switchOpen {
		t.Error("modal should still close")
	}
	if a.session.wsID != "ws_a" {
		t.Errorf("wsID should stay ws_a, got %q", a.session.wsID)
	}
	if a.transientHint == "" {
		t.Error("expected a 'already on …' toast")
	}
}

func TestWorkspaceSwitcher_EnterSwitchesWorkspace(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.switchOpen = true
	a.workspace.switchSel = 1 // ws_b

	_, cmd := a.workspace.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("Enter on a different workspace should emit a listSessions Cmd")
	}
	if a.workspace.switchOpen {
		t.Error("modal should close on switch")
	}
	if a.session.wsID != "ws_b" {
		t.Errorf("wsID = %q, want ws_b", a.session.wsID)
	}
	// Session state must be torn down so the stale ws_a session isn't
	// left visible while the new list loads.
	if len(a.session.sessions) != 0 {
		t.Errorf("sessions should be cleared, got %d", len(a.session.sessions))
	}
	if a.session.selected != -1 {
		t.Errorf("selected should reset to -1, got %d", a.session.selected)
	}

	// Run the returned cmd and verify the Update handler folds the
	// new sessions in and lands on index 0.
	msg := cmd()
	switched, ok := msg.(workspaceSwitchedMsg)
	if !ok {
		t.Fatalf("cmd returned %T, want workspaceSwitchedMsg", msg)
	}
	if switched.wsID != "ws_b" || len(switched.sessions) != 2 {
		t.Errorf("msg = %+v", switched)
	}
}

func TestWorkspaceSwitcher_EnterRefreshesFileViewerAndClearsWorkspaceScopedPanels(t *testing.T) {
	a := makeSwitcherApp(t)
	oldRoot := t.TempDir()
	newRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(oldRoot, "old-only.txt"), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(newRoot, "clean-only.txt"), []byte("clean"), 0o644); err != nil {
		t.Fatal(err)
	}
	a.session.workspaces[0].RootPath = oldRoot
	a.session.workspaces[1].RootPath = newRoot
	a.session.wsID = "ws_a"
	a.fileViewer.setRoot(oldRoot)
	a.session.contextFiles = []gact.ContextFile{{Path: "old-context.txt"}}
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{messageID: "files", partID: "old-only.txt", localPath: filepath.Join(oldRoot, "old-only.txt")}
	a.detail.scroll = 4

	a.workspace.switchOpen = true
	a.workspace.switchSel = 1 // ws_b
	_, cmd := a.workspace.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("Enter on a different workspace should dispatch a reload")
	}

	if a.fileViewer.fileViewerRoot != mustAbsPath(t, newRoot) {
		t.Fatalf("fileViewerRoot = %q, want %q", a.fileViewer.fileViewerRoot, mustAbsPath(t, newRoot))
	}
	if len(a.session.contextFiles) != 0 || a.session.contextFileSel != 0 {
		t.Fatalf("context files not cleared: files=%d sel=%d", len(a.session.contextFiles), a.session.contextFileSel)
	}
	if a.detail.visible || a.detail.ref != nil || a.detail.scroll != 0 {
		t.Fatalf("stale workspace detail remained open: open=%v detail=%#v scroll=%d", a.detail.visible, a.detail.ref, a.detail.scroll)
	}
	if len(a.fileViewer.fileTreeEntries) != 1 || a.fileViewer.fileTreeEntries[0].Name != "clean-only.txt" {
		t.Fatalf("file tree entries = %#v, want only clean workspace file", a.fileViewer.fileTreeEntries)
	}
}

func TestWorkspaceSwitcher_StaleSwitchedMsgIgnored(t *testing.T) {
	// If the user switches ws_a → ws_b → ws_a before ws_b's response
	// lands, the ws_b response must not clobber ws_a state.
	a := makeSwitcherApp(t)
	a.session.wsID = "ws_a"
	a.session.sessions = []gact.Session{{ID: "still_here"}}

	stale := workspaceSwitchedMsg{wsID: "ws_b", sessions: []gact.Session{{ID: "shouldnt_render"}}}
	model, _ := a.Update(stale)
	a = model.(*App)

	if len(a.session.sessions) != 1 || a.session.sessions[0].ID != "still_here" {
		t.Errorf("stale switch overwrote current state: %+v", a.session.sessions)
	}
}

func mustAbsPath(t *testing.T, path string) string {
	t.Helper()
	abs, err := filepath.Abs(path)
	if err != nil {
		t.Fatal(err)
	}
	return abs
}

func TestWorkspaceSwitcher_EmptyWorkspacesOpensCreateCapableModal(t *testing.T) {
	a := makeSwitcherApp(t)
	a.session.workspaces = nil
	a.handleKey(tea.KeyPressMsg{Code: 'w', Mod: tea.ModCtrl})
	if !a.workspace.switchOpen {
		t.Error("should open the modal when there are no workspaces")
	}
	out := stripANSI(a.workspace.view())
	if !strings.Contains(out, "no workspaces yet") || !strings.Contains(out, "open a folder") || !strings.Contains(out, "clone a Git repo") {
		t.Fatalf("empty switcher should explain create path:\n%s", out)
	}
}
