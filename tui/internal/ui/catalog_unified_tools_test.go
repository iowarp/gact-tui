package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// HHHHH1: catalogKindTools loads /v1/tools and renders BOTH built-in
// and MCP-sourced tools in one list, sorted by (source, name), with
// each row tagged by source and MCP rows showing the originating
// server id in the description. Verifies the user's "tools and mcps
// were meant to be the same menu" feedback is honoured: a single
// menu shows everything the agent can call.
func TestCatalogUnifiedTools_RendersAllSources(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/tools" {
			http.NotFound(w, r)
			return
		}
		// Three sources: a built-in `bash`, two MCP-exposed tools
		// (one each from two servers), and a recipe. Returned in a
		// scrambled order so the loader's sort is exercised.
		_, _ = w.Write([]byte(`{"tools":[
			{"name":"docs.search","source":"mcp","server_id":"mcp_docs","description":"search docs"},
			{"name":"bash","source":"builtin","description":"Run shell"},
			{"name":"summarize","source":"recipe","description":"Summarize a file"},
			{"name":"fetch.url","source":"mcp","server_id":"mcp_web","description":"GET a URL"}
		]}`))
	}))
	defer srv.Close()

	c := client.New(srv.URL)
	cmd := loadCatalogBrowserCmd(c, catalogKindTools)
	msg, ok := cmd().(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("cmd returned %T, want catalogBrowserLoadedMsg", cmd())
	}
	if msg.errText != "" {
		t.Fatalf("loader errored: %q", msg.errText)
	}
	if len(msg.items) != 4 {
		t.Fatalf("expected 4 items, got %d", len(msg.items))
	}

	// Sort: builtin → mcp → recipe (alphabetical on source).
	wantOrder := []string{"bash", "docs.search", "fetch.url", "summarize"}
	for i, want := range wantOrder {
		if msg.items[i].id != want {
			t.Errorf("items[%d].id = %q, want %q", i, msg.items[i].id, want)
		}
	}

	// Every row tagged with its source.
	wantTag := map[string]string{
		"bash":        "builtin",
		"docs.search": "mcp",
		"fetch.url":   "mcp",
		"summarize":   "recipe",
	}
	for _, it := range msg.items {
		if got := it.statusTag; got != wantTag[it.id] {
			t.Errorf("%s statusTag = %q, want %q", it.id, got, wantTag[it.id])
		}
	}

	// MCP rows surface the server id in the desc.
	for _, it := range msg.items {
		if it.id == "docs.search" && !strings.Contains(it.desc, "mcp_docs") {
			t.Errorf("docs.search desc missing server id: %q", it.desc)
		}
		if it.id == "fetch.url" && !strings.Contains(it.desc, "mcp_web") {
			t.Errorf("fetch.url desc missing server id: %q", it.desc)
		}
		// Built-in row has no server id and shouldn't gain a "from" tag.
		if it.id == "bash" && strings.Contains(it.desc, "from ") {
			t.Errorf("bash desc shouldn't carry an MCP origin: %q", it.desc)
		}
	}
}
