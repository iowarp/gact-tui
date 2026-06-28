package ui

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestAgentBlueprintManagedMsgSurfacesFailuresTruthfully(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Data",
		blueprintID: "bp1",
		items:       []catalogItem{{id: "blueprint-action/update", title: "Update"}},
	}

	model, cmd := a.Update(agentBlueprintManagedMsg{
		blueprintID: "bp1",
		action:      "updated",
		err:         errors.New("git fetch exited 128"),
	})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("failed blueprint management should schedule transient hint expiry")
	}
	if !a.catalog.open || a.catalog.current == nil || a.catalog.current.blueprintID != "bp1" {
		t.Fatalf("failed update should leave detail browser open for inspection: open=%v browser=%+v", a.catalog.open, a.catalog.current)
	}
	if got := a.transientHint; got != "agent blueprint update failed: git fetch exited 128" {
		t.Fatalf("failure hint = %q", got)
	}
}

func TestAgentBlueprintManagedMsgNormalizesClientFailures(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Broken",
		blueprintID: "broken-blueprint",
		items:       []catalogItem{{id: "blueprint-action/update", title: "Update"}},
	}

	model, _ := a.Update(agentBlueprintManagedMsg{
		blueprintID: "broken-blueprint",
		action:      "updated",
		err: &client.Error{
			Status:  409,
			Code:    "update_failed",
			Message: "agent blueprint update failed: validation errors must be fixed first",
		},
	})
	a = model.(*App)
	if got := a.transientHint; got != "agent blueprint update failed: validation errors must be fixed first" {
		t.Fatalf("failure hint = %q", got)
	}
	if strings.Contains(a.transientHint, "update_failed") || strings.Contains(a.transientHint, "gact:") {
		t.Fatalf("failure hint leaked backend wrapper: %q", a.transientHint)
	}
}

func TestAgentBlueprintSourceManagedMsgNormalizesClientFailures(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentBlueprintSources,
		title: "Marketplace sources",
		items: []catalogItem{{id: "source/data-semantics-agents", title: "Data Semantics Agents"}},
	}

	model, _ := a.Update(agentBlueprintSourceManagedMsg{
		sourceID: "data-semantics-agents",
		action:   "refreshed",
		err: &client.Error{
			Status:  503,
			Code:    "source_refresh_failed",
			Message: "marketplace source refresh failed: unable to fetch remote refs",
		},
	})
	a = model.(*App)
	if got := a.transientHint; got != "marketplace source refresh failed: unable to fetch remote refs" {
		t.Fatalf("failure hint = %q", got)
	}
	if strings.Contains(a.transientHint, "source_refresh_failed") || strings.Contains(a.transientHint, "gact:") {
		t.Fatalf("failure hint leaked backend wrapper: %q", a.transientHint)
	}
}

func TestAgentBlueprintManageDoneMsgNormalizesClientFailures(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.agentBlueprintManage.openModal(agentBlueprintManageInstall)
	a.agentBlueprintManage.saving = true

	model, cmd := a.Update(agentBlueprintManageDoneMsg{
		action: agentBlueprintManageInstall,
		source: "install-fail",
		err: &client.Error{
			Status:  502,
			Code:    "install_failed",
			Message: "agent blueprint install failed: source archive is missing AGENT.md",
		},
	})
	a = model.(*App)
	if cmd != nil {
		t.Fatal("failed install should not dispatch follow-up command")
	}
	if !a.agentBlueprintManage.open || a.agentBlueprintManage.saving {
		t.Fatalf("failed install should keep modal open and clear saving: open=%v saving=%v", a.agentBlueprintManage.open, a.agentBlueprintManage.saving)
	}
	if got := a.agentBlueprintManage.err; got != "agent blueprint install failed: source archive is missing AGENT.md" {
		t.Fatalf("manage error = %q", got)
	}
	if strings.Contains(a.agentBlueprintManage.err, "install_failed") || strings.Contains(a.agentBlueprintManage.err, "gact:") {
		t.Fatalf("manage error leaked backend wrapper: %q", a.agentBlueprintManage.err)
	}
}

func TestAgentBlueprintManagedMsgReloadsCurrentDetailOnSuccess(t *testing.T) {
	var gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.Method + " " + r.URL.EscapedPath()
		writeJSONForTest(t, w, gact.AgentBlueprintDetail{
			AgentBlueprint: gact.AgentBlueprintDefinition{ID: "bp1", Title: "Blueprint One", Scope: "workspace"},
		})
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
		items:       []catalogItem{{id: "blueprint-action/update", title: "Update"}},
	}

	model, cmd := a.Update(agentBlueprintManagedMsg{
		blueprintID: "bp1",
		action:      "updated",
		result:      map[string]any{"status": "updated"},
	})
	a = model.(*App)
	if got := a.transientHint; got != "agent blueprint updated: bp1" {
		t.Fatalf("success hint = %q", got)
	}
	if cmd == nil {
		t.Fatal("successful detail update should reload the current blueprint detail")
	}
	msg := cmd()
	if batch, ok := msg.(tea.BatchMsg); ok {
		for _, c := range batch {
			if c == nil {
				continue
			}
			if loaded, ok := c().(catalogBrowserLoadedMsg); ok {
				msg = loaded
				break
			}
		}
	}
	loaded, ok := msg.(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("reload cmd returned %T, want catalogBrowserLoadedMsg", msg)
	}
	if loaded.errText != "" || loaded.blueprintID != "bp1" || len(loaded.items) == 0 {
		t.Fatalf("loaded detail = %#v", loaded)
	}
	if gotPath != "GET /v1/agent-blueprints/bp1" {
		t.Fatalf("reload path = %q", gotPath)
	}
}
