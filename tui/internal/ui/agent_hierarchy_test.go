package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestAgentHierarchySidebarModuleRendersParentChildAgents(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionAgents
	a.sidebarSectionCursor = false
	a.SetSidebarLayout([]string{"agents"}, nil)
	a.sessions = []gact.Session{{ID: "s1", Agent: gact.AgentRef{ID: "orchestrator"}}}
	a.selected = 0
	a.agentHierarchyAgents = []gact.AgentDef{
		{ID: "orchestrator", Title: "Orchestrator", Source: "builtin", Tier: 1},
		{ID: "data", Title: "Data expert", Source: "builtin", ParentID: "orchestrator", Tier: 2, Specialization: "data"},
		{ID: "ndp_catalog", Title: "NDP catalog", Source: "builtin", ParentID: "data", Tier: 3, Specialization: "catalog"},
		{ID: "skill.readme", Title: "Readme Skill", Source: "skill"},
	}

	out := ansi.Strip(a.renderSidebar(42, 20))
	for _, want := range []string{"AGENTS", "• Orchestrator", "└─ Data expert", "└─ NDP catalog"} {
		if !strings.Contains(out, want) {
			t.Fatalf("agent hierarchy missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "Readme Skill") {
		t.Fatalf("skill agents should not pollute agent hierarchy:\n%s", out)
	}
}

func TestAgentHierarchyMouseClickOpensAgentDetail(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionAgents
	a.sidebarSectionCursor = false
	a.SetSidebarLayout([]string{"agents"}, nil)
	a.agentHierarchyAgents = []gact.AgentDef{{ID: "data", Title: "Data expert", Source: "builtin"}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:agents:item:0")
	if !ok {
		t.Fatal("missing agent hierarchy hit target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: target.rect.x, Y: target.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if !a.catalogBrowserOpen || a.catalogBrowser == nil || a.catalogBrowser.agentID != "data" {
		t.Fatalf("agent click should open detail, open=%v browser=%+v", a.catalogBrowserOpen, a.catalogBrowser)
	}
}

func TestAgentHierarchySidebarSurfacesRuntimeProvenanceState(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionAgents
	a.sidebarSectionCursor = false
	a.SetSidebarLayout([]string{"agents"}, nil)
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0
	a.agentHierarchyAgents = []gact.AgentDef{
		{ID: "data", Title: "Data expert", Source: "builtin", Tier: 2},
		{ID: "ndp_catalog", Title: "NDP catalog", Source: "builtin", ParentID: "data", Tier: 3},
	}
	a.messages = []gact.Message{{
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

	out := ansi.Strip(a.renderSidebar(42, 20))
	for _, want := range []string{"Data expert", "t2 · observed", "NDP catalog", "t3 · active"} {
		if !strings.Contains(out, want) {
			t.Fatalf("agent runtime state missing %q:\n%s", want, out)
		}
	}
}

func TestAgentHierarchyFinalRuntimeProvenanceDoesNotKeepStartedRowsLive(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionAgents
	a.sidebarSectionCursor = false
	a.SetSidebarLayout([]string{"agents"}, nil)
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0
	a.agentHierarchyAgents = []gact.AgentDef{
		{ID: "default", Title: "Default Agent", Source: "builtin"},
		{ID: "data_expert", Title: "Data Expert", Source: "builtin", Tier: 2},
	}
	a.messages = []gact.Message{{
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

	out := ansi.Strip(a.renderSidebar(42, 20))
	if strings.Contains(out, "Default Agent live") {
		t.Fatalf("final runtime provenance should not leave parent live:\n%s", out)
	}
	for _, want := range []string{"Default Agent observed", "Data Expert", "t2 · active"} {
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
	a.sidebarSectionFocus = sidebarSectionAgents
	a.sidebarSectionCursor = false
	a.SetSidebarLayout([]string{"agents"}, nil)
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0
	a.agentHierarchyAgents = []gact.AgentDef{
		{ID: "data", Title: "Data expert", Source: "builtin", Tier: 2},
		{ID: "ndp_catalog", Title: "NDP catalog", Source: "builtin", ParentID: "data", Tier: 3},
	}

	a.applySSE(client.SSEEvent{
		Type: "semantic.event",
		Payload: map[string]any{"payload": map[string]any{
			"session_id": "s1",
			"turn_id":    "turn_1",
			"event_type": "delegation.started",
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

	out := ansi.Strip(a.renderSidebar(42, 20))
	for _, want := range []string{"Data expert", "t2 · live", "NDP catalog", "t3 · live"} {
		if !strings.Contains(out, want) {
			t.Fatalf("agent live state missing %q:\n%s", want, out)
		}
	}
}
