package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

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
	a.session.workspaces = []gact.Workspace{
		{ID: "ws_a", Name: "alpha", RootPath: "/tmp/alpha"},
		{ID: "ws_b", Name: "bravo", RootPath: "/tmp/bravo"},
	}
	a.session.wsID = "ws_a"
	a.workspace.switchOpen = true
	a.workspace.switchSel = 1

	_, cmd := a.workspace.handleKey(tea.KeyPressMsg{Code: 'd', Text: "d"})
	if cmd != nil {
		t.Fatal("first delete press should arm confirmation only")
	}
	if a.workspace.deleteID != "ws_b" {
		t.Fatalf("workspaceDeleteID = %q, want ws_b", a.workspace.deleteID)
	}
	_, cmd = a.workspace.handleKey(tea.KeyPressMsg{Code: 'd', Text: "d"})
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
	if len(a.session.workspaces) != 1 || a.session.workspaces[0].ID != "ws_a" {
		t.Fatalf("workspaces after delete = %#v", a.session.workspaces)
	}
}

func TestWorkspaceSwitcher_DeleteCurrentWorkspaceIsBlocked(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.switchOpen = true
	a.workspace.switchSel = 0

	_, cmd := a.workspace.handleKey(tea.KeyPressMsg{Code: 'd', Text: "d"})
	if cmd != nil {
		t.Fatal("delete current workspace should not dispatch")
	}
	if !strings.Contains(a.workspace.deleteError, "switch to another workspace") {
		t.Fatalf("workspaceDeleteError = %q", a.workspace.deleteError)
	}
}

func TestWorkspaceSwitcher_DeleteFailureStaysOpenAndShowsOperatorError(t *testing.T) {
	a := makeSwitcherApp(t)
	a.workspace.switchOpen = true
	a.workspace.switchSel = 1
	a.workspace.deleteID = "ws_b"
	a.workspace.deleteSaving = true

	model, cmd := a.Update(workspaceDeletedMsg{workspaceID: "ws_b", err: &client.Error{
		Status:  409,
		Code:    "workspace_remove_failed",
		Message: "workspace is pinned by an active benchmark profile",
	}})
	a = model.(*App)

	if cmd != nil {
		t.Fatal("delete failure should not dispatch follow-up command")
	}
	if !a.workspace.switchOpen {
		t.Fatal("delete failure should keep workspace switcher open")
	}
	if a.workspace.deleteSaving {
		t.Fatal("delete failure should clear saving flag")
	}
	if len(a.session.workspaces) != 2 || a.session.workspaces[1].ID != "ws_b" {
		t.Fatalf("delete failure should keep workspace row, got %#v", a.session.workspaces)
	}
	if !strings.Contains(a.workspace.deleteError, "workspace is pinned by an active benchmark profile") {
		t.Fatalf("workspaceDeleteError = %q", a.workspace.deleteError)
	}
	if strings.Contains(a.workspace.deleteError, "gact:") || strings.Contains(a.workspace.deleteError, "workspace_remove_failed") {
		t.Fatalf("workspaceDeleteError leaked backend wrapper: %q", a.workspace.deleteError)
	}
}
