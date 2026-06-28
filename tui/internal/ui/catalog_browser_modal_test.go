package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"
)

// TestToggleToolDisabled_persists toggles a tool id and verifies the
// disabled set updates + SaveConfig fires.
func TestToggleToolDisabled_persists(t *testing.T) {
	a := newReadyApp(nil, nil)
	saves := 0
	a.SaveConfig = func() error { saves++; return nil }

	a.catalog.toggleToolDisabled("bash")
	if !a.catalog.disabledTools["bash"] {
		t.Errorf("expected bash disabled after first toggle")
	}
	if saves != 1 {
		t.Errorf("expected 1 SaveConfig call, got %d", saves)
	}
	a.catalog.toggleToolDisabled("bash")
	if a.catalog.disabledTools["bash"] {
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
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{{id: "bash", title: "bash", desc: "shell"}},
		sel:   0,
	}
	_, _ = a.catalog.handleKey(tea.KeyPressMsg{Code: ' ', Text: " "})
	if !a.catalog.disabledTools["bash"] {
		t.Errorf("space did not disable bash; disabledTools=%v", a.catalog.disabledTools)
	}
	if saves != 1 {
		t.Errorf("expected 1 save after toggle, got %d", saves)
	}
}

// TestCatalogBrowser_EscPopsMcpDetail: when a parent state is set,
// esc returns to the parent rather than closing the modal.
func TestCatalogBrowser_EscPopsMcpDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	parent := &catalogBrowserState{kind: catalogKindMcp, title: "MCP Connections"}
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · fake",
		mcpServerID: "fake",
		parent:      parent,
	}
	_, _ = a.catalog.handleKey(tea.KeyPressMsg{Code: tea.KeyEscape})
	if !a.catalog.open {
		t.Errorf("esc closed the modal; should have popped to parent")
	}
	if a.catalog.current != parent {
		t.Errorf("esc did not restore parent state")
	}
}

func TestCatalogBrowser_EscapeClosesTopLevelToolsCatalog(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools & MCP",
		items: []catalogItem{{id: "mcpserver/fake-mcp", title: "MCP · fake-mcp"}},
	}

	_, _ = a.catalog.handleKey(tea.KeyPressMsg{Code: tea.KeyEscape})

	if a.catalog.open || a.catalog.current != nil {
		t.Fatalf("escape should close top-level tools catalog, open=%v browser=%#v", a.catalog.open, a.catalog.current)
	}
}

func TestCatalogBrowser_SlashClosesCatalogAndStartsCommandInput(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.focus = FocusBody
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools & MCP",
		items: []catalogItem{{id: "mcpserver/fake-mcp", title: "MCP · fake-mcp"}},
	}

	_, _ = a.catalog.handleKey(tea.KeyPressMsg{Code: '/', Text: "/"})

	if a.catalog.open || a.catalog.current != nil {
		t.Fatalf("slash should close catalog, open=%v browser=%#v", a.catalog.open, a.catalog.current)
	}
	if a.focus != FocusInput {
		t.Fatalf("slash should focus input, got %v", a.focus)
	}
	if got := a.inputComposer.input.Value(); got != "/" {
		t.Fatalf("slash should seed command input, got %q", got)
	}
}

// TestCatalogBrowserTitle_AgentsAndDetail: new kinds get titles.
func TestCatalogBrowserTitle_AgentsAndDetail(t *testing.T) {
	cases := map[catalogBrowserKind]string{
		catalogKindMcp:         "MCP Connections",
		catalogKindTools:       "Tools & MCP",
		catalogKindSkills:      "Skills",
		catalogKindMcpDetail:   "MCP detail",
		catalogKindAgentDetail: "Agent detail",
		catalogKindAgents:      "Experts",
	}
	for k, want := range cases {
		if got := catalogBrowserTitle(k); got != want {
			t.Errorf("kind %d: title=%q, want %q", k, got, want)
		}
	}
}
