package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func TestCatalogBrowser_AgentBlueprintSourceDeleteRequiresConfirmation(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentBlueprintSources,
		title: "Marketplace sources",
		items: []catalogItem{
			{id: "source/src1", title: "▾ Data Semantics Agents"},
			{id: "source-blueprint/src1/seismic-waveform-review", title: "  Seismic Waveform Review"},
		},
	}

	model, cmd := a.catalog.handleKey(keyMsg("d"))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("first source remove press should schedule a confirmation hint")
	}
	if a.catalog.current.pendingDeleteSourceID != "src1" {
		t.Fatalf("pending source delete id = %q, want src1", a.catalog.current.pendingDeleteSourceID)
	}
	if !strings.Contains(a.transientHint, "confirm removing source src1") {
		t.Fatalf("transient hint = %q, want source confirmation", a.transientHint)
	}
	if hint := catalogBrowserHintText(a.catalog.current); !strings.Contains(hint, "confirm remove armed") || !strings.Contains(hint, "d confirm remove source") {
		t.Fatalf("armed source hint = %q", hint)
	}

	model, cmd = a.catalog.handleKey(keyMsg("d"))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("second source remove press should return delete command")
	}
	if a.catalog.current == nil || a.catalog.current.pendingDeleteSourceID != "" {
		t.Fatalf("confirmed source delete should keep browser open and clear pending id: %#v", a.catalog.current)
	}
}

func TestCatalogBrowser_AgentBlueprintSourceDeleteConfirmationCancelsOnChildSelection(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentBlueprintSources,
		title: "Marketplace sources",
		items: []catalogItem{
			{id: "source/src1", title: "▾ Data Semantics Agents"},
			{id: "source-blueprint/src1/seismic-waveform-review", title: "  Seismic Waveform Review"},
		},
	}

	_, _ = a.catalog.handleKey(keyMsg("d"))
	if a.catalog.current.pendingDeleteSourceID != "src1" {
		t.Fatalf("pending source delete id = %q, want src1", a.catalog.current.pendingDeleteSourceID)
	}
	model, cmd := a.catalog.handleKey(keyMsg("down"))
	a = model.(*App)
	if cmd != nil {
		t.Fatalf("down should only move selection/cancel confirmation, got command %#v", cmd)
	}
	if a.catalog.current.pendingDeleteSourceID != "" {
		t.Fatalf("pending source delete should clear after selecting child row, got %q", a.catalog.current.pendingDeleteSourceID)
	}
	if a.transientHint != "" {
		t.Fatalf("source delete confirmation hint should clear after selecting child row, got %q", a.transientHint)
	}
	if hint := catalogBrowserHintText(a.catalog.current); strings.Contains(hint, "confirm remove") || strings.Contains(hint, "d remove") {
		t.Fatalf("child blueprint row should not expose source removal after cancel, got %q", hint)
	}
}

func TestCatalogBrowser_AgentBlueprintSourceDeleteConfirmationCancelsOnWheelSelection(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentBlueprintSources,
		title: "Marketplace sources",
		items: []catalogItem{
			{id: "source/src1", title: "▾ Data Semantics Agents"},
			{id: "source-blueprint/src1/seismic-waveform-review", title: "  Seismic Waveform Review"},
		},
	}

	_, _ = a.catalog.handleKey(keyMsg("d"))
	if a.catalog.current.pendingDeleteSourceID != "src1" || a.transientHint == "" {
		t.Fatalf("source delete should be armed before wheel selection, pending=%q hint=%q", a.catalog.current.pendingDeleteSourceID, a.transientHint)
	}

	cmd := a.catalog.handleWheel(tea.MouseWheelDown)
	if cmd != nil {
		t.Fatalf("wheel should only move selection/cancel confirmation, got command %#v", cmd)
	}
	if a.catalog.current.sel != 1 {
		t.Fatalf("wheel should select child blueprint row, sel=%d", a.catalog.current.sel)
	}
	if a.catalog.current.pendingDeleteSourceID != "" || a.transientHint != "" {
		t.Fatalf("wheel selection should clear stale source confirmation, pending=%q hint=%q", a.catalog.current.pendingDeleteSourceID, a.transientHint)
	}
}

func TestCatalogBrowser_AgentBlueprintSourceActionsRenderForSelectedSource(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.Method+" "+r.URL.EscapedPath())
		switch {
		case r.Method == http.MethodPost && r.URL.EscapedPath() == "/v1/agent-blueprints/sources/src1/refresh":
			writeJSONForTest(t, w, map[string]any{"source": map[string]any{"id": "src1", "name": "Data Semantics Agents"}})
		case r.Method == http.MethodDelete && r.URL.EscapedPath() == "/v1/agent-blueprints/sources/src1":
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.EscapedPath())
		}
	}))
	defer server.Close()

	a := newReadyApp(nil, nil)
	a.c = client.New(server.URL)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentBlueprintSources,
		title: "Marketplace sources",
		items: []catalogItem{
			{id: "source/src1", title: "▾ Data Semantics Agents"},
			{id: "source-blueprint/src1/seismic-waveform-review", title: "  Seismic Waveform Review"},
		},
	}

	out := ansi.Strip(a.catalog.view())
	for _, want := range []string{"Source actions", "add source", "refresh source", "remove source", "Sources", "Data Semantics Agents"} {
		if !strings.Contains(out, want) {
			t.Fatalf("source browser missing %q:\n%s", want, out)
		}
	}

	buttons := a.agent.agentBlueprintSourceActionButtons()
	if len(buttons) != 3 || buttons[0].label != "add source" || buttons[1].label != "refresh source" || buttons[2].label != "remove source" {
		t.Fatalf("source action buttons = %#v", buttons)
	}
	if cmd := buttons[0].action(a); cmd != nil || !a.agentBlueprintManage.open || a.agentBlueprintManage.mode != agentBlueprintManageSource {
		t.Fatalf("add source action should open source modal, open=%v mode=%q cmd=%v", a.agentBlueprintManage.open, a.agentBlueprintManage.mode, cmd)
	}
	a.agentBlueprintManage.close()
	msg := buttons[1].action(a)()
	if got, ok := msg.(agentBlueprintSourceManagedMsg); !ok || got.sourceID != "src1" || got.action != "refreshed" || got.err != nil {
		t.Fatalf("refresh action msg = %#v", msg)
	}
	cmd := buttons[2].action(a)
	if cmd == nil || a.catalog.current.pendingDeleteSourceID != "src1" || !strings.Contains(a.transientHint, "confirm removing source src1") {
		t.Fatalf("remove should arm source confirmation, pending=%q hint=%q cmd=%v", a.catalog.current.pendingDeleteSourceID, a.transientHint, cmd)
	}
	buttons = a.agent.agentBlueprintSourceActionButtons()
	if len(buttons) != 3 || buttons[2].label != "confirm remove" {
		t.Fatalf("armed source action buttons = %#v", buttons)
	}
	msg = buttons[2].action(a)()
	if got, ok := msg.(agentBlueprintSourceManagedMsg); !ok || got.sourceID != "src1" || got.action != "deleted" || got.err != nil {
		t.Fatalf("delete action msg = %#v", msg)
	}
	if !slices.Contains(paths, "POST /v1/agent-blueprints/sources/src1/refresh") || !slices.Contains(paths, "DELETE /v1/agent-blueprints/sources/src1") {
		t.Fatalf("source action requests = %#v", paths)
	}
}

func TestCatalogBrowser_AgentBlueprintSourceAddKeySubmitsSource(t *testing.T) {
	var sourceBody gact.AgentBlueprintSourceRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.EscapedPath() == "/v1/agent-blueprints/sources":
			if err := json.NewDecoder(r.Body).Decode(&sourceBody); err != nil {
				t.Fatalf("decode source body: %v", err)
			}
			w.WriteHeader(http.StatusCreated)
			writeJSONForTest(t, w, map[string]any{"source": map[string]any{
				"id":          "ndp-demo-agents",
				"name":        "NDP Demo Agents",
				"source":      sourceBody.Source,
				"source_kind": "git",
				"status":      "ready",
			}})
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.EscapedPath())
		}
	}))
	defer server.Close()

	a := newReadyApp(nil, nil)
	a.c = client.New(server.URL)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentBlueprintSources,
		title: "Marketplace sources",
		items: []catalogItem{{id: "source/src1", title: "Data Semantics Agents"}},
	}

	_, cmd := a.catalog.handleKey(keyMsg("a"))
	if cmd != nil || !a.agentBlueprintManage.open || a.agentBlueprintManage.mode != agentBlueprintManageSource {
		t.Fatalf("a key should open add source modal, open=%v mode=%q cmd=%v", a.agentBlueprintManage.open, a.agentBlueprintManage.mode, cmd)
	}
	a.agentBlueprintManage.input.SetValue("https://github.com/iowarp/ndp-demo-agents.git")
	a.agentBlueprintManage.input.SetCursor(len([]rune(a.agentBlueprintManage.input.Value())))
	_, cmd = a.agentBlueprintManage.handleKey(keyMsg("enter"))
	if cmd == nil || !a.agentBlueprintManage.saving {
		t.Fatalf("enter should submit source add, saving=%v cmd=%v", a.agentBlueprintManage.saving, cmd)
	}
	msg := cmd()
	got, ok := msg.(agentBlueprintSourceManagedMsg)
	if !ok || got.err != nil || got.action != "added" || got.sourceID != "ndp-demo-agents" {
		t.Fatalf("source add msg = %#v", msg)
	}
	if sourceBody.Source != "https://github.com/iowarp/ndp-demo-agents.git" || !sourceBody.Refresh {
		t.Fatalf("source add body = %#v", sourceBody)
	}
}

func TestCatalogBrowser_AgentBlueprintSourceActionsRenderForSelectedBlueprint(t *testing.T) {
	var installBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.EscapedPath() == "/v1/agent-blueprints/install":
			if err := json.NewDecoder(r.Body).Decode(&installBody); err != nil {
				t.Fatalf("decode install body: %v", err)
			}
			writeJSONForTest(t, w, map[string]any{"status": "installed"})
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.EscapedPath())
		}
	}))
	defer server.Close()

	a := newReadyApp(nil, nil)
	a.c = client.New(server.URL)
	a.session.wsID = "ws1"
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentBlueprintSources,
		title: "Marketplace sources",
		sel:   1,
		items: []catalogItem{
			{id: "source/src1", title: "▾ Data Semantics Agents"},
			{id: "source-blueprint/src1/seismic-waveform-review", title: "  Seismic Waveform Review"},
		},
	}

	out := ansi.Strip(a.catalog.view())
	for _, want := range []string{"Blueprint actions", "install blueprint", "refresh source", "Sources", "Seismic Waveform Review"} {
		if !strings.Contains(out, want) {
			t.Fatalf("source blueprint browser missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "Source actions") {
		t.Fatalf("selected blueprint row should not label install controls as source actions:\n%s", out)
	}
	if got := catalogBrowserHintText(a.catalog.current); !strings.Contains(got, "Enter install selected blueprint") || strings.Contains(got, "source details") {
		t.Fatalf("selected blueprint row hint = %q", got)
	}
	buttons := a.agent.agentBlueprintSourceActionButtons()
	if len(buttons) != 3 || buttons[0].label != "add source" || buttons[1].label != "install blueprint" || buttons[2].label != "refresh source" {
		t.Fatalf("source blueprint action buttons = %#v", buttons)
	}
	msg := buttons[1].action(a)()
	if got, ok := msg.(agentBlueprintManagedMsg); !ok || got.blueprintID != "seismic-waveform-review" || got.action != "installed" || got.err != nil {
		t.Fatalf("install action msg = %#v", msg)
	}
	for key, want := range map[string]string{
		"source_id":    "src1",
		"blueprint_id": "seismic-waveform-review",
		"scope":        "workspace",
		"workspace_id": "ws1",
	} {
		if got := valuefmt.StringValue(installBody[key]); got != want {
			t.Fatalf("install body %s = %q, want %q; body=%#v", key, got, want, installBody)
		}
	}
}
