package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

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
