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

func writeJSONForTest(t *testing.T, w http.ResponseWriter, v any) {
	t.Helper()
	if err := json.NewEncoder(w).Encode(v); err != nil {
		t.Fatalf("encode JSON: %v", err)
	}
}

// TestToggleToolDisabled_persists toggles a tool id and verifies the
// disabled set updates + SaveConfig fires.
func TestToggleToolDisabled_persists(t *testing.T) {
	a := newReadyApp(nil, nil)
	saves := 0
	a.SaveConfig = func() error { saves++; return nil }

	a.toggleToolDisabled("bash")
	if !a.disabledTools["bash"] {
		t.Errorf("expected bash disabled after first toggle")
	}
	if saves != 1 {
		t.Errorf("expected 1 SaveConfig call, got %d", saves)
	}
	a.toggleToolDisabled("bash")
	if a.disabledTools["bash"] {
		t.Errorf("expected bash re-enabled after second toggle")
	}
	if saves != 2 {
		t.Errorf("expected 2 SaveConfig calls, got %d", saves)
	}
}

// TestSetGetDisabledTools_roundTrip seeds + reads back the disabled
// set, expecting a sorted slice (config diffs need stable order).
func TestSetGetDisabledTools_roundTrip(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.SetDisabledTools([]string{"web_search", "bash", "edit_file"})
	got := a.GetDisabledTools()
	want := []string{"bash", "edit_file", "web_search"}
	if len(got) != len(want) {
		t.Fatalf("len mismatch: got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("idx %d: got %q, want %q", i, got[i], want[i])
		}
	}
}

// TestCatalogBrowser_SpaceTogglesTool: pressing Space on a tools
// catalog row toggles its disabled state via the modal key handler.
func TestCatalogBrowser_SpaceTogglesTool(t *testing.T) {
	a := newReadyApp(nil, nil)
	saves := 0
	a.SaveConfig = func() error { saves++; return nil }
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{{id: "bash", title: "bash", desc: "shell"}},
		sel:   0,
	}
	_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: ' ', Text: " "})
	if !a.disabledTools["bash"] {
		t.Errorf("space did not disable bash; disabledTools=%v", a.disabledTools)
	}
	if saves != 1 {
		t.Errorf("expected 1 save after toggle, got %d", saves)
	}
}

// TestCatalogBrowser_EscPopsMcpDetail: when a parent state is set,
// esc returns to the parent rather than closing the modal.
func TestCatalogBrowser_EscPopsMcpDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	parent := &catalogBrowserState{kind: catalogKindMcp, title: "MCP servers"}
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · fake",
		mcpServerID: "fake",
		parent:      parent,
	}
	_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEscape})
	if !a.catalogBrowserOpen {
		t.Errorf("esc closed the modal; should have popped to parent")
	}
	if a.catalogBrowser != parent {
		t.Errorf("esc did not restore parent state")
	}
}

// TestCatalogBrowserTitle_AgentsAndDetail: new kinds get titles.
func TestCatalogBrowserTitle_AgentsAndDetail(t *testing.T) {
	cases := map[catalogBrowserKind]string{
		catalogKindMcp:         "MCP servers",
		catalogKindTools:       "Tools (built-in + MCP)",
		catalogKindSkills:      "Skills",
		catalogKindMcpDetail:   "MCP detail",
		catalogKindAgentDetail: "Agent detail",
		catalogKindAgents:      "Agents",
	}
	for k, want := range cases {
		if got := catalogBrowserTitle(k); got != want {
			t.Errorf("kind %d: title=%q, want %q", k, got, want)
		}
	}
}

func TestCatalogBrowser_EnterOnAgentDrillsIntoDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	parent := &catalogBrowserState{
		kind:  catalogKindAgents,
		title: "Agents",
		items: []catalogItem{{id: "analysis", title: "Analysis expert"}},
	}
	a.catalogBrowserOpen = true
	a.catalogBrowser = parent

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if a.catalogBrowser == parent {
		t.Fatal("enter on agent row did not replace browser with detail state")
	}
	if a.catalogBrowser.kind != catalogKindAgentDetail {
		t.Fatalf("browser kind = %v, want catalogKindAgentDetail", a.catalogBrowser.kind)
	}
	if a.catalogBrowser.agentID != "analysis" {
		t.Fatalf("agentID = %q, want analysis", a.catalogBrowser.agentID)
	}
	if a.catalogBrowser.parent != parent {
		t.Fatal("detail browser did not retain parent for back navigation")
	}
	if cmd == nil {
		t.Fatal("expected detail load command")
	}
}

func TestCatalogBrowser_OOnAgentSetsOneTurnOverride(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgents,
		title: "Agents",
		items: []catalogItem{{id: "analysis", title: "Analysis expert"}},
	}

	_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: 'o', Text: "o"})

	if a.nextTurnAgentID != "analysis" {
		t.Fatalf("nextTurnAgentID = %q, want analysis", a.nextTurnAgentID)
	}
	if a.catalogBrowserOpen {
		t.Fatal("agent one-turn selection should close the catalog")
	}
	if !strings.Contains(a.transientHint, "Analysis expert") {
		t.Fatalf("transient hint should name selected agent, got %q", a.transientHint)
	}
}

func TestCatalogBrowser_AgentActionsOpenWriteModals(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.sessions = []gact.Session{{ID: "sess_demo", Title: "demo"}}
	a.selected = 0
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgents,
		title: "Agents",
		items: []catalogItem{{id: "action/create-agent", title: "Create user agent"}},
	}

	_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if !a.agentWriteOpen || a.agentWriteMode != agentWriteModeCreate {
		t.Fatalf("create action should open create modal, open=%v mode=%q", a.agentWriteOpen, a.agentWriteMode)
	}

	a.closeAgentWrite()
	a.catalogBrowser.items = []catalogItem{{id: "action/extract-agent", title: "Extract agent"}}
	_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if !a.agentWriteOpen || a.agentWriteMode != agentWriteModeExtract || !strings.Contains(a.agentWriteDraft, "demo") {
		t.Fatalf("extract action should open extract modal with session-derived id, open=%v mode=%q draft=%q", a.agentWriteOpen, a.agentWriteMode, a.agentWriteDraft)
	}
}

func TestCatalogBrowser_AgentDetailCloneActionOpensWriteModal(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:    catalogKindAgentDetail,
		title:   "Agent · Data",
		agentID: "data",
		items:   []catalogItem{{id: "agent-action/clone", title: "Clone as user agent"}},
	}

	_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if !a.agentWriteOpen || a.agentWriteMode != agentWriteModeClone || a.agentWriteSourceID != "data" {
		t.Fatalf("clone action should open clone modal, open=%v mode=%q source=%q", a.agentWriteOpen, a.agentWriteMode, a.agentWriteSourceID)
	}
}

func TestAgentEditModalUpdatesStructuredFields(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.openAgentEdit(gact.AgentDef{
		ID: "user-agent", Source: "user", Title: "User Agent", Description: "old",
		Tools: []string{"read_file"}, Keywords: []string{"old"}, Enabled: true,
	})

	a.setAgentEditField(1)
	a.agentEditDraft.Description = ""
	a.agentEditCursor = 0
	a.insertAgentEditText("new description")
	if a.agentEditDraft.Description != "new description" {
		t.Fatalf("description = %q", a.agentEditDraft.Description)
	}

	a.setAgentEditField(3)
	a.agentEditDraft.Tools = nil
	a.insertAgentEditText("read_file, mcp.parquet.read")
	if got := strings.Join(a.agentEditDraft.Tools, ","); got != "read_file,mcp.parquet.read" {
		t.Fatalf("tools = %q", got)
	}
	a.setAgentEditField(5)
	_, _ = a.handleAgentEditKey(keyMsg("left"))
	if a.agentEditDraft.Enabled {
		t.Fatal("enabled toggle did not flip")
	}
}

func TestAgentCatalogWriteActionsRespectCapabilities(t *testing.T) {
	a := newReadyApp(nil, nil)
	items := a.applyCapabilityGatesToCatalogItems(catalogKindAgents, []catalogItem{{
		id: "action/create-agent", title: "Create",
	}, {
		id: "action/extract-agent", title: "Extract",
	}})
	if !items[0].disabled || !items[1].disabled {
		t.Fatalf("write actions should be disabled without capabilities: %#v", items)
	}

	a.caps.Capabilities.AgentWrite = true
	a.caps.Capabilities.SkillsExtraction = true
	items = a.applyCapabilityGatesToCatalogItems(catalogKindAgents, items)
	if items[0].disabled || items[1].disabled {
		t.Fatalf("write actions should be enabled with capabilities: %#v", items)
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
	a.openAgentWrite(agentWriteModeCreate, "", "")

	_, _ = a.Update(tea.PasteMsg{Content: " Data\r\nExpert \nCopy! "})

	if a.agentWriteDraft != "Data Expert Copy!" {
		t.Fatalf("agent write draft = %q, want compact single-line paste", a.agentWriteDraft)
	}
	if a.agentWriteCursor != len([]rune(a.agentWriteDraft)) {
		t.Fatalf("agent write cursor = %d, want end of draft %d", a.agentWriteCursor, len([]rune(a.agentWriteDraft)))
	}
	if strings.ContainsAny(a.agentWriteDraft, "\r\n") {
		t.Fatalf("agent write paste kept raw newlines: %q", a.agentWriteDraft)
	}
}

func TestCatalogBrowser_EnterOnSkillDrillsIntoDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	parent := &catalogBrowserState{
		kind:  catalogKindSkills,
		title: "Skills",
		items: []catalogItem{{id: "tui-test", title: "TUI Test", statusTag: "skill"}},
	}
	a.catalogBrowserOpen = true
	a.catalogBrowser = parent

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if a.catalogBrowser == parent {
		t.Fatal("enter on skill row did not replace browser with agent detail state")
	}
	if a.catalogBrowser.kind != catalogKindAgentDetail {
		t.Fatalf("browser kind = %v, want catalogKindAgentDetail", a.catalogBrowser.kind)
	}
	if a.catalogBrowser.agentID != "tui-test" {
		t.Fatalf("agentID = %q, want tui-test", a.catalogBrowser.agentID)
	}
	if cmd == nil {
		t.Fatal("expected skill detail load command")
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
				{"id":"ndp_catalog","source":"builtin","title":"NDP catalog","tier":3,"metadata":{"parent":"data"}},
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
	var childDesc string
	for _, item := range loaded.items {
		ids[item.id] = true
		if item.id == "ndp_catalog" {
			childDesc = item.desc
		}
	}
	if !ids["data"] || !ids["ndp_catalog"] {
		t.Fatalf("agents catalog should include parent and child agents, got %#v", loaded.items)
	}
	if ids["tui-test"] {
		t.Fatalf("agents catalog should exclude skills, got %#v", loaded.items)
	}
	if !strings.Contains(childDesc, "child of Data expert") {
		t.Fatalf("child agent row should expose parent relationship, got %q", childDesc)
	}
}

func TestCatalogBrowser_EnterOnToolRowLoadsToolDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{{id: "shell_bash", title: "shell_bash"}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if cmd == nil {
		t.Fatal("enter on tool row should fetch tool detail")
	}
}

func TestCatalogDetailLoadedOpensScrollableDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{kind: catalogKindTools, title: "Tools"}

	model, _ := a.Update(catalogDetailLoadedMsg{
		title: "Tool · shell_bash",
		text:  "owner: utility\nvisible_to: chat, planner, utility\ninput_schema:\n{}",
	})
	got := model.(*App)

	if !got.detailViewOpen || got.detailView == nil {
		t.Fatal("catalog detail should open detail view")
	}
	if !got.catalogBrowserOpen || got.catalogBrowser == nil {
		t.Fatal("catalog detail should keep the catalog behind the foreground detail view")
	}
	if !strings.Contains(got.detailView.fullText, "owner: utility") ||
		!strings.Contains(got.detailView.fullText, "visible_to: chat") {
		t.Fatalf("detail missing tool inspector metadata:\n%s", got.detailView.fullText)
	}
}

func TestCatalogBrowser_EnterOnAgentDetailRowOpensDetailModal(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentDetail,
		title: "Agent · Main Agent",
		items: []catalogItem{
			{id: "prompt", title: "Prompt", desc: "Route to the right expert."},
		},
	}

	_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("enter on agent detail row should open detail modal")
	}
	if a.detailView.title != "Prompt" || !strings.Contains(a.detailView.fullText, "Route to") {
		t.Fatalf("unexpected detail view: %#v", a.detailView)
	}
}

func TestLoadAgentDetailIncludesPlannerVisibleCommands(t *testing.T) {
	var commandQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/agents/clio.expert.data":
			writeJSONForTest(t, w, gact.AgentDef{ID: "clio.expert.data", Title: "Data Expert", Enabled: true})
		case "/v1/agents":
			writeJSONForTest(t, w, map[string]any{"agents": []gact.AgentDef{{ID: "clio.expert.data", Title: "Data Expert", Enabled: true}}})
		case "/v1/tools":
			writeJSONForTest(t, w, map[string]any{"tools": []gact.Tool{}})
		case "/v1/commands":
			commandQuery = r.URL.RawQuery
			trueValue := true
			writeJSONForTest(t, w, map[string]any{"commands": []gact.Command{{
				ID: "/summarize", Title: "Summarize dataset", Source: "user",
				AgentID: "clio.expert.data", PlannerVisible: &trueValue, AgentInvocable: &trueValue,
				ArgumentHint: "dataset_id required",
			}}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	msg := loadAgentDetailCmd(client.New(srv.URL), "clio.expert.data", client.RuntimeScope{WorkspaceID: "ws1", SessionID: "s1"})()
	loaded, ok := msg.(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("msg = %T, want catalogBrowserLoadedMsg", msg)
	}
	found := false
	for _, item := range loaded.items {
		if item.id == "command//summarize" {
			found = strings.Contains(item.title, "Summarize dataset") && strings.Contains(item.desc, "planner") && strings.Contains(item.desc, "dataset_id required")
		}
	}
	if !found {
		t.Fatalf("planner command row missing from agent detail: %#v", loaded.items)
	}
	for _, want := range []string{"workspace_id=ws1", "session_id=s1", "agent_id=clio.expert.data", "planner=true"} {
		if !strings.Contains(commandQuery, want) {
			t.Fatalf("command query missing %q: %s", want, commandQuery)
		}
	}
}

func TestCatalogBrowser_EnterOnAgentDetailToolLoadsToolDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentDetail,
		title: "Agent · Utility",
		items: []catalogItem{{id: "tool/shell_bash", title: "Tool · shell_bash"}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if cmd == nil {
		t.Fatal("enter on agent tool row should fetch tool detail")
	}
}

func TestCatalogBrowser_EnterOnAgentDetailChildDrills(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentDetail,
		title: "Agent · Data",
		items: []catalogItem{{id: "agent/ndp_catalog", title: "Child agent · NDP Catalog"}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if a.catalogBrowser.kind != catalogKindAgentDetail || a.catalogBrowser.agentID != "ndp_catalog" {
		t.Fatalf("child drill did not open ndp_catalog detail: %#v", a.catalogBrowser)
	}
	if cmd == nil {
		t.Fatal("expected child agent detail load command")
	}
}

func TestCatalogBrowser_EnterOnAgentDetailMcpServerDrills(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentDetail,
		title: "Agent · Data",
		items: []catalogItem{{id: "mcpserver/mcp_ndp", title: "MCP server · mcp_ndp"}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if a.catalogBrowser.kind != catalogKindMcpDetail || a.catalogBrowser.mcpServerID != "mcp_ndp" {
		t.Fatalf("MCP drill did not open mcp_ndp detail: %#v", a.catalogBrowser)
	}
	if cmd == nil {
		t.Fatal("expected MCP detail load command")
	}
}

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
	a.wsID = "ws1"
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Data",
		blueprintID: "bp1",
		items:       []catalogItem{{id: "hook/pre_message", title: "Hook · Pre Message"}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})
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

func TestAgentBlueprintManagedMsgSurfacesFailuresTruthfully(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
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
	if !a.catalogBrowserOpen || a.catalogBrowser == nil || a.catalogBrowser.blueprintID != "bp1" {
		t.Fatalf("failed update should leave detail browser open for inspection: open=%v browser=%+v", a.catalogBrowserOpen, a.catalogBrowser)
	}
	if got := a.transientHint; got != "agent blueprint updated failed: git fetch exited 128" {
		t.Fatalf("failure hint = %q", got)
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
	a.wsID = "ws1"
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
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

func TestCatalogBrowser_EnterOnAgentBlueprintSourceOpensSourceDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentBlueprints,
		title: "Agent Blueprints",
		items: []catalogItem{{
			id:    "source/0",
			title: "Marketplace source · git · https://example.org/community/seismic-agents.git",
			desc:  "Marketplace Source\nsource: https://example.org/community/seismic-agents.git\nblueprints: Seismic Marketplace",
		}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd != nil {
		t.Fatal("source detail should open locally without backend command")
	}
	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("source row should open detail view")
	}
	if !strings.Contains(a.detailView.fullText, "blueprints: Seismic Marketplace") {
		t.Fatalf("source detail missing blueprint list:\n%s", a.detailView.fullText)
	}
}

func TestCatalogBrowser_EnterOnAgentBlueprintSourceRegistryOpensBackendGapDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentBlueprints,
		title: "Agent Blueprints",
		items: []catalogItem{{
			id:        "action/source-registry",
			title:     "Marketplace sources",
			desc:      agentBlueprintSourceRegistryUnavailableDetail(),
			statusTag: "backend gap",
		}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd != nil {
		t.Fatal("source registry detail should open locally without backend command")
	}
	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("source registry row should open detail view")
	}
	for _, want := range []string{
		"Marketplace Source Registry",
		"status: unavailable",
		"CLIO does not expose a durable marketplace-source registry API yet",
		"add named source",
		"remove source without deleting installed blueprints",
		"derived per-blueprint source provenance",
	} {
		if !strings.Contains(a.detailView.fullText, want) {
			t.Fatalf("source registry detail missing %q:\n%s", want, a.detailView.fullText)
		}
	}
}

func TestLoadMcpDetailIncludesOwningAgentContext(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/agents":
			_, _ = w.Write([]byte(`{"agents":[
				{"id":"data","source":"builtin","title":"Data expert","specialization":"data_analysis","tools":["adios_inspect_file"]}
			]}`))
		case "/v1/mcp/servers/mcp_adios/tools":
			_, _ = w.Write([]byte(`{"tools":[
				{
					"id":"adios_inspect_file",
					"name":"adios_inspect_file",
					"source":"mcp",
					"server_id":"mcp_adios",
					"description":"Inspect ADIOS containers",
					"visible_to":["data"]
				}
			]}`))
		case "/v1/mcp/servers/mcp_adios/resources":
			_, _ = w.Write([]byte(`{"resources":[]}`))
		case "/v1/mcp/servers/mcp_adios/prompts":
			_, _ = w.Write([]byte(`{"prompts":[]}`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	msg := loadMcpDetailCmd(client.New(server.URL), client.RuntimeScope{}, "mcp_adios")()
	loaded, ok := msg.(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("message type = %T, want catalogBrowserLoadedMsg", msg)
	}
	if loaded.errText != "" {
		t.Fatalf("unexpected MCP detail error: %s", loaded.errText)
	}
	if len(loaded.items) != 2 {
		t.Fatalf("items = %#v, want reconnect action plus one tool row", loaded.items)
	}
	if loaded.items[0].id != "mcp-action/reconnect" {
		t.Fatalf("first MCP detail row = %#v, want reconnect action", loaded.items[0])
	}
	for _, want := range []string{"server: mcp_adios", "agents: Data expert · data_analysis"} {
		if !strings.Contains(loaded.items[1].desc, want) {
			t.Fatalf("MCP tool row missing %q:\n%#v", want, loaded.items[1])
		}
	}
}

func TestMcpDetailReconnectActionDispatchesBackendCall(t *testing.T) {
	var reconnects int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/v1/mcp/servers/mcp_docs/reconnect" {
			reconnects++
			w.WriteHeader(http.StatusNoContent)
			return
		}
		t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
	}))
	defer server.Close()

	a := NewWithTheme(server.URL, ThemeForMode(ModeDark))
	a.stage = StageReady
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · docs",
		mcpServerID: "mcp_docs",
		items:       []catalogItem{{id: "mcp-action/reconnect", title: "Reconnect server"}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("enter on reconnect action should dispatch command")
	}
	msg := cmd()
	done, ok := msg.(mcpReconnectDoneMsg)
	if !ok {
		t.Fatalf("message = %#v, want mcpReconnectDoneMsg", msg)
	}
	if done.err != nil || done.serverID != "mcp_docs" || reconnects != 1 {
		t.Fatalf("done=%#v reconnects=%d", done, reconnects)
	}
}

func TestMcpDetailReconnectShortcutDispatchesBackendCall(t *testing.T) {
	var reconnects int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/v1/mcp/servers/mcp_docs/reconnect" {
			reconnects++
			w.WriteHeader(http.StatusNoContent)
			return
		}
		t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
	}))
	defer server.Close()

	a := NewWithTheme(server.URL, ThemeForMode(ModeDark))
	a.stage = StageReady
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · docs",
		mcpServerID: "mcp_docs",
		items:       []catalogItem{{id: "tool/read_file", title: "[tool] read_file"}},
	}

	_, cmd := a.handleCatalogBrowserKey(keyMsg("r"))
	if cmd == nil {
		t.Fatal("r in MCP detail should dispatch reconnect command")
	}
	msg := cmd()
	done, ok := msg.(mcpReconnectDoneMsg)
	if !ok {
		t.Fatalf("message = %#v, want mcpReconnectDoneMsg", msg)
	}
	if done.err != nil || done.serverID != "mcp_docs" || reconnects != 1 {
		t.Fatalf("done=%#v reconnects=%d", done, reconnects)
	}
}

func TestMcpReconnectDoneSurfacesSuccessAndFailure(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.stage = StageReady
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · docs",
		mcpServerID: "mcp_docs",
	}

	model, cmd := a.Update(mcpReconnectDoneMsg{serverID: "mcp_docs"})
	a = model.(*App)
	if !strings.Contains(a.transientHint, "reconnected MCP mcp_docs") {
		t.Fatalf("success hint = %q", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("success should schedule hint expiry and refresh MCP state")
	}

	model, cmd = a.Update(mcpReconnectDoneMsg{serverID: "mcp_docs", err: errors.New("probe failed")})
	a = model.(*App)
	if !strings.Contains(a.transientHint, "mcp reconnect failed: probe failed") {
		t.Fatalf("failure hint = %q", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("failure should schedule hint expiry")
	}
}

func TestLoadAgentDetailIncludesToolAndMcpServerMapping(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/agents/data":
			_, _ = w.Write([]byte(`{
				"id":"data",
				"source":"builtin",
				"title":"Data expert",
				"description":"Dataset inspection",
				"default_model":{"provider_id":"lm_studio","model_id":"qwopus3.5-9b-v3"},
				"tools":["ndp_search_datasets"]
			}`))
		case "/v1/agents":
			_, _ = w.Write([]byte(`{"agents":[
				{"id":"data","source":"builtin","title":"Data expert"},
				{"id":"ndp_catalog","source":"builtin","title":"NDP catalog","metadata":{"parent":"data"}}
			]}`))
		case "/v1/tools":
			_, _ = w.Write([]byte(`{"tools":[
				{
					"id":"ndp_search_datasets",
					"name":"ndp_search_datasets",
					"source":"mcp",
					"server_id":"mcp_ndp",
					"description":"Search NDP datasets",
					"owner":"ndp_catalog",
					"tags":["catalog"],
					"visible_to":["data","ndp_catalog"],
					"input_schema":{"type":"object"}
				}
			]}`))
		case "/v1/commands":
			_, _ = w.Write([]byte(`{"commands":[]}`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	msg := loadAgentDetailCmd(client.New(server.URL), "data", client.RuntimeScope{})()
	loaded, ok := msg.(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("message type = %T, want catalogBrowserLoadedMsg", msg)
	}
	if loaded.errText != "" {
		t.Fatalf("unexpected agent detail load error: %s", loaded.errText)
	}

	var hasTool, hasServer, hasChild, hasModel bool
	for _, item := range loaded.items {
		switch item.id {
		case "model":
			hasModel = strings.Contains(item.desc, "provider: lm_studio") &&
				strings.Contains(item.desc, "model: qwopus3.5-9b-v3")
		case "tool/ndp_search_datasets":
			hasTool = strings.Contains(item.desc, "server: mcp_ndp") &&
				strings.Contains(item.desc, "visible to: data, ndp_catalog")
		case "mcpserver/mcp_ndp":
			hasServer = true
		case "agent/ndp_catalog":
			hasChild = true
		}
	}
	if !hasTool || !hasServer || !hasChild || !hasModel {
		t.Fatalf("agent detail missing tool/server/child mapping: %#v", loaded.items)
	}
}

func TestAgentCatalogDescriptionSurfacesSkillsAndValidation(t *testing.T) {
	items := agentCatalogItems([]gact.AgentDef{{
		ID:                 "data",
		Source:             "agent_blueprint",
		Title:              "Data",
		Enabled:            true,
		Skills:             []string{"python", "ndp", "adios", "plots"},
		ValidationWarnings: []string{"skill path unresolved until install"},
		ValidationErrors:   []string{"missing skill: adios"},
	}}, catalogKindAgents)

	if len(items) != 1 {
		t.Fatalf("items = %#v", items)
	}
	if items[0].statusTag != "invalid" {
		t.Fatalf("agent with errors should remain invalid, got %#v", items[0])
	}
	for _, want := range []string{"skills: python, ndp, adios, +1", "warnings: skill path unresolved until install", "errors: missing skill: adios"} {
		if !strings.Contains(items[0].desc, want) {
			t.Fatalf("agent desc missing %q: %#v", want, items[0])
		}
	}
}

func TestAgentCatalogWarningsUseAttentionState(t *testing.T) {
	items := agentCatalogItems([]gact.AgentDef{{
		ID:                 "data",
		Source:             "agent_blueprint",
		Title:              "Data",
		Enabled:            true,
		ValidationWarnings: []string{"skill path unresolved until install"},
	}}, catalogKindAgents)

	if len(items) != 1 {
		t.Fatalf("items = %#v", items)
	}
	if items[0].statusTag != "warning" || !strings.Contains(items[0].desc, "warnings: skill path unresolved until install") {
		t.Fatalf("warning-only agent should be visually distinct: %#v", items[0])
	}
}

func TestLoadAgentDetailSurfacesDeclaredSkillsAndValidation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/agents/data":
			_, _ = w.Write([]byte(`{
				"id":"data",
				"source":"agent_blueprint",
				"title":"Data expert",
				"description":"Dataset inspection",
				"skills":["python","ndp"],
				"validation_warnings":["skill ndp resolved from community source"],
				"validation_errors":["skill not resolved: ndp"]
			}`))
		case "/v1/agents":
			_, _ = w.Write([]byte(`{"agents":[{"id":"data","source":"agent_blueprint","title":"Data expert"}]}`))
		case "/v1/tools":
			_, _ = w.Write([]byte(`{"tools":[]}`))
		case "/v1/commands":
			_, _ = w.Write([]byte(`{"commands":[]}`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	msg := loadAgentDetailCmd(client.New(server.URL), "data", client.RuntimeScope{})()
	loaded, ok := msg.(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("message type = %T, want catalogBrowserLoadedMsg", msg)
	}
	if loaded.errText != "" {
		t.Fatalf("unexpected agent detail load error: %s", loaded.errText)
	}

	var hasSkills, hasWarnings, hasValidation bool
	for _, item := range loaded.items {
		switch item.id {
		case "skills":
			hasSkills = item.title == "Declared skills" &&
				item.statusTag == "skills" &&
				strings.Contains(item.desc, "python, ndp")
		case "validation-warnings":
			hasWarnings = item.title == "Validation warnings" &&
				item.statusTag == "warning" &&
				strings.Contains(item.desc, "skill ndp resolved from community source")
		case "validation":
			hasValidation = item.statusTag == "error" &&
				strings.Contains(item.desc, "skill not resolved: ndp")
		}
	}
	if !hasSkills || !hasWarnings || !hasValidation {
		t.Fatalf("agent detail missing skills/validation rows: %#v", loaded.items)
	}
}

func TestCatalogBrowser_EnterOnMcpResourceLoadsResourceDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · docs",
		mcpServerID: "docs",
		items:       []catalogItem{{id: "res/" + "file://resource", title: "[res] resource"}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if cmd == nil {
		t.Fatal("enter on MCP resource should fetch resource contents")
	}
}

func TestFormatMcpResourceContentsUsesDetailSections(t *testing.T) {
	out := formatMcpResourceContents([]gact.McpContent{{
		URI:      "file://resource",
		MimeType: "text/markdown",
		Text:     "first line\nsecond line",
	}, {
		Data: "YWJjZA==",
	}})

	for _, want := range []string{
		"Resource content",
		"uri: file://resource",
		"mime_type: text/markdown",
		"text:",
		"first line",
		"second line",
		"uri: content[1]",
		"base64_data: 8 bytes encoded",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("resource detail missing %q:\n%s", want, out)
		}
	}
}

func TestLoadToolDetailCmdFetchesSchemaAndMetadata(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/agents" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{
				"agents": [
					{"id":"utility","title":"Utility Expert","source":"builtin","tier":2,"specialization":"utility","tools":["shell_bash"]},
					{"id":"planner","title":"Planner","source":"builtin","tier":1}
				]
			}`))
			return
		}
		if r.URL.Path != "/v1/tools/shell_bash" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"id":"shell_bash",
			"name":"shell_bash",
			"source":"mcp",
			"server_id":"mcp_shell",
			"description":"Run a shell command",
			"permission_default":"ask",
			"owner":"utility",
			"tags":["shell","diagnostic"],
			"visible_to":["chat","utility"],
			"input_schema":{"type":"object","properties":{"command":{"type":"string"}}}
		}`))
	}))
	defer server.Close()

	msg := loadToolDetailCmd(client.New(server.URL), client.RuntimeScope{}, "shell_bash")()
	detail, ok := msg.(catalogDetailLoadedMsg)
	if !ok {
		t.Fatalf("message type = %T, want catalogDetailLoadedMsg", msg)
	}
	if detail.err != nil {
		t.Fatalf("unexpected detail load error: %v", detail.err)
	}
	for _, want := range []string{
		"owner: utility",
		"visible to: chat, utility",
		"owning agents:",
		"Utility Expert · utility",
		"Inputs",
		"command",
	} {
		if !strings.Contains(detail.text, want) {
			t.Fatalf("loaded tool detail missing %q:\n%s", want, detail.text)
		}
	}
}

func TestFormatToolDetailIncludesInspectorMetadata(t *testing.T) {
	out := formatToolDetailWithAgents(gact.Tool{
		ID:                "shell_bash",
		Name:              "shell_bash",
		Source:            "mcp",
		ServerID:          "mcp_shell",
		Description:       "Run a shell command",
		PermissionDefault: "ask",
		Owner:             "utility",
		Tags:              []string{"shell", "diagnostic"},
		VisibleTo:         []string{"chat", "planner", "utility"},
		InputSchema: map[string]any{
			"type": "object",
		},
	}, []gact.AgentDef{
		{ID: "utility", Title: "Utility Expert", Specialization: "utility", Tools: []string{"shell_bash"}},
	})

	for _, want := range []string{
		"owner: utility",
		"visible to: chat, planner, utility",
		"owning agents:",
		"Utility Expert · utility",
		"tags: shell, diagnostic",
		"permission: ask",
		"server: mcp_shell",
		"Inputs",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("tool detail missing %q:\n%s", want, out)
		}
	}
}

func TestFormatToolDetailSummarizesSchemaFields(t *testing.T) {
	out := formatToolDetailWithAgents(gact.Tool{
		ID:          "adios_inspect_file",
		Name:        "adios_inspect_file",
		Source:      "mcp",
		Description: "Inspect an ADIOS/BP container.",
		InputSchema: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"required":             []any{"filepath"},
			"properties": map[string]any{
				"filepath": map[string]any{
					"type":        "string",
					"description": "Path to the ADIOS/BP container to inspect.",
				},
				"include_variables": map[string]any{
					"type":        "boolean",
					"description": "Include variable-level metadata.",
				},
			},
		},
	}, nil)

	for _, want := range []string{
		"Inputs",
		"type: object",
		"required: filepath",
		"additional_properties: disabled",
		"fields:",
		"- filepath — string · required · Path to the ADIOS/BP container to inspect.",
		"- include_variables — boolean · Include variable-level metadata.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("tool detail schema summary missing %q:\n%s", want, out)
		}
	}
	for _, notWant := range []string{
		`"properties"`,
		`"additionalProperties"`,
	} {
		if strings.Contains(out, notWant) {
			t.Fatalf("tool detail should not expose raw schema JSON %q:\n%s", notWant, out)
		}
	}
}

func TestFormatToolDetailSummarizesAnnotationsWithoutRawJSON(t *testing.T) {
	out := formatToolDetailWithAgents(gact.Tool{
		ID:                "shell_bash",
		Name:              "shell_bash",
		Source:            "builtin",
		PermissionDefault: "ask",
		Annotations: &gact.ToolAnnotations{
			Title:           "Run shell command",
			DestructiveHint: true,
			OpenWorldHint:   true,
		},
	}, nil)

	for _, want := range []string{
		"Safety hints",
		"display title: Run shell command",
		"hints: destructive, open-world",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("tool detail annotations summary missing %q:\n%s", want, out)
		}
	}
	for _, notWant := range []string{
		`"destructiveHint"`,
		`"openWorldHint"`,
		"{",
		"}",
	} {
		if strings.Contains(out, notWant) {
			t.Fatalf("tool detail should not expose raw annotations JSON %q:\n%s", notWant, out)
		}
	}
}

// TestCatalogBrowser_DisabledRowRendersDim: a disabled tool gets
// the (disabled) tag in the rendered output.
func TestCatalogBrowser_DisabledRowRendersDim(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.disabledTools = map[string]bool{"bash": true}
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{
			{id: "bash", title: "bash", desc: "shell"},
			{id: "read_file", title: "read_file", desc: "read"},
		},
	}
	a.width = 100
	a.height = 30
	out := a.viewCatalogBrowser()
	if !strings.Contains(out, "(disabled)") {
		t.Errorf("expected '(disabled)' in render of disabled tool, got: %q", out)
	}
}

func TestCatalogBrowserCompactsMultilineDescriptions(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{{
			id:    "fs_apply_edit_write",
			title: "fs_apply_edit_write",
			desc:  "Write new_content to filepath.\n\nDesigned for accepted diffs.\nReturns path, unified_diff, new_content, lines_added, lines_removed.",
		}},
	}
	a.width = 100
	a.height = 30

	out := stripANSI(a.viewCatalogBrowser())
	if strings.Contains(out, "\n\nDesigned for accepted diffs") {
		t.Fatalf("catalog description kept embedded newlines:\n%s", out)
	}
	if strings.Count(out, "Designed for") != 1 {
		t.Fatalf("catalog description should preserve compact content on one visual row:\n%s", out)
	}
}

func TestCatalogBrowserToolsUseDenseInlineMetadata(t *testing.T) {
	a := newReadyApp(nil, nil)
	items := make([]catalogItem, 20)
	for i := range items {
		items[i] = catalogItem{
			id:        "tool-" + itoa2(i),
			title:     "tool-" + itoa2(i),
			desc:      "permission: ask · inputs: path",
			statusTag: "builtin",
		}
	}
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: items,
	}
	a.width = 120
	a.height = 36

	out := stripANSI(a.viewCatalogBrowser())
	if !strings.Contains(out, "tool-19") {
		t.Fatalf("tool catalog should fit all short metadata rows inline:\n%s", out)
	}
	if !strings.Contains(out, "tool-0  [builtin]  permission: ask") {
		t.Fatalf("tool catalog should render metadata on the title row:\n%s", out)
	}
}

func TestToolSummaryOmitsRepeatedCommandDescription(t *testing.T) {
	got := toolSummary(gact.Tool{
		ID:          "parquet_compute_statistics",
		Name:        "parquet_compute_statistics",
		Description: "parquet_compute_statistics",
		ServerID:    "facility-data",
		Tags:        []string{"parquet", "statistics"},
	})

	if strings.Contains(got, "parquet_compute_statistics") {
		t.Fatalf("tool summary should omit repeated command-name description: %q", got)
	}
	for _, want := range []string{"server: facility-data", "tags: parquet, statistics"} {
		if !strings.Contains(got, want) {
			t.Fatalf("tool summary missing useful metadata %q: %q", want, got)
		}
	}
}

func TestToolCatalogDescriptionUsesOperationalMetadata(t *testing.T) {
	got := toolCatalogDescription(gact.Tool{
		ID:                "parquet_compute_statistics",
		Name:              "parquet_compute_statistics",
		Description:       "Compute summary statistics for one Parquet column.\n\nAgent story: use this after schema inspection.",
		PermissionDefault: "ask",
		Owner:             "analysis",
		Tags:              []string{"parquet", "statistics", "tabular", "science"},
		VisibleTo:         []string{"analysis", "planner"},
		InputSchema: map[string]any{
			"properties": map[string]any{
				"filepath": map[string]any{"type": "string"},
				"column":   map[string]any{"type": "string"},
				"limit":    map[string]any{"type": "integer"},
				"method":   map[string]any{"type": "string"},
				"sample":   map[string]any{"type": "integer"},
			},
		},
	})

	for _, want := range []string{
		"owner: analysis",
		"permission: ask",
		"inputs: column, filepath, +3 more",
		"tags: parquet",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("tool catalog description missing %q: %q", want, got)
		}
	}
	if strings.Contains(got, "Agent story") {
		t.Fatalf("catalog summary should omit long agent-story prose: %q", got)
	}
	if strings.Contains(got, "Compute summary statistics") {
		t.Fatalf("catalog summary should prefer operational metadata over prose when metadata exists: %q", got)
	}
}

func TestToolCatalogDescriptionOmitsRepeatedCommandName(t *testing.T) {
	got := toolCatalogDescription(gact.Tool{
		ID:                "parquet_compute_statistics",
		Name:              "parquet_compute_statistics",
		Description:       "parquet_compute_statistics",
		PermissionDefault: "ask",
		Owner:             "analysis",
	})

	if strings.Contains(got, "parquet_compute_statistics") {
		t.Fatalf("catalog description should omit repeated command-name description: %q", got)
	}
	for _, want := range []string{"owner: analysis", "permission: ask"} {
		if !strings.Contains(got, want) {
			t.Fatalf("tool catalog description missing fallback metadata %q: %q", want, got)
		}
	}
}

func TestToolCatalogDescriptionUsesPurposeWhenMetadataMissing(t *testing.T) {
	got := toolCatalogDescription(gact.Tool{
		ID:          "fetch_url",
		Name:        "fetch_url",
		Description: "Fetch a URL and return its response body.\n\nAgent story: useful for docs.",
	})

	if got != "Fetch a URL and return its response body." {
		t.Fatalf("fallback purpose = %q", got)
	}
}

func TestCatalogBrowserDetailKindsAdvertiseEnterDetails(t *testing.T) {
	for _, kind := range []catalogBrowserKind{catalogKindTools, catalogKindMcpDetail, catalogKindAgentDetail} {
		a := newReadyApp(nil, nil)
		a.catalogBrowserOpen = true
		a.catalogBrowser = &catalogBrowserState{
			kind:  kind,
			title: "Detail",
			items: []catalogItem{{id: "tool/shell_bash", title: "Tool · shell_bash"}},
		}
		a.width = 120
		a.height = 40

		out := stripANSI(a.viewCatalogBrowser())
		if !strings.Contains(out, "Enter details") {
			t.Fatalf("detail catalog kind %v should advertise Enter details:\n%s", kind, out)
		}
	}
}

func TestCatalogBrowserScrollsSelectionIntoView(t *testing.T) {
	a := newReadyApp(nil, nil)
	items := make([]catalogItem, 20)
	for i := range items {
		items[i] = catalogItem{id: itoa2(i), title: "item-" + itoa2(i)}
	}
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindSkills,
		title: "Skills",
		items: items,
		sel:   0,
	}
	for i := 0; i < 15; i++ {
		_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyDown})
	}

	if a.catalogBrowser.offset == 0 {
		t.Fatal("catalog browser offset did not move after selection passed visible budget")
	}
	out := a.viewCatalogBrowser()
	if !strings.Contains(out, "item-15") {
		t.Fatalf("selected item not visible after scrolling:\n%s", out)
	}
	if strings.Contains(out, "item-0") {
		t.Fatalf("top item still visible after scrolling past viewport:\n%s", out)
	}
}

func TestCatalogBrowserUsesSharedScrollRailInsteadOfRangeRows(t *testing.T) {
	a := newReadyApp(nil, nil)
	items := make([]catalogItem, 30)
	for i := range items {
		items[i] = catalogItem{id: itoa2(i), title: "item-" + itoa2(i)}
	}
	a.width = 120
	a.height = 36
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindSkills,
		title: "Skills",
		items: items,
		sel:   14,
	}
	a.catalogBrowser.offset = catalogBrowserClampOffset(a.catalogBrowser.sel, a.catalogBrowser.offset, len(items))

	out := stripANSI(a.viewCatalogBrowser())
	if !strings.Contains(out, "┃") {
		t.Fatalf("long catalog should render a shared side scroll rail:\n%s", out)
	}
	for _, notWant := range []string{"above", "and ", " more"} {
		if strings.Contains(out, notWant) {
			t.Fatalf("catalog should not render textual scroll count %q:\n%s", notWant, out)
		}
	}
}
