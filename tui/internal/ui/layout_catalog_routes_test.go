package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"
)

// TestCatalogBrowser_CommandIDsRoute verifies palette command routing for the
// unified callable catalogs and non-catalog fallthrough commands.
func TestCatalogBrowser_CommandIDsRoute(t *testing.T) {
	cases := []struct {
		in       string
		wantOk   bool
		wantKind catalogBrowserKind
	}{
		{"/mcp", true, catalogKindMcp},
		{"/tools", true, catalogKindTools},
		{"/catalog", false, 0},
		{"/skills", true, catalogKindSkills},
		{"/prompts", true, catalogKindPrompts},
		{"/experts", true, catalogKindAgents},
		{"/agents-list", true, catalogKindAgents},
		{"/agent-blueprints", true, catalogKindAgentBlueprints},
		{"/blueprints", true, catalogKindAgentBlueprints},
		{"/clear", false, 0},
		{"/help", false, 0},
	}
	for _, c := range cases {
		kind, ok := catalogCommandForID(c.in)
		if ok != c.wantOk {
			t.Errorf("%s: ok=%v want %v", c.in, ok, c.wantOk)
		}
		if ok && kind != c.wantKind {
			t.Errorf("%s: kind=%d want %d", c.in, kind, c.wantKind)
		}
	}
}

// TestCatalogBrowser_OpenAndClose walks the state machine end-to-end.
func TestCatalogBrowser_OpenAndClose(t *testing.T) {
	a := newReadyApp(nil, nil)
	cmd := a.catalog.openKind(catalogKindTools)
	if !a.catalog.open {
		t.Fatalf("openCatalogBrowser didn't flip the flag")
	}
	if a.catalog.current.title != "Tools & MCP" {
		t.Fatalf("wrong title: %q", a.catalog.current.title)
	}
	if cmd == nil {
		t.Fatalf("no fetch cmd returned")
	}

	out, _ := a.Update(catalogBrowserLoadedMsg{
		kind:  catalogKindTools,
		items: []catalogItem{{id: "bash", title: "Bash", desc: "Run shell"}},
	})
	a = out.(*App)
	if a.catalog.current.loading {
		t.Fatalf("loading flag should be false after load")
	}
	if len(a.catalog.current.items) != 1 {
		t.Fatalf("items = %d, want 1", len(a.catalog.current.items))
	}

	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyEscape})
	a = out.(*App)
	if a.catalog.open {
		t.Fatalf("Esc didn't close catalog browser")
	}
}
