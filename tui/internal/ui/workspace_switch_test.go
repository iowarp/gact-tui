package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
	a.workspaces = []gact.Workspace{
		{ID: "ws_a", Name: "alpha"},
		{ID: "ws_b", Name: "bravo"},
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

func TestWorkspaceSwitcher_EmptyWorkspacesShowsToastNotModal(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspaces = nil
	a.handleKey(tea.KeyPressMsg{Code: 'w', Mod: tea.ModCtrl})
	if a.workspaceSwitchOpen {
		t.Error("should not open the modal when there are no workspaces")
	}
	if a.transientHint == "" {
		t.Error("expected a toast explaining why nothing opened")
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
	if wantY := rect.y + 2 + 2; target.rect.y != wantY {
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
		"▌ alpha  ws_a",
		"[current]",
		"bravo  ws_b",
		"Enter switch",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("workspace switcher missing %q:\n%s", want, out)
		}
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
	if !strings.Contains(out, "workspace 18  ws_18") {
		t.Fatalf("selected workspace should remain visible in bounded window:\n%s", out)
	}
	if strings.Contains(out, "workspace 00  ws_00") {
		t.Fatalf("bounded window should not render every workspace:\n%s", out)
	}
	if !strings.Contains(out, "↑ ") {
		t.Fatalf("bounded window should show rows above indicator:\n%s", out)
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
