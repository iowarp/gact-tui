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

func TestAgentHierarchySidebarMatchesNestedSemanticAgentReferences(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 140
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionAgents
	a.sidebarSectionCursor = false
	a.SetSidebarLayout([]string{"agents"}, nil)
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0
	a.agentHierarchyAgents = []gact.AgentDef{
		{ID: "orchestrator", Title: "Orchestrator", Source: "builtin", Tier: 1},
		{ID: "ndp_catalog", Title: "NDP catalog", Source: "builtin", ParentID: "orchestrator", Tier: 3},
	}
	a.messages = []gact.Message{{
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

	out := ansi.Strip(a.renderSidebar(58, 20))
	if !strings.Contains(out, "NDP catalog") || !strings.Contains(out, "t3 · live") {
		t.Fatalf("nested semantic event should mark child agent live:\n%s", out)
	}
}

func TestAgentHierarchySidebarSurfacesSkillsAndValidationState(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 180
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionAgents
	a.sidebarSectionCursor = false
	a.SetSidebarLayout([]string{"agents"}, nil)
	a.agentHierarchyAgents = []gact.AgentDef{{
		ID:                 "data",
		Title:              "Data expert",
		Source:             "agent_blueprint",
		Tier:               2,
		Skills:             []string{"python", "ndp", "adios"},
		ValidationWarnings: []string{"skill ndp resolved from community source"},
		ValidationErrors:   []string{"missing skill: adios"},
	}}

	out := ansi.Strip(a.renderSidebar(150, 20))
	for _, want := range []string{"Data expert", "t2 · agent_blueprint", "skills: python, ndp, +1 more", "warnings: skill ndp", "errors: missing"} {
		if !strings.Contains(out, want) {
			t.Fatalf("agent hierarchy missing %q:\n%s", want, out)
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

	out := ansi.Strip(a.renderSidebar(42, 20))
	for _, want := range []string{"Data expert", "t2 · live", "NDP catalog", "t3 · live"} {
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

	liveOut := ansi.Strip(a.renderSidebar(58, 20))
	for _, want := range []string{"Data expert", "t2 · live", "NDP catalog", "t3 · live"} {
		if !strings.Contains(liveOut, want) {
			t.Fatalf("live semantic delegation missing %q:\n%s", want, liveOut)
		}
	}

	a.messages = append(a.messages, gact.Message{
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

	settledOut := ansi.Strip(a.renderSidebar(58, 20))
	for _, want := range []string{"Data expert", "t2 · observed", "NDP catalog", "t3 · active"} {
		if !strings.Contains(settledOut, want) {
			t.Fatalf("final runtime provenance should settle live semantic state, missing %q:\n%s", want, settledOut)
		}
	}
	if strings.Contains(settledOut, "t2 · live") || strings.Contains(settledOut, "t3 · live") {
		t.Fatalf("older live semantic state should not outrank newer final provenance:\n%s", settledOut)
	}

	detail := runtimeProvenanceDetailText(mapValue(a.messages[len(a.messages)-1].Metadata["runtime_provenance"]))
	for _, want := range []string{"trace_id: trace_1", "observed: ndp_search_datasets", "delegate.completed", "parent.resumed"} {
		if !strings.Contains(detail, want) {
			t.Fatalf("final runtime provenance detail missing agreement evidence %q:\n%s", want, detail)
		}
	}
}

func TestSessionSidebarSurfacesActiveAgentBlueprintScope(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionSessions
	a.sidebarSectionCursor = false
	a.SetSidebarLayout([]string{"sessions"}, nil)
	a.sessions = []gact.Session{{
		ID:     "s1",
		Title:  "Blueprint session",
		Status: gact.StatusIdle,
		Metadata: map[string]any{
			"active_agent_blueprint_id":    "seismic-market",
			"active_agent_blueprint_scope": "session",
		},
	}}
	a.selected = 0

	out := ansi.Strip(a.renderSidebar(72, 20))
	if !strings.Contains(out, "active blueprint: seismic-market · scope: session") {
		t.Fatalf("session sidebar should show active blueprint scope:\n%s", out)
	}
	if rows := a.sidebarSessionRowCount(0); rows != 3 {
		t.Fatalf("session row count = %d, want title/status/active-blueprint rows", rows)
	}
}

func TestAgentBlueprintActivatedMsgUpdatesSelectedSessionMetadata(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionSessions
	a.sidebarSectionCursor = false
	a.SetSidebarLayout([]string{"sessions"}, nil)
	a.sessions = []gact.Session{{ID: "s1", WorkspaceID: "ws1", Title: "Blueprint session", Status: gact.StatusIdle}}
	a.selected = 0

	model, cmd := a.Update(agentBlueprintActivatedMsg{
		blueprintID: "seismic-market",
		state: gact.SessionAgentBlueprintState{
			SessionID:                "s1",
			WorkspaceID:              "ws1",
			ActiveAgentBlueprintID:   "seismic-market",
			ActiveAgentBlueprintPath: "/workspace/.clio/agent-blueprints/seismic-market/AGENT.md",
		},
	})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("activation success should schedule transient hint expiry")
	}
	if got := stringValue(a.sessions[0].Metadata["active_agent_blueprint_id"]); got != "seismic-market" {
		t.Fatalf("active blueprint metadata = %q", got)
	}
	if got := stringValue(a.sessions[0].Metadata["active_agent_blueprint_scope"]); got != "session" {
		t.Fatalf("active blueprint scope = %q", got)
	}

	out := ansi.Strip(a.renderSidebar(72, 20))
	if !strings.Contains(out, "active blueprint: seismic-market · scope: session") {
		t.Fatalf("activation state should render in session sidebar:\n%s", out)
	}
}
