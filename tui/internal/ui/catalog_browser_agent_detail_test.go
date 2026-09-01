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

func TestCatalogBrowser_EnterOnAgentDetailRowOpensDetailModal(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentDetail,
		title: "Agent · Main Agent",
		items: []catalogItem{
			{id: "prompt", title: "Prompt", desc: "Route to the right expert."},
		},
	}

	_, _ = a.catalog.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("enter on agent detail row should open detail modal")
	}
	if a.detail.ref.title != "Prompt" || !strings.Contains(a.detail.ref.fullText, "Route to") {
		t.Fatalf("unexpected detail view: %#v", a.detail.ref)
	}
}

func TestLoadAgentDetailIncludesPlannerVisibleCommands(t *testing.T) {
	var commandQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/agents/clio.expert.data":
			writeJSONForTest(t, w, gact.AgentDef{ID: "clio.expert.data", Title: "Data Expert", Source: "user", Enabled: true})
		case "/v1/agents":
			writeJSONForTest(t, w, map[string]any{"agents": []gact.AgentDef{{ID: "clio.expert.data", Title: "Data Expert", Source: "user", Enabled: true}}})
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
		if strings.HasPrefix(item.id, "agent-action/") {
			t.Fatalf("agent action %q should not be mixed into expert structure rows: %#v", item.id, loaded.items)
		}
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
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentDetail,
		title: "Agent · Utility",
		items: []catalogItem{{id: "tool/shell_bash", title: "Tool · shell_bash"}},
	}

	_, cmd := a.catalog.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if cmd == nil {
		t.Fatal("enter on agent tool row should fetch tool detail")
	}
}

func TestCatalogBrowser_EnterOnAgentDetailChildDrills(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentDetail,
		title: "Agent · Data",
		items: []catalogItem{{id: "agent/ndp_catalog", title: "Child agent · NDP Catalog"}},
	}

	_, cmd := a.catalog.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if a.catalog.current.kind != catalogKindAgentDetail || a.catalog.current.agentID != "ndp_catalog" {
		t.Fatalf("child drill did not open ndp_catalog detail: %#v", a.catalog.current)
	}
	if cmd == nil {
		t.Fatal("expected child agent detail load command")
	}
}

func TestCatalogBrowser_EnterOnAgentDetailMcpServerDrills(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentDetail,
		title: "Agent · Data",
		items: []catalogItem{{id: "mcpserver/mcp_ndp", title: "MCP connection · mcp_ndp"}},
	}

	_, cmd := a.catalog.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if a.catalog.current.kind != catalogKindMcpDetail || a.catalog.current.mcpServerID != "mcp_ndp" {
		t.Fatalf("MCP drill did not open mcp_ndp detail: %#v", a.catalog.current)
	}
	if cmd == nil {
		t.Fatal("expected MCP detail load command")
	}
}

func TestLoadAgentDetailSurfacesCapabilityRefs(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/agents/data":
			writeJSONForTest(t, w, gact.AgentDef{
				ID:     "data",
				Title:  "Data",
				Source: "expert_pack",
				CapabilityRefs: []gact.AgentCapabilityRef{
					{Kind: "tool", ID: "hdf5_analyze_dataset", Status: "available", Source: "builtin"},
					{Kind: "command", ID: "/optimize", Status: "unavailable", Metadata: map[string]any{"error": "not_implemented"}},
				},
			})
		case "/v1/agents":
			writeJSONForTest(t, w, map[string]any{"agents": []gact.AgentDef{}})
		case "/v1/tools":
			writeJSONForTest(t, w, map[string]any{"tools": []gact.Tool{}})
		case "/v1/commands":
			writeJSONForTest(t, w, map[string]any{"commands": []gact.Command{}})
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	msg := loadAgentDetailCmd(client.New(server.URL), "data", client.RuntimeScope{})()
	loaded, ok := msg.(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("msg = %T, want catalogBrowserLoadedMsg", msg)
	}
	var joined strings.Builder
	for _, item := range loaded.items {
		joined.WriteString(item.title)
		joined.WriteString(" ")
		joined.WriteString(item.desc)
		joined.WriteString("\n")
	}
	out := joined.String()
	for _, want := range []string{"hdf5_analyze_dataset", "available", "/optimize", "unavailable", "not_implemented"} {
		if !strings.Contains(out, want) {
			t.Fatalf("agent capability refs missing %q:\n%s", want, out)
		}
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
			hasModel = item.title == "Model · default" &&
				strings.Contains(item.desc, "provider: lm_studio") &&
				strings.Contains(item.desc, "model: qwopus3.5-9b-v3")
		case "tool/ndp_search_datasets":
			hasTool = item.title == "Can use · ndp_search_datasets" &&
				strings.Contains(item.desc, "connection: mcp_ndp") &&
				strings.Contains(item.desc, "available to: data, ndp_catalog")
		case "mcpserver/mcp_ndp":
			hasServer = true
		case "agent/ndp_catalog":
			hasChild = strings.HasPrefix(item.title, "Delegates to · ")
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
	if items[0].title != "Data" {
		t.Fatalf("top-level agent should render as a root expert: %#v", items[0])
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

func TestAgentCatalogHierarchyLabelsRootAndChildExperts(t *testing.T) {
	items := agentCatalogItems([]gact.AgentDef{{
		ID: "main", Title: "Default Agent", Source: "builtin", Enabled: true,
	}, {
		ID: "data", Title: "Data", Source: "builtin", Enabled: true, ParentID: "main",
	}}, catalogKindAgents)

	if len(items) != 2 {
		t.Fatalf("items = %#v", items)
	}
	if items[0].title != "Default Expert" {
		t.Fatalf("root title = %q", items[0].title)
	}
	if items[1].title != "└─ Data" {
		t.Fatalf("child title = %q", items[1].title)
	}
	if !strings.Contains(items[1].inlineDesc, "reports to Default Expert") {
		t.Fatalf("child inline summary should preserve parent context: %#v", items[1])
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
