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
		"workflow area: utility",
		"available to: chat, utility",
		"used by:",
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
		"Operator summary",
		"comes from: MCP",
		"connection: mcp_shell",
		"workflow area: utility",
		"available to: chat, planner, utility",
		"used by:",
		"Utility Expert · utility",
		"tagged: shell, diagnostic",
		"approval needed: ask",
		"Inputs",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("tool detail missing %q:\n%s", want, out)
		}
	}
	for _, notWant := range []string{"  source: mcp", "owner: utility", "visible to:", "owning agents:", "permission: ask", "server: mcp_shell", "provider:", "domain:", "approval:"} {
		if strings.Contains(out, notWant) {
			t.Fatalf("tool detail leaked backend label %q:\n%s", notWant, out)
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
		"Safety",
		"label: Run shell command",
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
	a.catalog.disabledTools = map[string]bool{"bash": true}
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{
			{id: "bash", title: "bash", desc: "shell"},
			{id: "read_file", title: "read_file", desc: "read"},
		},
	}
	a.width = 100
	a.height = 30
	out := a.catalog.view()
	if !strings.Contains(out, "(disabled)") {
		t.Errorf("expected '(disabled)' in render of disabled tool, got: %q", out)
	}
}

func TestCatalogBrowserCompactsMultilineDescriptions(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
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

	out := stripANSI(a.catalog.view())
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
			desc:      "asks first · needs path",
			statusTag: "builtin",
		}
	}
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: items,
	}
	a.width = 120
	a.height = 36

	out := stripANSI(a.catalog.view())
	if !strings.Contains(out, "tool-19") {
		t.Fatalf("tool catalog should fit all short metadata rows inline:\n%s", out)
	}
	if !strings.Contains(out, "tool-0  [built-in]  asks first") {
		t.Fatalf("tool catalog should render metadata on the title row:\n%s", out)
	}
}

func TestCatalogBrowserToolsHintDistinguishesSourceRowsFromToolRows(t *testing.T) {
	cb := &catalogBrowserState{
		kind: catalogKindTools,
		items: []catalogItem{
			{id: "bash", title: "bash", statusTag: "builtin"},
			{id: "mcpserver/fake-mcp", title: "MCP tools · fake-mcp", statusTag: "connected"},
			{id: "fetch", title: "  └─ fetch", statusTag: "fake-mcp"},
		},
	}

	cb.sel = 0
	toolHint := catalogBrowserHintText(cb)
	if !strings.Contains(toolHint, "Enter details") || !strings.Contains(toolHint, "Space hide/show selected tool") {
		t.Fatalf("tool row hint should explain detail and local visibility, got %q", toolHint)
	}

	cb.sel = 1
	sourceHint := catalogBrowserHintText(cb)
	for _, want := range []string{"Enter connection detail", "r reconnect", "i add connection", "d remove connection"} {
		if !strings.Contains(sourceHint, want) {
			t.Fatalf("MCP connection row hint missing %q: %q", want, sourceHint)
		}
	}
}

func TestCatalogBrowserToolsSourceRowsExposeMcpManagement(t *testing.T) {
	var reconnects int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/mcp/servers/fake-mcp/reconnect":
			reconnects++
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && r.URL.Path == "/v1/mcp/servers":
			_, _ = w.Write([]byte(`{"servers":[{"id":"fake-mcp","name":"fake-mcp","transport":"stdio","status":"ready","builtin":false}]}`))
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	newCatalogApp := func() *App {
		a := NewWithTheme(server.URL, ThemeForMode(ModeDark))
		a.stage = StageReady
		a.catalog.open = true
		a.catalog.current = &catalogBrowserState{
			kind: catalogKindTools,
			sel:  1,
			items: []catalogItem{
				{id: "bash", title: "Tool · bash"},
				{id: "mcpserver/fake-mcp", title: "MCP · fake-mcp"},
				{id: "fetch", title: "  └─ Tool · fetch"},
			},
		}
		return a
	}

	a := newCatalogApp()
	model, cmd := a.catalog.handleKey(tea.KeyPressMsg{Code: 'r', Text: "r"})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("r on a Tools & MCP source row should dispatch reconnect")
	}
	done, ok := cmd().(mcpReconnectDoneMsg)
	if !ok || done.err != nil || done.serverID != "fake-mcp" || reconnects != 1 {
		t.Fatalf("reconnect result=%#v reconnects=%d", done, reconnects)
	}
	if !a.catalog.open {
		t.Fatal("reconnect should keep the catalog open behind the result toast")
	}

	a = newCatalogApp()
	model, cmd = a.catalog.handleKey(tea.KeyPressMsg{Code: 'i', Text: "i"})
	a = model.(*App)
	if cmd != nil || !a.mcpInstall.open || a.catalog.open {
		t.Fatalf("i should open MCP install modal from unified catalog, install=%v catalog=%v cmd=%v", a.mcpInstall.open, a.catalog.open, cmd)
	}

	a = newCatalogApp()
	model, cmd = a.catalog.handleKey(tea.KeyPressMsg{Code: 'd', Text: "d"})
	a = model.(*App)
	if cmd == nil || !a.mcpRemove.open || a.catalog.open {
		t.Fatalf("d should open MCP remove picker from unified source row, remove=%v catalog=%v cmd=%v", a.mcpRemove.open, a.catalog.open, cmd)
	}
	if msg := cmd(); msg == nil {
		t.Fatal("remove picker should fetch removable MCP connections")
	}
}
