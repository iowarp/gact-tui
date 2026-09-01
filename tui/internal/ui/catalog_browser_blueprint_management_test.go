package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestCatalogBrowser_EnterOnAgentBlueprintHookEnablesPackagedHook(t *testing.T) {
	var gotPath string
	var gotReq gact.AgentBlueprintHookEnableRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.Method + " " + r.URL.EscapedPath()
		if err := json.NewDecoder(r.Body).Decode(&gotReq); err != nil {
			t.Fatalf("decode hook enable request: %v", err)
		}
		writeJSONForTest(t, w, map[string]any{"id": "agent_blueprint_hook_bp1_pre_message"})
	}))
	defer server.Close()

	a := newReadyApp(nil, nil)
	a.c = client.New(server.URL)
	a.session.wsID = "ws1"
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Data",
		blueprintID: "bp1",
		items:       []catalogItem{{id: "hook/pre_message", title: "Hook · Pre Message"}},
	}

	_, cmd := a.catalog.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("enter on blueprint hook row should enable packaged hook")
	}
	msg := cmd()
	got, ok := msg.(agentBlueprintHookEnabledMsg)
	if !ok {
		t.Fatalf("cmd msg = %T, want agentBlueprintHookEnabledMsg", msg)
	}
	if got.err != nil {
		t.Fatalf("enable hook command failed: %v", got.err)
	}
	if gotPath != "POST /v1/agent-blueprints/bp1/hooks/pre_message/enable" {
		t.Fatalf("hook enable path = %q", gotPath)
	}
	if gotReq.WorkspaceID != "ws1" || !gotReq.Trust {
		t.Fatalf("hook enable request = %#v, want workspace and explicit trust", gotReq)
	}
}

func TestCatalogBrowser_AgentBlueprintDeleteRequiresConfirmation(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Seismic",
		blueprintID: "seismic",
		items: []catalogItem{
			{id: "activate", title: "Activate for current session"},
			{id: "blueprint/seismic", title: "Blueprint · Seismic"},
			{id: "blueprint-action/update", title: "Update installed blueprint"},
			{id: "blueprint-action/delete", title: "Delete installed blueprint"},
			{id: "agent/main", title: "Agent · Main"},
		},
	}

	cmd := a.catalog.runItemAction("blueprint-action/delete")
	if cmd == nil {
		t.Fatal("first delete press should schedule a confirmation hint")
	}
	if !a.catalog.open || a.catalog.current == nil {
		t.Fatal("first delete press should keep blueprint detail open")
	}
	if a.catalog.current.pendingDeleteBlueprintID != "seismic" {
		t.Fatalf("pending delete id = %q, want seismic", a.catalog.current.pendingDeleteBlueprintID)
	}
	if !strings.Contains(a.transientHint, "confirm deleting seismic") {
		t.Fatalf("transient hint = %q, want confirm deleting seismic", a.transientHint)
	}
	out := stripANSI(a.catalog.view())
	if !strings.Contains(out, "confirm delete") {
		t.Fatalf("armed delete should change the action/hint text:\n%s", out)
	}

	cmd = a.catalog.runItemAction("blueprint-action/delete")
	if cmd == nil {
		t.Fatal("second delete press should return the delete command")
	}
	if !a.catalog.open || a.catalog.current == nil {
		t.Fatalf("confirmed delete should keep detail open until result: open=%v browser=%+v", a.catalog.open, a.catalog.current)
	}

	model, follow := a.Update(agentBlueprintManagedMsg{blueprintID: "seismic", action: "deleted"})
	a = model.(*App)
	if follow == nil {
		t.Fatal("successful delete should schedule hint expiry")
	}
	if a.catalog.open || a.catalog.current != nil {
		t.Fatalf("successful delete result should close blueprint detail: open=%v browser=%+v", a.catalog.open, a.catalog.current)
	}
}

func TestCatalogBrowser_AgentBlueprintDeleteFailureKeepsDetailOpen(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Broken",
		blueprintID: "broken-blueprint",
		items: []catalogItem{
			{id: "blueprint/broken-blueprint", title: "Blueprint · Broken"},
			{id: "blueprint-action/delete", title: "Delete installed blueprint"},
		},
	}

	model, cmd := a.Update(agentBlueprintManagedMsg{
		blueprintID: "broken-blueprint",
		action:      "deleted",
		err: &client.Error{
			Status:  409,
			Code:    "delete_failed",
			Message: "agent blueprint delete failed: workspace policy is locking this blueprint",
		},
	})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("failed delete should schedule hint expiry")
	}
	if !a.catalog.open || a.catalog.current == nil || a.catalog.current.blueprintID != "broken-blueprint" {
		t.Fatalf("failed delete should leave detail open: open=%v browser=%+v", a.catalog.open, a.catalog.current)
	}
	if got := a.transientHint; got != "agent blueprint delete failed: workspace policy is locking this blueprint" {
		t.Fatalf("failure hint = %q", got)
	}
	if strings.Contains(a.transientHint, "delete_failed") || strings.Contains(a.transientHint, "gact:") {
		t.Fatalf("failure hint leaked backend wrapper: %q", a.transientHint)
	}
}

func TestCatalogBrowser_AgentBlueprintDeleteConfirmationCancelsOnOtherKey(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Seismic",
		blueprintID: "seismic",
		items: []catalogItem{
			{id: "activate", title: "Activate for current session"},
			{id: "blueprint/seismic", title: "Blueprint · Seismic"},
			{id: "blueprint-action/update", title: "Update installed blueprint"},
			{id: "blueprint-action/delete", title: "Delete installed blueprint"},
			{id: "agent/main", title: "Agent · Main"},
		},
	}

	_ = a.catalog.runItemAction("blueprint-action/delete")
	if a.catalog.current.pendingDeleteBlueprintID != "seismic" {
		t.Fatalf("pending delete id = %q, want seismic", a.catalog.current.pendingDeleteBlueprintID)
	}
	model, cmd := a.catalog.handleKey(keyMsg("down"))
	a = model.(*App)
	if cmd != nil {
		t.Fatalf("down should only move selection/cancel confirmation, got command %#v", cmd)
	}
	if a.catalog.current.pendingDeleteBlueprintID != "" {
		t.Fatalf("pending delete should clear after navigation, got %q", a.catalog.current.pendingDeleteBlueprintID)
	}
	out := stripANSI(a.catalog.view())
	if strings.Contains(out, "confirm delete") {
		t.Fatalf("cancelled delete should not keep confirm action visible:\n%s", out)
	}
}

func TestCatalogBrowser_AgentBlueprintDetailUpdateShortcutDispatchesAction(t *testing.T) {
	called := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.EscapedPath() == "/v1/agent-blueprints/bp1/update" {
			called = true
			writeJSONForTest(t, w, map[string]any{"status": "updated"})
			return
		}
		t.Fatalf("unexpected request: %s %s", r.Method, r.URL.EscapedPath())
	}))
	defer server.Close()

	a := newReadyApp(nil, nil)
	a.c = client.New(server.URL)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Data",
		blueprintID: "bp1",
		items: []catalogItem{
			{id: "blueprint-action/update", title: "Update installed blueprint"},
			{id: "blueprint/bp1", title: "Blueprint · Data"},
		},
	}

	_, cmd := a.catalog.handleKey(tea.KeyPressMsg{Code: 'u', Text: "u"})
	if cmd == nil {
		t.Fatal("update shortcut did not dispatch command")
	}
	msg := cmd()
	if _, ok := msg.(agentBlueprintManagedMsg); !ok {
		t.Fatalf("update shortcut msg = %T, want agentBlueprintManagedMsg", msg)
	}
	if !called {
		t.Fatal("update shortcut did not call backend")
	}
}
