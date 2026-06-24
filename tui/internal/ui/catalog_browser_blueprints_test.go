package ui

import (
	"strings"
	"testing"
)

func TestCatalogBrowser_AgentBlueprintDetailActionsRenderOutsideStructureRows(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Seismic",
		blueprintID: "seismic",
		items: []catalogItem{
			{id: "activate", title: "Activate for current session"},
			{id: "blueprint/seismic", title: "Blueprint · Seismic", desc: "review waveforms"},
			{id: "blueprint-action/update", title: "Update installed blueprint"},
			{id: "blueprint-action/delete", title: "Delete installed blueprint"},
			{id: "agent/main", title: "Agent · Main"},
			{id: "mcp/earthscope", title: "MCP · EarthScope"},
		},
	}

	out := a.catalog.view()
	for _, want := range []string{"Blueprint actions", "activate", "update", "delete", "Workflow", "Blueprint · Seismic", "Agent · Main", "MCP · EarthScope"} {
		if !strings.Contains(out, want) {
			t.Fatalf("blueprint detail missing %q:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{"Activate for current session", "Update installed blueprint", "Delete installed blueprint"} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("blueprint action leaked into structure rows as %q:\n%s", unwanted, out)
		}
	}
}

func TestCatalogBrowser_AgentBlueprintExpertEnterOpensEmbeddedDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Seismic",
		blueprintID: "seismic",
		items: []catalogItem{{
			id:         "agent/analysis",
			title:      "└─ Analysis Expert",
			desc:       "reports to Main Expert · runs waveform statistics",
			inlineDesc: "tier 2 · 2 tools",
			statusTag:  "expert",
		}},
	}

	_, cmd := a.catalog.handleKey(keyMsg("enter"))
	if cmd != nil {
		t.Fatal("blueprint-scoped expert detail should not dispatch backend agent lookup")
	}
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("blueprint-scoped expert should open embedded detail")
	}
	if a.detail.ref.title != "Analysis Expert" ||
		!strings.Contains(a.detail.ref.fullText, "runs waveform statistics") {
		t.Fatalf("embedded expert detail = %#v", a.detail.ref)
	}
}

func TestCatalogBrowser_AgentBlueprintBlockedActivationButtonIsExplicit(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Broken",
		blueprintID: "broken",
		items: []catalogItem{
			{id: "validation", title: "Check · Validation errors", desc: "root expert not found", statusTag: "error"},
			{id: "activate", title: "Activate for current session", desc: "cannot activate until validation errors are resolved", statusTag: "blocked", disabled: true},
			{id: "blueprint/broken", title: "Blueprint · Broken"},
		},
	}

	out := stripANSI(a.catalog.view())
	if !strings.Contains(out, "Blueprint actions") || !strings.Contains(out, "activation blocked") {
		t.Fatalf("blocked activation should be explicit in action bar:\n%s", out)
	}
	if strings.Contains(out, " activate ") {
		t.Fatalf("blocked activation should not invite the user with an activate button:\n%s", out)
	}
}

func TestCatalogBrowser_ActiveAgentBlueprintActionReadsAsState(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Seismic",
		blueprintID: "seismic",
		items: []catalogItem{
			{id: "activate", title: "Active", statusTag: "active"},
			{id: "blueprint/seismic", title: "Blueprint · Seismic"},
			{id: "blueprint-action/update", title: "Update installed blueprint"},
			{id: "blueprint-action/delete", title: "Delete installed blueprint"},
			{id: "agent/main", title: "Agent · Main"},
		},
	}

	out := stripANSI(a.catalog.view())
	for _, want := range []string{"Blueprint actions", "update", "delete", "Blueprint status: Active"} {
		if !strings.Contains(out, want) {
			t.Fatalf("active blueprint detail missing %q:\n%s", want, out)
		}
	}
	for _, notWant := range []string{"active in selected session", "already active"} {
		if strings.Contains(out, notWant) {
			t.Fatalf("active blueprint detail should not repeat active prose %q:\n%s", notWant, out)
		}
	}
	for _, button := range a.agent.agentBlueprintDetailActionButtons() {
		if button.label == "active" || button.label == "activate" {
			t.Fatalf("active blueprint should render state outside action buttons, got button %#v", button)
		}
	}
	if strings.Contains(out, "a activate") || strings.Contains(out, "Active for current session") {
		t.Fatalf("active blueprint should not invite activation in controls or structure rows:\n%s", out)
	}
}

func TestCatalogBrowser_ActiveAgentBlueprintShortcutDoesNotReactivate(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Seismic",
		blueprintID: "seismic",
		items: []catalogItem{
			{id: "activate", title: "Active", statusTag: "active"},
			{id: "blueprint/seismic", title: "Blueprint · Seismic", statusTag: "active"},
			{id: "blueprint-action/update", title: "Update installed blueprint"},
			{id: "blueprint-action/delete", title: "Delete installed blueprint"},
		},
	}

	_, cmd := a.catalog.handleKey(keyMsg("a"))
	if cmd == nil {
		t.Fatal("active shortcut should produce a visible hint")
	}
	if !strings.Contains(a.transientHint, "already active") {
		t.Fatalf("active shortcut should not reactivate, hint = %q", a.transientHint)
	}
}

func TestCatalogBrowser_AgentBlueprintDetailHumanizesRenderedBackendEnums(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Demo",
		blueprintID: "demo",
		items: []catalogItem{
			{id: "activate", title: "Activate for current session"},
			{id: "hook/pre_message", title: "Before each user message", inlineDesc: "Before each user message · disabled · provided by agent blueprint", statusTag: "hook"},
			{id: "agent/data", title: "Data Root", inlineDesc: "tier 1 · 1 tool", statusTag: "root"},
		},
	}

	out := stripANSI(a.catalog.view())
	if strings.Contains(out, "agent_blueprint") {
		t.Fatalf("blueprint detail should not render raw backend source enums:\n%s", out)
	}
	if strings.Contains(out, "[agent blueprint]") {
		t.Fatalf("blueprint detail should not repeat backend source tags:\n%s", out)
	}
}
