package ui

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
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
	a.workspaces = []gact.Workspace{
		{ID: "ws_a", Name: "alpha", RootPath: "/tmp/alpha"},
		{ID: "ws_b", Name: "bravo", RootPath: "/tmp/bravo", Metadata: map[string]any{"source": "git", "git_url": "git@github.com:org/bravo.git"}},
	}
	a.wsID = "ws_a"
	a.sessions = sessionsByWS["ws_a"]
	a.selected = 0
	return a
}

func TestWorkspaceSwitcher_CtrlWOpensWithCurrentSelected(t *testing.T) {
	a := makeSwitcherApp(t)
	a.handleKey(tea.KeyPressMsg{Code: 'w', Mod: tea.ModCtrl})
	if !a.workspaceSwitchOpen {
		t.Fatal("Ctrl+W should open the switcher")
	}
	if a.workspaceSwitchSel != 0 {
		t.Errorf("selection should default to current workspace (index 0), got %d", a.workspaceSwitchSel)
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
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 1

	out := stripANSI(a.viewWorkspaceSwitch())
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
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 1
	a.handleWorkspaceSwitchKey(tea.KeyPressMsg{Code: tea.KeyEsc})
	if a.workspaceSwitchOpen {
		t.Error("Esc should close the modal")
	}
	if a.wsID != "ws_a" {
		t.Errorf("wsID should be unchanged, got %q", a.wsID)
	}
}

func TestWorkspaceSwitcher_DownMovesSelection(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 0
	a.handleWorkspaceSwitchKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.workspaceSwitchSel != 1 {
		t.Errorf("↓ moved to %d, want 1", a.workspaceSwitchSel)
	}
	// Over-run: pressing ↓ at the last entry should clamp, not wrap.
	a.handleWorkspaceSwitchKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.workspaceSwitchSel != 1 {
		t.Errorf("↓ past end clamped to %d, want 1", a.workspaceSwitchSel)
	}
}

func TestWorkspaceSwitcher_GOpensGitCreateMode(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaceSwitchOpen = true

	_, cmd := a.handleWorkspaceSwitchKey(tea.KeyPressMsg{Code: 'g', Text: "g"})
	if cmd != nil {
		t.Fatal("git create shortcut should not dispatch immediately")
	}
	if !a.workspaceCreateOpen || a.workspaceCreateMode != "git" {
		t.Fatalf("git create mode not opened: open=%v mode=%q", a.workspaceCreateOpen, a.workspaceCreateMode)
	}
	if a.workspaceCreateField != 1 {
		t.Fatalf("git create should focus repo URL field, got %d", a.workspaceCreateField)
	}
}

func TestWorkspaceCreateFormsExplainRootAndGitSemantics(t *testing.T) {
	a := makeSwitcherApp(t)

	a.openWorkspaceCreateMode("folder")
	out := stripANSI(a.viewWorkspaceCreate())
	for _, want := range []string{
		"Open workspace from Folder",
		"Open an existing local folder",
		"Use an absolute folder root",
		"Folder path:",
		"open",
		"Enter open",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("folder workspace form missing %q:\n%s", want, out)
		}
	}

	a.openWorkspaceCreateMode("git")
	out = stripANSI(a.viewWorkspaceCreate())
	for _, want := range []string{
		"Clone workspace from Git",
		"Clone a Git repository",
		"local clone folder is auto-filled",
		"Repository URL:",
		"Local clone folder:",
		"Workspace name:",
		"clone/open",
		"Enter clone/open",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("git workspace form missing %q:\n%s", want, out)
		}
	}
	for _, old := range []string{"Git repository:", "git repository:", "clone path:"} {
		if strings.Contains(out, old) {
			t.Fatalf("git workspace form should use operator-facing labels, found %q:\n%s", old, out)
		}
	}
}

func TestWorkspaceCreateSummaryHidesActiveField(t *testing.T) {
	a := makeSwitcherApp(t)
	a.openWorkspaceCreateMode("git")
	a.workspaceCreateGitURL = "git@github.com:iowarp/clio-agent.git"
	a.workspaceCreateName = "clio-agent"
	a.workspaceCreateRoot = "/tmp/clio-agent"

	a.workspaceCreateField = 1
	a.workspaceSwitchOpen = true
	out := stripANSI(a.viewWorkspaceCreate())
	_ = a.View()
	if got := strings.Count(out, "Repository URL:"); got != 1 {
		t.Fatalf("active repository field should render once, got %d:\n%s", got, out)
	}
	if _, ok := findHitTargetForTest(a, "workspace-create:field:name"); !ok {
		t.Fatal("inactive workspace name summary should remain clickable")
	}
	if _, ok := findHitTargetForTest(a, "workspace-create:field:root"); !ok {
		t.Fatal("inactive clone folder summary should remain clickable")
	}
	if _, ok := findHitTargetForTest(a, "workspace-create:field:git"); ok {
		t.Fatal("active repository editor should not duplicate a summary hit target")
	}
}

func TestWorkspaceCreateGitURLDerivesNameAndClonePath(t *testing.T) {
	a := makeSwitcherApp(t)
	a.openWorkspaceCreateMode("git")
	a.workspaceCreateGitURL = ""
	a.workspaceCreateGitCur = 0

	a.insertWorkspaceCreateText("git@github.com:iowarp/clio-agent.git")

	if a.workspaceCreateName != "clio-agent" {
		t.Fatalf("derived name = %q, want clio-agent", a.workspaceCreateName)
	}
	if !strings.HasSuffix(a.workspaceCreateRoot, "/clio-agent") {
		t.Fatalf("derived root = %q, want suffix /clio-agent", a.workspaceCreateRoot)
	}
}

func TestWorkspaceCreateGitURLDerivesAcrossCharacterTyping(t *testing.T) {
	a := makeSwitcherApp(t)
	a.openWorkspaceCreateMode("git")
	a.workspaceCreateGitURL = ""
	a.workspaceCreateGitCur = 0

	for _, r := range "git@github.com:iowarp/clio-agent.git" {
		a.insertWorkspaceCreateText(string(r))
	}

	if a.workspaceCreateName != "clio-agent" {
		t.Fatalf("character-typed derived name = %q, want clio-agent", a.workspaceCreateName)
	}
	if !strings.HasSuffix(a.workspaceCreateRoot, "/clio-agent") {
		t.Fatalf("character-typed derived root = %q, want suffix /clio-agent", a.workspaceCreateRoot)
	}
}

func TestWorkspaceCreateGitURLDerivationDoesNotOverwriteManualFields(t *testing.T) {
	a := makeSwitcherApp(t)
	a.openWorkspaceCreateMode("git")
	a.workspaceCreateName = "custom-name"
	a.workspaceCreateRoot = "/tmp/custom-root"
	a.workspaceCreateGitURL = ""
	a.workspaceCreateGitCur = 0

	a.insertWorkspaceCreateText("git@github.com:iowarp/clio-agent.git")

	if a.workspaceCreateName != "custom-name" {
		t.Fatalf("manual name was overwritten: %q", a.workspaceCreateName)
	}
	if a.workspaceCreateRoot != "/tmp/custom-root" {
		t.Fatalf("manual root was overwritten: %q", a.workspaceCreateRoot)
	}
}

func TestWorkspaceSwitcher_DeleteRequiresConfirmationAndRemovesWorkspace(t *testing.T) {
	var deletedPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			deletedPath = r.URL.Path
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	a := New(srv.URL)
	a.stage = StageReady
	a.workspaces = []gact.Workspace{
		{ID: "ws_a", Name: "alpha", RootPath: "/tmp/alpha"},
		{ID: "ws_b", Name: "bravo", RootPath: "/tmp/bravo"},
	}
	a.wsID = "ws_a"
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 1

	_, cmd := a.handleWorkspaceSwitchKey(tea.KeyPressMsg{Code: 'd', Text: "d"})
	if cmd != nil {
		t.Fatal("first delete press should arm confirmation only")
	}
	if a.workspaceDeleteID != "ws_b" {
		t.Fatalf("workspaceDeleteID = %q, want ws_b", a.workspaceDeleteID)
	}
	_, cmd = a.handleWorkspaceSwitchKey(tea.KeyPressMsg{Code: 'd', Text: "d"})
	if cmd == nil {
		t.Fatal("second delete press should dispatch delete command")
	}
	msg := cmd()
	deleted, ok := msg.(workspaceDeletedMsg)
	if !ok || deleted.err != nil {
		t.Fatalf("delete cmd returned %#v", msg)
	}
	model, follow := a.Update(deleted)
	a = model.(*App)
	if follow == nil {
		t.Fatal("successful delete should schedule hint expiry")
	}
	if deletedPath != "/v1/workspaces/ws_b" {
		t.Fatalf("delete path = %q", deletedPath)
	}
	if len(a.workspaces) != 1 || a.workspaces[0].ID != "ws_a" {
		t.Fatalf("workspaces after delete = %#v", a.workspaces)
	}
}

func TestWorkspaceSwitcher_DeleteCurrentWorkspaceIsBlocked(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 0

	_, cmd := a.handleWorkspaceSwitchKey(tea.KeyPressMsg{Code: 'd', Text: "d"})
	if cmd != nil {
		t.Fatal("delete current workspace should not dispatch")
	}
	if !strings.Contains(a.workspaceDeleteError, "switch to another workspace") {
		t.Fatalf("workspaceDeleteError = %q", a.workspaceDeleteError)
	}
}

func TestWorkspaceSwitcher_DeleteFailureStaysOpenAndShowsOperatorError(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 1
	a.workspaceDeleteID = "ws_b"
	a.workspaceDeleteSaving = true

	model, cmd := a.Update(workspaceDeletedMsg{workspaceID: "ws_b", err: &client.Error{
		Status:  409,
		Code:    "workspace_remove_failed",
		Message: "workspace is pinned by an active benchmark profile",
	}})
	a = model.(*App)

	if cmd != nil {
		t.Fatal("delete failure should not dispatch follow-up command")
	}
	if !a.workspaceSwitchOpen {
		t.Fatal("delete failure should keep workspace switcher open")
	}
	if a.workspaceDeleteSaving {
		t.Fatal("delete failure should clear saving flag")
	}
	if len(a.workspaces) != 2 || a.workspaces[1].ID != "ws_b" {
		t.Fatalf("delete failure should keep workspace row, got %#v", a.workspaces)
	}
	if !strings.Contains(a.workspaceDeleteError, "workspace is pinned by an active benchmark profile") {
		t.Fatalf("workspaceDeleteError = %q", a.workspaceDeleteError)
	}
	if strings.Contains(a.workspaceDeleteError, "gact:") || strings.Contains(a.workspaceDeleteError, "workspace_remove_failed") {
		t.Fatalf("workspaceDeleteError leaked backend wrapper: %q", a.workspaceDeleteError)
	}
}

func TestWorkspaceSwitcher_EnterOnCurrentIsNoop(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 0 // already on ws_a
	_, cmd := a.handleWorkspaceSwitchKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd != nil {
		t.Error("Enter on current workspace should not trigger a reload cmd")
	}
	if a.workspaceSwitchOpen {
		t.Error("modal should still close")
	}
	if a.wsID != "ws_a" {
		t.Errorf("wsID should stay ws_a, got %q", a.wsID)
	}
	if a.transientHint == "" {
		t.Error("expected a 'already on …' toast")
	}
}

func TestWorkspaceSwitcher_EnterSwitchesWorkspace(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 1 // ws_b

	_, cmd := a.handleWorkspaceSwitchKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("Enter on a different workspace should emit a listSessions Cmd")
	}
	if a.workspaceSwitchOpen {
		t.Error("modal should close on switch")
	}
	if a.wsID != "ws_b" {
		t.Errorf("wsID = %q, want ws_b", a.wsID)
	}
	// Session state must be torn down so the stale ws_a session isn't
	// left visible while the new list loads.
	if len(a.sessions) != 0 {
		t.Errorf("sessions should be cleared, got %d", len(a.sessions))
	}
	if a.selected != -1 {
		t.Errorf("selected should reset to -1, got %d", a.selected)
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

func TestWorkspaceSwitcher_StaleSwitchedMsgIgnored(t *testing.T) {
	// If the user switches ws_a → ws_b → ws_a before ws_b's response
	// lands, the ws_b response must not clobber ws_a state.
	a := makeSwitcherApp(t)
	a.wsID = "ws_a"
	a.sessions = []gact.Session{{ID: "still_here"}}

	stale := workspaceSwitchedMsg{wsID: "ws_b", sessions: []gact.Session{{ID: "shouldnt_render"}}}
	model, _ := a.Update(stale)
	a = model.(*App)

	if len(a.sessions) != 1 || a.sessions[0].ID != "still_here" {
		t.Errorf("stale switch overwrote current state: %+v", a.sessions)
	}
}

func TestWorkspaceSwitcher_EmptyWorkspacesOpensCreateCapableModal(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaces = nil
	a.handleKey(tea.KeyPressMsg{Code: 'w', Mod: tea.ModCtrl})
	if !a.workspaceSwitchOpen {
		t.Error("should open the modal when there are no workspaces")
	}
	out := stripANSI(a.viewWorkspaceSwitch())
	if !strings.Contains(out, "no workspaces yet") || !strings.Contains(out, "open a folder") || !strings.Contains(out, "clone a Git repo") {
		t.Fatalf("empty switcher should explain create path:\n%s", out)
	}
}

func TestWorkspaceSwitcherRowsUseSemanticHitTargets(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "workspace-switch:item:ws_b")
	if !ok {
		t.Fatal("missing semantic workspace row target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.workspaceSwitchSel != 1 {
		t.Fatalf("workspaceSwitchSel = %d, want clicked row", a.workspaceSwitchSel)
	}
	if a.workspaceSwitchOpen {
		t.Fatal("clicking workspace row should close switcher")
	}
	if a.wsID != "ws_b" {
		t.Fatalf("wsID = %q, want ws_b", a.wsID)
	}
	if cmd == nil {
		t.Fatal("clicking a different workspace should dispatch listSessions cmd")
	}
}

func TestWorkspaceSwitcherTargetsAlignWithSharedFrameBody(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "workspace-switch:item:ws_a")
	if !ok {
		t.Fatal("missing semantic first workspace row target")
	}
	rect := overlayMouseRect(a.viewWorkspaceSwitch(), a.width, a.height)
	if wantY := rect.y + 2 + 9; target.rect.y != wantY {
		t.Fatalf("first workspace row y = %d, want shared frame body row %d", target.rect.y, wantY)
	}
}

func TestWorkspaceSwitcherCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 1

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:workspace-switch:close")
	if !ok {
		t.Fatal("missing semantic workspace close target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("workspace close should not dispatch a command")
	}
	if a.workspaceSwitchOpen {
		t.Fatal("workspace close should close switcher")
	}
	if a.wsID != "ws_a" {
		t.Fatalf("workspace close changed workspace to %q", a.wsID)
	}
}

func TestWorkspaceSwitcherMouseWheelMovesSelectionOnlyOverList(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "workspace-switch:list:wheel")
	if !ok {
		t.Fatal("missing semantic workspace list wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.workspaceSwitchSel != 1 {
		t.Fatalf("wheel over workspace list should move selection, got %d", a.workspaceSwitchSel)
	}

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "workspace-switch:surface:wheel")
	if !ok {
		t.Fatal("missing workspace surface wheel blocker")
	}
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      surface.rect.x + 1,
		Y:      surface.rect.y + 1,
		Button: tea.MouseWheelUp,
	}))
	a = model.(*App)
	if a.workspaceSwitchSel != 1 {
		t.Fatalf("wheel on workspace chrome should not move selection, got %d", a.workspaceSwitchSel)
	}
}

func TestWorkspaceSwitcherUsesSharedModalListMarkers(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 0

	out := stripANSI(a.viewWorkspaceSwitch())

	for _, want := range []string{
		"Switch workspace",
		"▌ alpha",
		"root: /tmp/alpha · current workspace",
		"[current]",
		"bravo",
		"Enter switch",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("workspace switcher missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "ws_a") || strings.Contains(out, "ws_b") {
		t.Fatalf("workspace switcher should keep backend IDs out of named workspace rows:\n%s", out)
	}
}

func TestWorkspaceSwitcherUsesSharedInsetListWidth(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaceSwitchOpen = true

	_ = a.View()
	target, ok := findHitTargetForTest(a, "workspace-switch:item:ws_a")
	if !ok {
		t.Fatal("missing workspace row hit target")
	}
	if got, want := target.rect.w, modalInsetListWidth(a.modalWidth()); got != want {
		t.Fatalf("workspace row hit width = %d, want shared inset width %d", got, want)
	}
}

func TestWorkspaceSwitcherUsesBoundedScrollWindow(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaces = nil
	for i := 0; i < 20; i++ {
		a.workspaces = append(a.workspaces, gact.Workspace{
			ID:   "ws_" + itoa2(i),
			Name: "workspace " + itoa2(i),
		})
	}
	a.wsID = "ws_00"
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 18

	out := stripANSI(a.viewWorkspaceSwitch())
	if !strings.Contains(out, "workspace 18") {
		t.Fatalf("selected workspace should remain visible in bounded window:\n%s", out)
	}
	if strings.Contains(out, "workspace 00") {
		t.Fatalf("bounded window should not render every workspace:\n%s", out)
	}
	if strings.Contains(out, "ws_18") {
		t.Fatalf("bounded window should not expose backend IDs in named workspace rows:\n%s", out)
	}
	if strings.Contains(out, "↑ 12") || strings.Contains(out, "↓ 12") {
		t.Fatalf("bounded window should not render textual scroll count rows:\n%s", out)
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("bounded window should show shared side scroll rail:\n%s", out)
	}
}

func TestWorkspaceSwitcherScrolledRowsUseSemanticHitTargets(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaces = nil
	for i := 0; i < 20; i++ {
		a.workspaces = append(a.workspaces, gact.Workspace{
			ID:   "ws_" + itoa2(i),
			Name: "workspace " + itoa2(i),
		})
	}
	a.wsID = "ws_00"
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 18

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "workspace-switch:item:ws_18"); !ok {
		t.Fatal("missing semantic target for selected row inside scrolled workspace window")
	}
	if _, ok := findHitTargetForTest(a, "workspace-switch:item:ws_00"); ok {
		t.Fatal("offscreen workspace row should not register a stale hit target")
	}
}

func TestWorkspaceSwitcherNonRowClickDoesNotChooseByCoordinates(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 0

	_ = a.View()
	rect := overlayMouseRect(a.viewWorkspaceSwitch(), a.width, a.height)
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + rect.w - 2,
		Y:      rect.y + 2 + 1,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("non-row click inside workspace switcher should not dispatch")
	}
	if !a.workspaceSwitchOpen {
		t.Fatal("non-row click inside workspace switcher should keep modal open")
	}
	if a.workspaceSwitchSel != 0 || a.wsID != "ws_a" {
		t.Fatalf("non-row click changed selection/state: sel=%d ws=%s", a.workspaceSwitchSel, a.wsID)
	}
}

func TestWorkspaceSwitcherNewButtonOpensCreateForm(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaceSwitchOpen = true

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:workspace-switch:new-folder")
	if !ok {
		t.Fatal("missing semantic new-folder workspace button")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("new workspace button should not dispatch before form submit")
	}
	if !a.workspaceSwitchOpen || !a.workspaceCreateOpen {
		t.Fatalf("new workspace should open create form, switch=%v create=%v", a.workspaceSwitchOpen, a.workspaceCreateOpen)
	}
}

func TestWorkspaceCreateFormSwitchesFieldsByTabAndMouse(t *testing.T) {
	a := makeSwitcherApp(t)
	a.openWorkspaceCreate()

	a.handleWorkspaceSwitchKey(tea.KeyPressMsg{Code: tea.KeyTab})
	if a.workspaceCreateField != 1 {
		t.Fatalf("Tab should move to root field, got %d", a.workspaceCreateField)
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "workspace-create:field:name")
	if !ok {
		t.Fatal("missing name field hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("field click should not dispatch")
	}
	if a.workspaceCreateField != 0 {
		t.Fatalf("name field click should select field 0, got %d", a.workspaceCreateField)
	}
}

func TestWorkspaceCreateRequiresRootPath(t *testing.T) {
	a := makeSwitcherApp(t)
	a.openWorkspaceCreate()
	a.workspaceCreateRoot = ""
	a.workspaceCreateRootCur = 0

	_, cmd := a.handleWorkspaceSwitchKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd != nil {
		t.Fatal("empty root should not dispatch create command")
	}
	if !strings.Contains(a.workspaceCreateError, "root path is required") {
		t.Fatalf("workspaceCreateError = %q", a.workspaceCreateError)
	}
	if a.workspaceCreateField != 1 {
		t.Fatalf("empty root should focus root field, got %d", a.workspaceCreateField)
	}
}

func TestWorkspaceCreateSuccessSwitchesAndClearsScopedState(t *testing.T) {
	created := gact.Workspace{ID: "ws_new", Name: "new", RootPath: "/tmp/new"}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/workspaces":
			var req map[string]any
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode create workspace: %v", err)
			}
			if req["name"] != "new" || req["root_path"] != "/tmp/new" {
				t.Fatalf("workspace create body = %#v", req)
			}
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(created)
		case r.Method == http.MethodGet && r.URL.Path == "/v1/sessions":
			if got := r.URL.Query().Get("workspace_id"); got != "ws_new" {
				t.Fatalf("sessions workspace_id = %q", got)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"sessions": []gact.Session{{ID: "s_new", Title: "fresh"}}})
		default:
			w.Header().Set("Content-Type", "text/event-stream")
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer srv.Close()

	a := New(srv.URL)
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.workspaces = []gact.Workspace{{ID: "ws_old", Name: "old", RootPath: "/tmp/old"}}
	a.wsID = "ws_old"
	a.sessions = []gact.Session{{ID: "s_old", Title: "old"}}
	a.selected = 0
	a.messages = []gact.Message{{ID: "m_old"}}
	a.contextFiles = []gact.ContextFile{{Path: "old.txt"}}
	a.fileViewerRoot = "/tmp/old"
	a.openWorkspaceCreate()
	a.workspaceCreateName = "new"
	a.workspaceCreateNameCur = 3
	a.workspaceCreateRoot = "/tmp/new"
	a.workspaceCreateRootCur = len("/tmp/new")

	_, cmd := a.handleWorkspaceSwitchKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("create should dispatch command")
	}
	msg := cmd()
	createdMsg, ok := msg.(workspaceCreatedMsg)
	if !ok {
		t.Fatalf("cmd returned %T, want workspaceCreatedMsg", msg)
	}
	model, cmd := a.Update(createdMsg)
	a = model.(*App)
	if a.wsID != "ws_new" {
		t.Fatalf("wsID = %q, want ws_new", a.wsID)
	}
	if a.workspaceSwitchOpen || a.workspaceCreateOpen {
		t.Fatalf("create success should close modals, switch=%v create=%v", a.workspaceSwitchOpen, a.workspaceCreateOpen)
	}
	if len(a.sessions) != 0 || len(a.messages) != 0 || len(a.contextFiles) != 0 || a.selected != -1 {
		t.Fatalf("scoped state not cleared: sessions=%d messages=%d context=%d selected=%d", len(a.sessions), len(a.messages), len(a.contextFiles), a.selected)
	}
	if a.fileViewerRoot != "/tmp/new" {
		t.Fatalf("fileViewerRoot = %q, want /tmp/new", a.fileViewerRoot)
	}
	if cmd == nil {
		t.Fatal("create success should reload sessions for new workspace")
	}

	reloadMsg := cmd()
	switched, ok := reloadMsg.(workspaceSwitchedMsg)
	if !ok {
		t.Fatalf("reload cmd returned %T, want workspaceSwitchedMsg", reloadMsg)
	}
	if switched.wsID != "ws_new" || len(switched.sessions) != 1 {
		t.Fatalf("workspace switched msg = %+v", switched)
	}
}

func TestWorkspaceCreateFailureStaysOpenAndShowsError(t *testing.T) {
	a := makeSwitcherApp(t)
	a.openWorkspaceCreate()
	a.workspaceCreateSaving = true

	model, cmd := a.Update(workspaceCreatedMsg{err: &client.Error{
		Status:  400,
		Code:    "invalid_workspace_root",
		Message: "workspace root must be an absolute local path",
	}})
	a = model.(*App)

	if cmd != nil {
		t.Fatal("create failure should not dispatch follow-up command")
	}
	if !a.workspaceSwitchOpen || !a.workspaceCreateOpen {
		t.Fatalf("create failure should keep form open, switch=%v create=%v", a.workspaceSwitchOpen, a.workspaceCreateOpen)
	}
	if a.workspaceCreateSaving {
		t.Fatal("create failure should clear saving flag")
	}
	if !strings.Contains(a.workspaceCreateError, "workspace root must be an absolute local path") {
		t.Fatalf("workspaceCreateError = %q", a.workspaceCreateError)
	}
	if strings.Contains(a.workspaceCreateError, "gact:") || strings.Contains(a.workspaceCreateError, "invalid_workspace_root") {
		t.Fatalf("workspaceCreateError leaked backend wrapper: %q", a.workspaceCreateError)
	}
}

func TestWorkspaceCreateGitCloneFailureStaysOpenAndShowsOperatorError(t *testing.T) {
	a := makeSwitcherApp(t)
	a.openWorkspaceCreateMode("git")
	a.workspaceCreateSaving = true

	model, cmd := a.Update(workspaceCreatedMsg{err: workspaceCloneError{
		message: "fatal: repository 'https://example.invalid/missing.git/' not found",
	}})
	a = model.(*App)

	if cmd != nil {
		t.Fatal("clone failure should not dispatch follow-up command")
	}
	if !a.workspaceSwitchOpen || !a.workspaceCreateOpen {
		t.Fatalf("clone failure should keep git form open, switch=%v create=%v", a.workspaceSwitchOpen, a.workspaceCreateOpen)
	}
	if a.workspaceCreateSaving {
		t.Fatal("clone failure should clear saving flag")
	}
	if !strings.Contains(a.workspaceCreateError, "Git clone failed: fatal: repository") {
		t.Fatalf("workspaceCreateError = %q", a.workspaceCreateError)
	}
	if strings.Contains(a.workspaceCreateError, "exit status") {
		t.Fatalf("workspaceCreateError leaked process wrapper: %q", a.workspaceCreateError)
	}
}

func TestGitCloneFailureMessageFiltersWrapperNoise(t *testing.T) {
	msg := gitCloneFailureMessage(
		errors.New("exit status 128"),
		"Cloning into '/tmp/missing'...\nfatal: repository 'https://example.invalid/missing.git/' not found\n",
	)
	if msg != "fatal: repository 'https://example.invalid/missing.git/' not found" {
		t.Fatalf("clone failure message = %q", msg)
	}
}
