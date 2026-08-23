package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func TestAgentHierarchySidebarSurfacesRuntimeProvenanceState(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionAgents
	a.sidebar.sectionCursor = false
	a.sidebar.SetLayout([]string{"agents"}, nil)
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.agent.hierarchyAgents = []gact.AgentDef{
		{ID: "data", Title: "Data expert", Source: "builtin", Tier: 2},
		{ID: "ndp_catalog", Title: "NDP catalog", Source: "builtin", ParentID: "data", Tier: 3},
	}
	a.conversation.messages = []gact.Message{{
		ID:        "m1",
		SessionID: "s1",
		Role:      gact.RoleAssistant,
		Metadata: map[string]any{"runtime_provenance": map[string]any{
			"agent": map[string]any{
				"active_expert_id": "ndp_catalog",
				"parent_id":        "data",
			},
			"delegation": map[string]any{"events": []any{
				map[string]any{"stage": "delegate.completed", "parent_id": "data", "agent_id": "ndp_catalog"},
				map[string]any{"stage": "parent.resumed", "parent_id": "data", "agent_id": "ndp_catalog"},
			}},
		}},
	}}

	out := ansi.Strip(a.sidebar.render(42, 20))
	for _, want := range []string{"T2 1 Data expert observed", "T3 1.1 NDP catalog active"} {
		if !strings.Contains(out, want) {
			t.Fatalf("agent runtime state missing %q:\n%s", want, out)
		}
	}
}

func TestAgentHierarchySidebarMatchesNestedSemanticAgentReferences(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 140
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionAgents
	a.sidebar.sectionCursor = false
	a.sidebar.SetLayout([]string{"agents"}, nil)
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.agent.hierarchyAgents = []gact.AgentDef{
		{ID: "orchestrator", Title: "Orchestrator", Source: "builtin", Tier: 1},
		{ID: "ndp_catalog", Title: "NDP catalog", Source: "builtin", ParentID: "orchestrator", Tier: 3},
	}
	a.conversation.messages = []gact.Message{{
		ID:        "m1",
		SessionID: "s1",
		Role:      gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:   "p1",
			Type: gact.PartTypeText,
			Metadata: map[string]any{"raw_event": map[string]any{
				"event_type": "tool.call.started",
				"status":     "running",
				"actor": map[string]any{
					"kind": "agent",
					"agent": map[string]any{
						"id": "ndp_catalog",
					},
				},
				"payload": map[string]any{
					"delegation": map[string]any{
						"path": []any{
							map[string]any{"agent_id": "orchestrator"},
							map[string]any{"agent_id": "ndp_catalog"},
						},
					},
				},
			}},
		}},
	}}

	out := ansi.Strip(a.sidebar.render(58, 20))
	if !strings.Contains(out, "T3 1.1 NDP catalog live") {
		t.Fatalf("nested semantic event should mark child agent live:\n%s", out)
	}
}

func TestAgentHierarchyFinalRuntimeProvenanceDoesNotKeepStartedRowsLive(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionAgents
	a.sidebar.sectionCursor = false
	a.sidebar.SetLayout([]string{"agents"}, nil)
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.agent.hierarchyAgents = []gact.AgentDef{
		{ID: "default", Title: "Default Agent", Source: "builtin"},
		{ID: "data_expert", Title: "Data Expert", Source: "builtin", Tier: 2},
	}
	a.conversation.messages = []gact.Message{{
		ID:        "m1",
		SessionID: "s1",
		Role:      gact.RoleAssistant,
		Metadata: map[string]any{"runtime_provenance": map[string]any{
			"agent": map[string]any{"active_expert_id": "data_expert"},
			"delegation": map[string]any{"events": []any{
				map[string]any{"stage": "delegate.started", "parent_id": "default", "agent_id": "data_expert"},
				map[string]any{"stage": "delegate.completed", "parent_id": "default", "agent_id": "data_expert"},
				map[string]any{"stage": "parent.resumed", "parent_id": "default", "agent_id": "data_expert"},
			}},
		}},
	}}

	out := ansi.Strip(a.sidebar.render(42, 20))
	if strings.Contains(out, "Default Agent live") {
		t.Fatalf("final runtime provenance should not leave parent live:\n%s", out)
	}
	for _, want := range []string{"T1 2 Default Agent observed", "T2 1 Data Expert active"} {
		if !strings.Contains(out, want) {
			t.Fatalf("final runtime provenance state missing %q:\n%s", want, out)
		}
	}
}

func TestAgentHierarchySidebarSurfacesLiveSemanticDelegation(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionAgents
	a.sidebar.sectionCursor = false
	a.sidebar.SetLayout([]string{"agents"}, nil)
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.agent.hierarchyAgents = []gact.AgentDef{
		{ID: "data", Title: "Data expert", Source: "builtin", Tier: 2},
		{ID: "ndp_catalog", Title: "NDP catalog", Source: "builtin", ParentID: "data", Tier: 3},
	}

	a.conversation.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "blueprint.delegation.started",
			"status":     "running",
			"actor":      map[string]any{"agent_id": "data", "role": "parent_expert"},
			"subject":    map[string]any{"agent_id": "ndp_catalog", "role": "child_expert"},
			"payload": map[string]any{
				"stage":     "delegate.started",
				"parent_id": "data",
				"agent_id":  "ndp_catalog",
			},
		}},
	})

	out := ansi.Strip(a.sidebar.render(42, 20))
	for _, want := range []string{"T2 1 Data expert live", "T3 1.1 NDP catalog live"} {
		if !strings.Contains(out, want) {
			t.Fatalf("agent live state missing %q:\n%s", want, out)
		}
	}
}

func TestAgentHierarchyFinalRuntimeProvenanceSettlesPriorLiveSemanticDelegation(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 140
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionAgents
	a.sidebar.sectionCursor = false
	a.sidebar.SetLayout([]string{"agents"}, nil)
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.agent.hierarchyAgents = []gact.AgentDef{
		{ID: "data", Title: "Data expert", Source: "builtin", Tier: 2},
		{ID: "ndp_catalog", Title: "NDP catalog", Source: "builtin", ParentID: "data", Tier: 3},
	}

	a.conversation.applySSE(client.SSEEvent{
		ID:   "live-delegation",
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "s1",
			"trace_id":   "trace_1",
			"turn_id":    "turn_1",
			"event_type": "blueprint.delegation.started",
			"status":     "running",
			"actor":      map[string]any{"agent_id": "data", "role": "parent_expert"},
			"subject":    map[string]any{"agent_id": "ndp_catalog", "role": "child_expert"},
			"payload": map[string]any{
				"stage":     "delegate.started",
				"parent_id": "data",
				"agent_id":  "ndp_catalog",
			},
		}},
	})

	liveOut := ansi.Strip(a.sidebar.render(58, 20))
	for _, want := range []string{"T2 1 Data expert live", "T3 1.1 NDP catalog live"} {
		if !strings.Contains(liveOut, want) {
			t.Fatalf("live semantic delegation missing %q:\n%s", want, liveOut)
		}
	}

	a.conversation.messages = append(a.conversation.messages, gact.Message{
		ID:        "final",
		SessionID: "s1",
		Role:      gact.RoleAssistant,
		Metadata: map[string]any{"runtime_provenance": map[string]any{
			"turn": map[string]any{
				"trace_id": "trace_1",
				"turn_id":  "turn_1",
				"status":   "completed",
			},
			"agent": map[string]any{
				"active_expert_id": "ndp_catalog",
				"parent_id":        "data",
			},
			"tools": map[string]any{
				"observed": []any{map[string]any{
					"name":   "ndp_search_datasets",
					"status": "success",
				}},
			},
			"delegation": map[string]any{"events": []any{
				map[string]any{"stage": "delegate.started", "parent_id": "data", "agent_id": "ndp_catalog"},
				map[string]any{"stage": "delegate.completed", "parent_id": "data", "agent_id": "ndp_catalog"},
				map[string]any{"stage": "parent.resumed", "parent_id": "data", "agent_id": "ndp_catalog"},
			}},
		}},
	})

	settledOut := ansi.Strip(a.sidebar.render(58, 20))
	for _, want := range []string{"T2 1 Data expert observed", "T3 1.1 NDP catalog active"} {
		if !strings.Contains(settledOut, want) {
			t.Fatalf("final runtime provenance should settle live semantic state, missing %q:\n%s", want, settledOut)
		}
	}
	if strings.Contains(settledOut, "T2 1 Data expert live") || strings.Contains(settledOut, "T3 1.1 NDP catalog live") {
		t.Fatalf("older live semantic state should not outrank newer final provenance:\n%s", settledOut)
	}

	detail := runtimeProvenanceDetailText(valuefmt.MapValue(a.conversation.messages[len(a.conversation.messages)-1].Metadata["runtime_provenance"]))
	for _, want := range []string{"trace: trace_1", "observed: ndp_search_datasets", "delegate.completed", "parent.resumed"} {
		if !strings.Contains(detail, want) {
			t.Fatalf("final runtime provenance detail missing agreement evidence %q:\n%s", want, detail)
		}
	}
}
