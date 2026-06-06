package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// HHHHH1: catalogKindTools loads /v1/tools and renders BOTH built-in
// and MCP-sourced tools in one list, sorted by (source, name), with
// each row tagged by connection/server and a dense operational summary.
// Verifies the user's "tools and mcps were meant to be the same menu"
// feedback is honoured: a single menu shows everything the agent can call.
func TestCatalogUnifiedTools_RendersAllSources(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/tools":
			// Three sources: a built-in `bash`, two MCP-exposed tools
			// (one each from two servers), and a recipe. Returned in a
			// scrambled order so the loader's sort is exercised.
			_, _ = w.Write([]byte(`{"tools":[
				{"name":"docs.search","source":"mcp","server_id":"mcp_docs","description":"search docs","owner":"docs","permission_default":"ask","tags":["docs"],"visible_to":["research"],"input_schema":{"properties":{"query":{"type":"string"}}}},
				{"name":"bash","source":"builtin","description":"Run shell","owner":"utility","permission_default":"ask","input_schema":{"properties":{"command":{"type":"string"}}}},
				{"name":"summarize","source":"recipe","description":"Summarize a file","owner":"analysis","tags":["summary"]},
				{"name":"fetch.url","source":"mcp","server_id":"mcp_web","description":"GET a URL","owner":"web","visible_to":["research"],"input_schema":{"properties":{"url":{"type":"string"}}}}
			]}`))
		case "/v1/mcp/servers":
			_, _ = w.Write([]byte(`{"servers":[
				{"id":"mcp_docs","name":"Docs","transport":"stdio","protocol_version":"2025-03-26","status":"ready","declared_capabilities":{"tools":true}},
				{"id":"mcp_web","name":"Web","transport":"http","protocol_version":"2025-03-26","status":"error","last_error":"token expired","declared_capabilities":{"tools":true,"resources":{"subscribe":true}}}
			]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	c := client.New(srv.URL)
	cmd := loadCatalogBrowserCmd(c, catalogKindTools, client.RuntimeScope{})
	msg, ok := cmd().(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("cmd returned %T, want catalogBrowserLoadedMsg", cmd())
	}
	if msg.errText != "" {
		t.Fatalf("loader errored: %q", msg.errText)
	}
	if len(msg.items) != 8 {
		t.Fatalf("expected 8 items, got %d", len(msg.items))
	}

	// Sort: builtin -> MCP tool group + nested tools -> recipe. The source
	// rows make /tools a unified capability/source browser instead of
	// forcing users to jump to /mcp to understand where a tool came from.
	wantOrder := []string{"toolsource/builtin", "bash", "mcpserver/mcp_docs", "docs.search", "mcpserver/mcp_web", "fetch.url", "toolsource/recipe", "summarize"}
	for i, want := range wantOrder {
		if msg.items[i].id != want {
			t.Errorf("items[%d].id = %q, want %q", i, msg.items[i].id, want)
		}
	}
	if msg.items[0].title != "Built-in tools" || msg.items[1].title != "  └─ bash" {
		t.Fatalf("built-in rows are not source/tool hierarchy rows: %#v %#v", msg.items[0], msg.items[1])
	}
	if msg.items[2].title != "MCP connection · Docs" || msg.items[3].title != "  └─ docs.search" {
		t.Fatalf("MCP docs rows are not source/tool hierarchy rows: %#v %#v", msg.items[2], msg.items[3])
	}
	if msg.items[4].title != "MCP connection · Web" || msg.items[5].title != "  └─ fetch.url" {
		t.Fatalf("MCP web rows are not source/tool hierarchy rows: %#v %#v", msg.items[4], msg.items[5])
	}
	if msg.items[6].title != "Recipe tools" || msg.items[7].title != "  └─ summarize" {
		t.Fatalf("recipe rows are not source/tool hierarchy rows: %#v %#v", msg.items[6], msg.items[7])
	}
	for _, want := range []string{"1 tool"} {
		if !strings.Contains(msg.items[2].inlineDesc, want) {
			t.Fatalf("MCP docs inline summary missing %q: %#v", want, msg.items[2])
		}
	}
	for _, want := range []string{"1 tool", "resources", "repair needed"} {
		if !strings.Contains(msg.items[4].inlineDesc, want) {
			t.Fatalf("MCP web inline summary missing %q: %#v", want, msg.items[4])
		}
	}
	if strings.Contains(msg.items[4].inlineDesc, "token expired") {
		t.Fatalf("MCP web compact summary should keep raw error text in detail/description, got %#v", msg.items[4])
	}
	for _, raw := range []string{"tools:1", "permission ask", "inputs query"} {
		for _, item := range msg.items {
			if strings.Contains(item.inlineDesc, raw) {
				t.Fatalf("%s inline summary should avoid backend shorthand %q: %q", item.id, raw, item.inlineDesc)
			}
		}
	}

	// Rows are tagged with operator-facing source labels. MCP tools live under
	// their connection row, so the compact badge can stay source-level.
	wantTag := map[string]string{
		"toolsource/builtin": "",
		"bash":               "builtin",
		"mcpserver/mcp_docs": "connected",
		"docs.search":        "mcp",
		"mcpserver/mcp_web":  "disconnected",
		"fetch.url":          "mcp",
		"toolsource/recipe":  "",
		"summarize":          "recipe",
	}
	for _, it := range msg.items {
		if got := it.statusTag; got != wantTag[it.id] {
			t.Errorf("%s statusTag = %q, want %q", it.id, got, wantTag[it.id])
		}
	}

	wantDesc := map[string][]string{
		"toolsource/builtin": {"Built-in provides 1 tool"},
		"bash":               {"owned by utility", "asks first", "needs command"},
		"mcpserver/mcp_docs": {"ready", "offers tools"},
		"docs.search":        {"owned by docs", "asks first", "needs query", "tagged docs"},
		"mcpserver/mcp_web":  {"error", "offers tools, resources", "needs attention: token expired"},
		"fetch.url":          {"owned by web", "needs url"},
		"toolsource/recipe":  {"Recipes provide 1 tool"},
		"summarize":          {"owned by analysis", "tagged summary"},
	}
	for _, it := range msg.items {
		if strings.TrimSpace(it.desc) == "" {
			t.Errorf("%s list desc is empty, want dense metadata", it.id)
			continue
		}
		for _, want := range wantDesc[it.id] {
			if !strings.Contains(it.desc, want) {
				t.Errorf("%s list desc missing %q: %q", it.id, want, it.desc)
			}
		}
		if !strings.HasPrefix(it.id, "mcpserver/") {
			for _, rawLabel := range []string{"owner:", "permission:", "inputs:", "tags:"} {
				if strings.Contains(it.desc, rawLabel) {
					t.Errorf("%s list desc leaked backend label %q: %q", it.id, rawLabel, it.desc)
				}
			}
		}
		for _, repeated := range []string{"Run shell", "search docs", "GET a URL", "Summarize a file"} {
			if strings.Contains(it.desc, repeated) && it.id != "fallback" {
				t.Errorf("%s list desc should prefer metadata over prose, got %q", it.id, it.desc)
			}
		}
		for _, transport := range []string{"over stdio", "over http", " · stdio", " · http"} {
			if strings.Contains(it.desc, transport) || strings.Contains(it.inlineDesc, transport) {
				t.Errorf("%s compact list row should keep transport in detail view, found %q in desc=%q inline=%q", it.id, transport, it.desc, it.inlineDesc)
			}
		}
	}
}

func TestCatalogUnifiedTools_ShowsDisconnectedConnectionsWithoutTools(t *testing.T) {
	items := toolCatalogItems([]gact.Tool{{
		Name:        "bash",
		Source:      "builtin",
		Description: "Run shell",
	}}, []gact.McpServer{{
		ID:        "mcp_docs",
		Name:      "Docs",
		Status:    "error",
		Transport: "http",
		LastError: "connection refused",
		DeclaredCapabilities: gact.McpCapabilities{
			Tools: true,
		},
	}})

	if len(items) != 3 {
		t.Fatalf("items = %#v, want built-in group, bash, and disconnected MCP connection", items)
	}
	row := items[2]
	if row.id != "mcpserver/mcp_docs" || row.title != "MCP connection · Docs" {
		t.Fatalf("disconnected MCP row missing or wrong: %#v", row)
	}
	if row.statusTag != "disconnected" {
		t.Fatalf("disconnected MCP status = %q, want disconnected", row.statusTag)
	}
	for _, want := range []string{"disconnected", "tools", "repair needed"} {
		if !strings.Contains(row.inlineDesc, want) {
			t.Fatalf("disconnected MCP inline summary missing %q: %#v", want, row)
		}
	}
	if strings.Contains(row.inlineDesc, "connection refused") {
		t.Fatalf("disconnected MCP compact summary should keep raw error text in detail/description, got %#v", row)
	}
	for _, want := range []string{"error", "offers tools", "needs attention: connection refused"} {
		if !strings.Contains(row.desc, want) {
			t.Fatalf("disconnected MCP desc missing %q: %#v", want, row)
		}
	}
	if strings.Contains(row.inlineDesc, "0 tools") {
		t.Fatalf("disconnected MCP inline summary should not invent zero tool count: %#v", row)
	}
	if strings.Contains(row.inlineDesc, "http") || strings.Contains(row.desc, "over http") {
		t.Fatalf("disconnected MCP compact row should not expose transport: %#v", row)
	}
}

func TestCatalogMcpConnections_RenderSourceHealthAndCapabilities(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/mcp/servers" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"servers":[
			{"id":"mcp_ndp","name":"NDP","transport":"stdio","protocol_version":"2025-03-26","status":"ready","declared_capabilities":{"tools":true,"resources":{"subscribe":true},"prompts":{"list_changed":true}}},
			{"id":"mcp_docs","name":"Docs","transport":"http","protocol_version":"2025-03-26","status":"error","last_error":"connection refused","declared_capabilities":{"tools":true}}
		]}`))
	}))
	defer srv.Close()

	c := client.New(srv.URL)
	cmd := loadCatalogBrowserCmd(c, catalogKindMcp, client.RuntimeScope{})
	msg, ok := cmd().(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("cmd returned %T, want catalogBrowserLoadedMsg", cmd())
	}
	if msg.errText != "" {
		t.Fatalf("loader errored: %q", msg.errText)
	}
	if len(msg.items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(msg.items))
	}

	if msg.items[0].title != "NDP" || msg.items[0].statusTag != "connected" {
		t.Fatalf("first MCP row = %#v, want connected NDP row", msg.items[0])
	}
	for _, want := range []string{"ready", "MCP 2025-03-26", "offers tools, resources, prompts"} {
		if !strings.Contains(msg.items[0].desc, want) {
			t.Errorf("NDP desc missing %q: %q", want, msg.items[0].desc)
		}
	}
	if strings.Contains(msg.items[0].inlineDesc, "0 tools") {
		t.Errorf("MCP connection row should not invent a zero tool count when only support is known: %q", msg.items[0].inlineDesc)
	}
	if msg.items[1].statusTag != "disconnected" {
		t.Errorf("error server statusTag = %q, want disconnected", msg.items[1].statusTag)
	}
	if !strings.Contains(msg.items[1].desc, "needs attention: connection refused") {
		t.Errorf("error server desc should include compact error, got %q", msg.items[1].desc)
	}
	for _, rawLabel := range []string{"transport:", "protocol:", "provides:", "error:"} {
		for _, item := range msg.items {
			if strings.Contains(item.desc, rawLabel) {
				t.Errorf("%s MCP row desc leaked backend label %q: %q", item.id, rawLabel, item.desc)
			}
		}
	}
}

func TestCatalogUnifiedTools_EmptyStateIsOperatorFacing(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/tools":
			_, _ = w.Write([]byte(`{"tools":[]}`))
		case "/v1/mcp/servers":
			_, _ = w.Write([]byte(`{"servers":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	msg, ok := loadCatalogBrowserCmd(client.New(srv.URL), catalogKindTools, client.RuntimeScope{})().(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("loader returned unexpected message")
	}
	if len(msg.items) != 1 {
		t.Fatalf("empty tools catalog items = %#v", msg.items)
	}
	item := msg.items[0]
	for _, want := range []string{"No callable actions available", "Add an MCP connection", "enable a workflow blueprint", "add connection or blueprint"} {
		if !strings.Contains(item.title+" "+item.desc+" "+item.inlineDesc, want) {
			t.Fatalf("empty tools row missing %q: %#v", want, item)
		}
	}
	for _, unwanted := range []string{"No callable tools available", "backend returned", "built-in tools, recipes, extensions"} {
		if strings.Contains(item.title+" "+item.desc+" "+item.inlineDesc, unwanted) {
			t.Fatalf("empty tools row leaked backend-oriented copy %q: %#v", unwanted, item)
		}
	}

	hint := catalogBrowserHintText(&catalogBrowserState{kind: catalogKindTools, items: msg.items, sel: 0})
	for _, want := range []string{"no callable actions yet", "i add connection", "/agent-blueprints activate workflow"} {
		if !strings.Contains(hint, want) {
			t.Fatalf("empty tools hint missing %q: %q", want, hint)
		}
	}
	for _, unwanted := range []string{"Enter details/schema", "Space hide/show selected tool"} {
		if strings.Contains(hint, unwanted) {
			t.Fatalf("empty tools hint should not advertise unavailable action %q: %q", unwanted, hint)
		}
	}
}

func TestCatalogMcpConnections_CopyDistinguishesConnectionManagementFromTools(t *testing.T) {
	toolsIntro := catalogBrowserIntro(catalogKindTools)
	for _, want := range []string{
		"Actions and MCP in one operator view",
		"Connection rows show health",
		"indented tool rows show call policy and required inputs",
		"Use /mcp to add or repair connections",
	} {
		if !strings.Contains(toolsIntro, want) {
			t.Fatalf("tools intro missing %q: %q", want, toolsIntro)
		}
	}
	if strings.Contains(toolsIntro, "MCP rows") {
		t.Fatalf("tools intro should describe operator rows, not backend MCP rows: %q", toolsIntro)
	}
	if got := catalogBrowserTitle(catalogKindTools); got != "Actions and MCP" {
		t.Fatalf("tools catalog title = %q, want unified tools/MCP wording", got)
	}
	if got := catalogBrowserTitle(catalogKindMcp); got != "MCP Connections" {
		t.Fatalf("MCP catalog title = %q, want connection-management wording", got)
	}
	intro := catalogBrowserIntro(catalogKindMcp)
	for _, want := range []string{
		"Manage connections that supply tools, resources, and prompts",
		"Use /tools when you want the unified action inventory",
	} {
		if !strings.Contains(intro, want) {
			t.Fatalf("MCP intro missing %q: %q", want, intro)
		}
	}
	hint := catalogBrowserHintText(&catalogBrowserState{kind: catalogKindMcp})
	for _, want := range []string{
		"Enter detail",
		"add connection",
		"remove connection",
	} {
		if !strings.Contains(hint, want) {
			t.Fatalf("MCP hint missing %q: %q", want, hint)
		}
	}
}

func TestCatalogUnifiedTools_HintsUseOperatorConnectionAndGroupLanguage(t *testing.T) {
	groupHint := catalogBrowserHintText(&catalogBrowserState{
		kind:  catalogKindTools,
		sel:   0,
		items: []catalogItem{{id: "toolsource/builtin", title: "Built-in tools"}},
	})
	if !strings.Contains(groupHint, "Enter group summary") {
		t.Fatalf("tool group hint should describe a group summary: %q", groupHint)
	}
	if strings.Contains(groupHint, "source summary") {
		t.Fatalf("tool group hint should avoid source wording: %q", groupHint)
	}

	toolHint := catalogBrowserHintText(&catalogBrowserState{
		kind:  catalogKindTools,
		sel:   1,
		items: []catalogItem{{id: "toolsource/builtin", title: "Built-in tools"}, {id: "bash", title: "  └─ bash"}},
	})
	if !strings.Contains(toolHint, "Enter details") {
		t.Fatalf("tool row hint should describe tool details: %q", toolHint)
	}
	for _, unwanted := range []string{"group summary", "source summary", "details/schema"} {
		if strings.Contains(toolHint, unwanted) {
			t.Fatalf("tool row hint should avoid backend/generic wording %q: %q", unwanted, toolHint)
		}
	}

	connectionHint := catalogBrowserHintText(&catalogBrowserState{
		kind:  catalogKindTools,
		sel:   0,
		items: []catalogItem{{id: "mcpserver/fake-mcp", title: "MCP connection · fake-mcp"}},
	})
	if !strings.Contains(connectionHint, "Enter connection detail") {
		t.Fatalf("MCP row hint should describe connection detail: %q", connectionHint)
	}
}
