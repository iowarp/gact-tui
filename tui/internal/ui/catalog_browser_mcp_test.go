package ui

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestLoadMcpDetailIncludesOwningAgentContext(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/agents":
			_, _ = w.Write([]byte(`{"agents":[
					{"id":"data","source":"builtin","title":"Data expert","specialization":"data_analysis","tools":["adios_inspect_file"]}
				]}`))
		case "/v1/mcp/servers":
			_, _ = w.Write([]byte(`{"servers":[
					{"id":"mcp_adios","name":"ADIOS","status":"connected","transport":"stdio","capabilities":{"tools":["adios_inspect_file"]}}
				]}`))
		case "/v1/mcp/handshake":
			_, _ = w.Write([]byte(`{"servers":[]}`))
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
		t.Fatalf("items = %#v, want server overview and one tool row", loaded.items)
	}
	if loaded.items[0].id != "server/mcp_adios" || loaded.items[0].title != "Connection overview" || !strings.Contains(loaded.items[0].desc, "status: connected") {
		t.Fatalf("first MCP detail row = %#v, want source overview", loaded.items[0])
	}
	if !strings.Contains(loaded.items[0].inlineDesc, "connected") || strings.Contains(loaded.items[0].inlineDesc, "Connection health") {
		t.Fatalf("source overview inline summary = %q, want compact list preview", loaded.items[0].inlineDesc)
	}
	if loaded.items[1].title != "Tool · adios_inspect_file" || loaded.items[1].statusTag != "tool" {
		t.Fatalf("MCP tool row presentation = %#v, want operator tool label and status", loaded.items[1])
	}
	for _, want := range []string{"Inspect ADIOS containers", "agents: Data expert · data_analysis"} {
		if !strings.Contains(loaded.items[1].desc, want) {
			t.Fatalf("MCP tool row missing %q:\n%#v", want, loaded.items[1])
		}
	}
	for _, notWant := range []string{"MCP connection: mcp_adios", "server: mcp_adios", "visible to:"} {
		if strings.Contains(loaded.items[1].desc, notWant) {
			t.Fatalf("MCP tool row leaked backend label %q:\n%#v", notWant, loaded.items[1])
		}
	}
}

func TestOpenMcpDetailNormalizesPrefixedSourceTitles(t *testing.T) {
	a := newReadyApp(nil, nil)
	_ = a.catalog.openMcpDetail("mcp_fake", "MCP connection · fake-mcp")
	if a.catalog.current == nil || a.catalog.current.title != "MCP · fake-mcp" {
		t.Fatalf("MCP detail title = %#v, want normalized source name", a.catalog.current)
	}

	a = newReadyApp(nil, nil)
	_ = a.catalog.openMcpDetail("mcp_fake", "MCP tools · fake-mcp")
	if a.catalog.current == nil || a.catalog.current.title != "MCP · fake-mcp" {
		t.Fatalf("MCP tools detail title = %#v, want normalized source name", a.catalog.current)
	}
}

func TestFormatMcpServerSummaryUsesConnectionWording(t *testing.T) {
	out := formatMcpServerSummary(gact.McpServer{
		ID:              "mcp_docs",
		Name:            "Docs",
		Status:          "ready",
		Transport:       "stdio",
		ProtocolVersion: "2025-03-26",
		ServerInfo:      map[string]any{"name": "docs", "version": "1.0.0"},
		DeclaredCapabilities: gact.McpCapabilities{
			Tools:     true,
			Resources: &gact.McpResourcesCapability{},
			Prompts:   &gact.McpPromptsCapability{},
		},
	})

	for _, want := range []string{
		"Operator summary",
		"connection: Docs",
		"status: ready",
		"provides: callable tools, resources, prompts",
		"manage: open /mcp to add, reconnect, or remove this connection",
		"tool access: open /tools to see callable actions from eligible connections and workflows",
		"resources and prompts: listed below when this connection exposes them",
		"Technical details",
		"id: mcp_docs",
		"MCP protocol: 2025-03-26",
		"server:",
		"name: docs",
		"version: 1.0.0",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("MCP summary missing %q:\n%s", want, out)
		}
	}
	for _, raw := range []string{"press r", "press d", "press Enter"} {
		if strings.Contains(out, raw) {
			t.Fatalf("MCP summary should keep keypresses in footer/actions, found %q:\n%s", raw, out)
		}
	}
	for _, raw := range []string{"Status and capabilities", "Operator paths", "Connection status", "Available capabilities", "Source health", "source id:", "source info:", "server info:", "\n  protocol:"} {
		if strings.Contains(out, raw) {
			t.Fatalf("MCP summary leaked old/backend label %q:\n%s", raw, out)
		}
	}
}

func TestMcpDetailSeparatesManagementFromCapabilityRows(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 140
	a.height = 36
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · docs",
		mcpServerID: "mcp_docs",
		items: []catalogItem{
			{id: "server/mcp_docs", title: "Connection overview", desc: "status: ready", statusTag: "ready"},
			{id: "tool/read_file", title: "Tool · read_file", desc: "Read a file from the workspace", statusTag: "tool"},
		},
	}

	out := stripANSI(a.catalog.view())
	for _, want := range []string{"Connection capabilities", "Connection overview", "Tool · read_file", "r reconnect"} {
		if !strings.Contains(out, want) {
			t.Fatalf("MCP detail missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "Connection controls") || strings.Contains(out, "button:mcp:reconnect") || strings.Contains(out, "Management") || strings.Contains(out, "Server and capabilities") {
		t.Fatalf("MCP detail should not present reconnect as modal content:\n%s", out)
	}
	if strings.Contains(out, "Reconnect server") {
		t.Fatalf("MCP detail leaked reconnect as a content row:\n%s", out)
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
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · docs",
		mcpServerID: "mcp_docs",
		items:       []catalogItem{{id: "tool/read_file", title: "Tool · read_file"}},
	}

	_, cmd := a.catalog.handleKey(keyMsg("r"))
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
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · docs",
		mcpServerID: "mcp_docs",
	}

	model, cmd := a.Update(mcpReconnectDoneMsg{serverID: "mcp_docs"})
	a = model.(*App)
	if !strings.Contains(a.transientHint, "MCP connection reconnected: mcp_docs") {
		t.Fatalf("success hint = %q", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("success should schedule hint expiry and refresh MCP state")
	}

	model, cmd = a.Update(mcpReconnectDoneMsg{serverID: "mcp_docs", err: errors.New("probe failed")})
	a = model.(*App)
	if !strings.Contains(a.transientHint, "MCP reconnect failed: probe failed") {
		t.Fatalf("failure hint = %q", a.transientHint)
	}
	if strings.Contains(a.transientHint, "gact:") {
		t.Fatalf("failure hint should not leak transport wrapper: %q", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("failure should schedule hint expiry")
	}
}

func TestCatalogBrowser_EnterOnMcpResourceLoadsResourceDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · docs",
		mcpServerID: "docs",
		items:       []catalogItem{{id: "res/" + "file://resource", title: "Resource · resource"}},
	}

	_, cmd := a.catalog.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})

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
		"media type: text/markdown",
		"text:",
		"first line",
		"second line",
		"uri: content[1]",
		"base64 data: 8 bytes encoded",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("resource detail missing %q:\n%s", want, out)
		}
	}
}
