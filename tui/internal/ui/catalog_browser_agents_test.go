package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestCatalogBrowser_EnterOnAgentDrillsIntoDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	parent := &catalogBrowserState{
		kind:  catalogKindAgents,
		title: "Experts",
		items: []catalogItem{{id: "analysis", title: "Analysis expert"}},
	}
	a.catalog.open = true
	a.catalog.current = parent

	_, cmd := a.catalog.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if a.catalog.current == parent {
		t.Fatal("enter on agent row did not replace browser with detail state")
	}
	if a.catalog.current.kind != catalogKindAgentDetail {
		t.Fatalf("browser kind = %v, want catalogKindAgentDetail", a.catalog.current.kind)
	}
	if a.catalog.current.agentID != "analysis" {
		t.Fatalf("agentID = %q, want analysis", a.catalog.current.agentID)
	}
	if a.catalog.current.parent != parent {
		t.Fatal("detail browser did not retain parent for back navigation")
	}
	if cmd == nil {
		t.Fatal("expected detail load command")
	}
}

func TestCatalogBrowser_OOnAgentSetsOneTurnOverride(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgents,
		title: "Experts",
		items: []catalogItem{{id: "analysis", title: "Analysis expert"}},
	}

	_, _ = a.catalog.handleKey(tea.KeyPressMsg{Code: 'o', Text: "o"})

	if a.agent.nextTurnAgentID != "analysis" {
		t.Fatalf("nextTurnAgentID = %q, want analysis", a.agent.nextTurnAgentID)
	}
	if a.catalog.open {
		t.Fatal("agent one-turn selection should close the catalog")
	}
	if !strings.Contains(a.transientHint, "Analysis expert") {
		t.Fatalf("transient hint should name selected agent, got %q", a.transientHint)
	}
}

func TestCatalogBrowser_AgentActionsOpenWriteModals(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.caps.Capabilities.AgentWrite = true
	a.session.caps.Capabilities.SkillsExtraction = true
	a.session.sessions = []gact.Session{{ID: "sess_demo", Title: "demo"}}
	a.session.selected = 0
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgents,
		title: "Experts",
		items: []catalogItem{{id: "analysis", title: "Analysis expert"}},
	}

	_, _ = a.catalog.handleKey(tea.KeyPressMsg{Code: 'c', Text: "c"})
	if !a.agentWrite.open || a.agentWrite.mode != agentWriteModeCreate {
		t.Fatalf("create shortcut should open create modal, open=%v mode=%q", a.agentWrite.open, a.agentWrite.mode)
	}

	a.agentWrite.close()
	_, _ = a.catalog.handleKey(tea.KeyPressMsg{Code: 'x', Text: "x"})
	if !a.agentWrite.open || a.agentWrite.mode != agentWriteModeExtract || !strings.Contains(a.agentWrite.input.Value(), "demo") {
		t.Fatalf("extract shortcut should open extract modal with session-derived id, open=%v mode=%q draft=%q", a.agentWrite.open, a.agentWrite.mode, a.agentWrite.input.Value())
	}
}

func TestCatalogBrowser_AgentCatalogRendersHierarchyFirst(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgents,
		title: "Experts",
		items: []catalogItem{{id: "analysis", title: "Analysis expert", desc: "reviews results"}},
	}

	out := a.catalog.view()
	for _, want := range []string{"Expert hierarchy", "Analysis expert", "c create expert", "x extract expert", "o set next turn"} {
		if !strings.Contains(out, want) {
			t.Fatalf("agent catalog missing %q:\n%s", want, out)
		}
	}
	for _, notWant := range []string{"Expert actions", "button:agents:create", "button:agents:extract", "create expert  extract expert from session"} {
		if strings.Contains(out, notWant) {
			t.Fatalf("agent catalog should not render management actions as list content %q:\n%s", notWant, out)
		}
	}
}

func TestCatalogBrowser_AgentDetailCloneActionOpensWriteModal(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.caps.Capabilities.AgentWrite = true
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:    catalogKindAgentDetail,
		title:   "Agent · Data",
		agentID: "data",
		items:   []catalogItem{{id: "agent/data", title: "Expert · Data expert", statusTag: "expert_pack"}},
	}

	_ = a.catalog.runItemAction("agent-action/clone")

	if !a.agentWrite.open || a.agentWrite.mode != agentWriteModeClone || a.agentWrite.sourceID != "data" {
		t.Fatalf("clone action should open clone modal, open=%v mode=%q source=%q", a.agentWrite.open, a.agentWrite.mode, a.agentWrite.sourceID)
	}
}

func TestCatalogBrowser_AgentDetailCloneShortcutOpensWriteModal(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.caps.Capabilities.AgentWrite = true
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:    catalogKindAgentDetail,
		title:   "Agent · Data",
		agentID: "data",
		items: []catalogItem{
			{id: "agent/data", title: "Expert · Data expert", statusTag: "expert_pack"},
		},
	}

	_, _ = a.catalog.handleKey(tea.KeyPressMsg{Code: 'c', Text: "c"})

	if !a.agentWrite.open || a.agentWrite.mode != agentWriteModeClone || a.agentWrite.sourceID != "data" {
		t.Fatalf("clone shortcut should open clone modal, open=%v mode=%q source=%q", a.agentWrite.open, a.agentWrite.mode, a.agentWrite.sourceID)
	}
}

func TestCatalogBrowser_AgentDetailActionsRenderOutsideStructureRows(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.caps.Capabilities.AgentWrite = true
	a.width = 120
	a.height = 40
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:    catalogKindAgentDetail,
		title:   "Agent · Data",
		agentID: "data",
		items: []catalogItem{
			{id: "agent/data", title: "Expert · Data expert", desc: "orchestrates data work", statusTag: "user"},
			{id: "tool/earthscope", title: "Tool · earthscope"},
		},
	}

	out := a.catalog.view()
	for _, want := range []string{"Expert actions", "clone", "edit", "delete", "Expert structure", "Expert · Data expert", "Tool · earthscope"} {
		if !strings.Contains(out, want) {
			t.Fatalf("agent detail missing %q:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{"Clone expert", "Edit expert", "Delete expert"} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("agent action leaked into structure rows as %q:\n%s", unwanted, out)
		}
	}
}

func TestCatalogBrowser_AgentDeleteRequiresConfirmation(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.caps.Capabilities.AgentWrite = true
	a.width = 120
	a.height = 40
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:    catalogKindAgentDetail,
		title:   "Agent · Data",
		agentID: "data",
		items: []catalogItem{
			{id: "agent/data", title: "Expert · Data expert", statusTag: "user"},
		},
	}

	cmd := a.catalog.runItemAction("agent-action/delete")
	if cmd == nil {
		t.Fatal("first delete press should schedule a confirmation hint")
	}
	if !a.catalog.open || a.catalog.current == nil {
		t.Fatal("first delete press should keep agent detail open")
	}
	if a.catalog.current.pendingDeleteAgentID != "data" {
		t.Fatalf("pending delete id = %q, want data", a.catalog.current.pendingDeleteAgentID)
	}
	if !strings.Contains(a.transientHint, "confirm deleting data") {
		t.Fatalf("transient hint = %q, want confirm deleting data", a.transientHint)
	}
	out := stripANSI(a.catalog.view())
	if !strings.Contains(out, "confirm delete") {
		t.Fatalf("armed delete should change the action/hint text:\n%s", out)
	}

	cmd = a.catalog.runItemAction("agent-action/delete")
	if cmd == nil {
		t.Fatal("second delete press should return the delete command")
	}
	if a.catalog.open || a.catalog.current != nil {
		t.Fatalf("confirmed delete should close agent detail: open=%v browser=%+v", a.catalog.open, a.catalog.current)
	}
}

func TestCatalogBrowser_AgentDeleteConfirmationCancelsOnOtherKey(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.caps.Capabilities.AgentWrite = true
	a.width = 120
	a.height = 40
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:    catalogKindAgentDetail,
		title:   "Agent · Data",
		agentID: "data",
		items: []catalogItem{
			{id: "agent/data", title: "Expert · Data expert", statusTag: "user"},
		},
	}

	_ = a.catalog.runItemAction("agent-action/delete")
	if a.catalog.current.pendingDeleteAgentID != "data" {
		t.Fatalf("pending delete id = %q, want data", a.catalog.current.pendingDeleteAgentID)
	}
	model, cmd := a.catalog.handleKey(keyMsg("down"))
	a = model.(*App)
	if cmd != nil {
		t.Fatalf("down should only move selection/cancel confirmation, got command %#v", cmd)
	}
	if a.catalog.current.pendingDeleteAgentID != "" {
		t.Fatalf("pending delete should clear after navigation, got %q", a.catalog.current.pendingDeleteAgentID)
	}
	out := stripANSI(a.catalog.view())
	if strings.Contains(out, "confirm delete") {
		t.Fatalf("cancelled delete should not keep confirm action visible:\n%s", out)
	}
}

func TestAgentEditModalUpdatesStructuredFields(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.agentEdit.openModal(gact.AgentDef{
		ID: "user-agent", Source: "user", Title: "User Agent", Description: "old",
		Tools: []string{"read_file"}, Keywords: []string{"old"}, Enabled: true,
	})

	a.agentEdit.setField(1)
	a.agentEdit.draft.Description = ""
	a.agentEdit.cursor = 0
	a.agentEdit.insert("new description")
	if a.agentEdit.draft.Description != "new description" {
		t.Fatalf("description = %q", a.agentEdit.draft.Description)
	}

	a.agentEdit.setField(3)
	a.agentEdit.draft.Tools = nil
	a.agentEdit.insert("read_file, mcp.parquet.read")
	if got := strings.Join(a.agentEdit.draft.Tools, ","); got != "read_file,mcp.parquet.read" {
		t.Fatalf("tools = %q", got)
	}
	a.agentEdit.setField(5)
	_, _ = a.agentEdit.handleKey(keyMsg("left"))
	if a.agentEdit.draft.Enabled {
		t.Fatal("enabled toggle did not flip")
	}
}

func TestAgentWriteSanitizesIDs(t *testing.T) {
	if got := sanitizeAgentID("  Data Expert Copy!  "); got != "data-expert-copy" {
		t.Fatalf("sanitizeAgentID = %q", got)
	}
	if got := titleFromAgentID("data-expert.copy"); got != "Data Expert Copy" {
		t.Fatalf("titleFromAgentID = %q", got)
	}
}

func TestAgentWritePasteCompactsMultilineID(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.agentWrite.openModal(agentWriteModeCreate, "", "")

	_, _ = a.Update(tea.PasteMsg{Content: " Data\r\nExpert \nCopy! "})

	if a.agentWrite.input.Value() != "Data Expert Copy!" {
		t.Fatalf("agent write draft = %q, want compact single-line paste", a.agentWrite.input.Value())
	}
	if a.agentWrite.input.Cursor() != len([]rune(a.agentWrite.input.Value())) {
		t.Fatalf("agent write cursor = %d, want end of draft %d", a.agentWrite.input.Cursor(), len([]rune(a.agentWrite.input.Value())))
	}
	if strings.ContainsAny(a.agentWrite.input.Value(), "\r\n") {
		t.Fatalf("agent write paste kept raw newlines: %q", a.agentWrite.input.Value())
	}
}

func TestLoadAgentsCatalogIncludesChildAgents(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/agents" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"agents": [
				{"id":"data","source":"builtin","title":"Data expert","tier":2},
				{"id":"ndp_catalog","source":"builtin","title":"NDP catalog","tier":3,"specialization":"data_analysis","metadata":{"parent":"data"}},
				{"id":"tui-test","source":"skill","title":"TUI Test","tier":3}
			]
		}`))
	}))
	defer server.Close()

	msg := loadCatalogBrowserCmd(client.New(server.URL), catalogKindAgents, client.RuntimeScope{})()
	loaded, ok := msg.(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("message type = %T, want catalogBrowserLoadedMsg", msg)
	}
	if loaded.errText != "" {
		t.Fatalf("unexpected catalog load error: %s", loaded.errText)
	}

	ids := map[string]bool{}
	var childDesc, childInline string
	for _, item := range loaded.items {
		if strings.HasPrefix(item.id, "action/") {
			t.Fatalf("agents catalog should not mix management actions into agent rows: %#v", loaded.items)
		}
		ids[item.id] = true
		if item.id == "ndp_catalog" {
			childDesc = item.desc
			childInline = item.inlineDesc
		}
	}
	if !ids["data"] || !ids["ndp_catalog"] {
		t.Fatalf("agents catalog should include parent and child agents, got %#v", loaded.items)
	}
	if ids["tui-test"] {
		t.Fatalf("agents catalog should exclude skills, got %#v", loaded.items)
	}
	if !strings.Contains(childDesc, "reports to Data expert") {
		t.Fatalf("child agent row should expose parent relationship, got %q", childDesc)
	}
	if !strings.Contains(childInline, "reports to Data expert") {
		t.Fatalf("child agent inline summary should expose parent in operator wording, got %q", childInline)
	}
	if !strings.Contains(childInline, "data analysis") || strings.Contains(childInline, "data_analysis") {
		t.Fatalf("child agent inline summary should humanize specialization, got %q", childInline)
	}
	if strings.Contains(childInline, "can use:") || strings.Contains(childInline, "model:") {
		t.Fatalf("child agent inline summary should stay compact, got %q", childInline)
	}
}
