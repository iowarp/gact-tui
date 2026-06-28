package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestAgentHierarchySidebarModuleRendersParentChildAgents(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionAgents
	a.sidebar.sectionCursor = false
	a.sidebar.SetLayout([]string{"agents"}, nil)
	a.session.sessions = []gact.Session{{ID: "s1", Agent: gact.AgentRef{ID: "orchestrator"}}}
	a.session.selected = 0
	a.agent.hierarchyAgents = []gact.AgentDef{
		{ID: "orchestrator", Title: "Orchestrator", Source: "builtin", Tier: 1},
		{ID: "data", Title: "Data expert", Source: "builtin", ParentID: "orchestrator", Tier: 2, Specialization: "data"},
		{ID: "ndp_catalog", Title: "NDP catalog", Source: "builtin", ParentID: "data", Tier: 3, Specialization: "catalog"},
		{ID: "skill.readme", Title: "Readme Skill", Source: "skill"},
	}

	out := ansi.Strip(a.sidebar.render(42, 20))
	for _, want := range []string{"AGENTS", "• T1 1 Orchestrator", "└─ T2 1.1 Data expert", "└─ T3 1.1.1 NDP catalog"} {
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
	a.sidebar.sectionFocus = sidebarSectionAgents
	a.sidebar.sectionCursor = false
	a.sidebar.SetLayout([]string{"agents"}, nil)
	a.agent.hierarchyAgents = []gact.AgentDef{{ID: "data", Title: "Data expert", Source: "builtin"}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:agents:item:0")
	if !ok {
		t.Fatal("missing agent hierarchy hit target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: target.rect.x, Y: target.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if !a.catalog.open || a.catalog.current == nil || a.catalog.current.agentID != "data" {
		t.Fatalf("agent click should open detail, open=%v browser=%+v", a.catalog.open, a.catalog.current)
	}
}

func TestAgentHierarchySidebarSurfacesSkillsAndValidationState(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 180
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionAgents
	a.sidebar.sectionCursor = false
	a.sidebar.SetLayout([]string{"agents"}, nil)
	a.agent.hierarchyAgents = []gact.AgentDef{{
		ID:                 "data",
		Title:              "Data expert",
		Source:             "agent_blueprint",
		Tier:               2,
		Skills:             []string{"python", "ndp", "adios"},
		ValidationWarnings: []string{"skill ndp resolved from community source"},
		ValidationErrors:   []string{"missing skill: adios"},
	}}

	out := ansi.Strip(a.sidebar.render(150, 20))
	for _, want := range []string{"T2 1 Data expert workflow", "skills: python, ndp, +1 more", "warnings: skill ndp", "errors: missing"} {
		if !strings.Contains(out, want) {
			t.Fatalf("agent hierarchy missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "agent_blueprint") {
		t.Fatalf("agent hierarchy should not expose backend source label:\n%s", out)
	}
}

func TestAgentHierarchySidebarPrioritizesNamesInNarrowWorkflowPane(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionAgents
	a.sidebar.sectionCursor = false
	a.sidebar.SetLayout([]string{"agents"}, nil)
	a.agent.hierarchyAgents = []gact.AgentDef{
		{ID: "workflow", Title: "Workflow Root", Source: "agent_blueprint", Tier: 1, Specialization: "workflow"},
		{ID: "waveform", Title: "Waveform Review", Source: "agent_blueprint", ParentID: "workflow", Tier: 2, Specialization: "seismic waveform"},
	}

	out := ansi.Strip(a.sidebar.render(30, 20))
	for _, want := range []string{"WORKFLOW", "Workflow Root", "Waveform Review"} {
		if !strings.Contains(out, want) {
			t.Fatalf("narrow agent hierarchy should preserve agent name %q before metadata:\n%s", want, out)
		}
	}
	if strings.Contains(out, "Workflow Root work") {
		t.Fatalf("narrow agent hierarchy should not append metadata by truncating the workflow name:\n%s", out)
	}
}

func TestAgentHierarchySidebarScopesToWorkflowWhenBlueprintAgentsExist(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionAgents
	a.sidebar.SetLayout([]string{"agents"}, nil)
	a.agent.hierarchyAgents = []gact.AgentDef{
		{ID: "workflow", Title: "Workflow Root", Source: "agent_blueprint", Tier: 1, Specialization: "workflow"},
		{ID: "waveform", Title: "Waveform Review", Source: "agent_blueprint", ParentID: "workflow", Tier: 2},
		{ID: "default", Title: "Default Agent", Source: "builtin", Tier: 1},
		{ID: "code", Title: "Code Expert", Source: "builtin", ParentID: "default", Tier: 2},
	}

	out := ansi.Strip(a.sidebar.render(40, 20))
	for _, want := range []string{"WORKFLOW", "Workflow Root", "Waveform Review"} {
		if !strings.Contains(out, want) {
			t.Fatalf("workflow sidebar missing %q:\n%s", want, out)
		}
	}
	for _, notWant := range []string{"Default Agent", "Code Expert"} {
		if strings.Contains(out, notWant) {
			t.Fatalf("workflow sidebar should not mix unrelated built-in agents %q:\n%s", notWant, out)
		}
	}
}

func TestAgentHierarchySidebarShowsActiveBlueprintOwner(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.hitFocus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionAgents
	a.sidebar.SetLayout([]string{"agents"}, nil)
	a.session.sessions = []gact.Session{{
		ID:     "s1",
		Title:  "Blueprint session",
		Status: gact.StatusIdle,
		Metadata: map[string]any{
			"active_agent_blueprint_id":    "seismic-market",
			"active_agent_blueprint_scope": "session",
		},
	}}
	a.session.selected = 0
	a.agent.hierarchyAgents = []gact.AgentDef{
		{ID: "workflow", Title: "Workflow Root", Source: "agent_blueprint", Tier: 1, Specialization: "workflow"},
		{ID: "waveform", Title: "Waveform Review", Source: "agent_blueprint", ParentID: "workflow", Tier: 2},
	}

	out := ansi.Strip(a.sidebar.render(40, 20))
	for _, want := range []string{"WORKFLOW", "◆ seismic-market · session", "Workflow Root", "Waveform Review"} {
		if !strings.Contains(out, want) {
			t.Fatalf("workflow sidebar missing active blueprint owner %q:\n%s", want, out)
		}
	}
	narrowOut := ansi.Strip(a.sidebar.render(24, 20))
	if !strings.Contains(narrowOut, "◆ seismic-market") {
		t.Fatalf("narrow workflow sidebar should preserve active blueprint identity:\n%s", narrowOut)
	}
	if strings.Contains(narrowOut, "active blueprint") || strings.Contains(narrowOut, "agent_blueprint") {
		t.Fatalf("workflow sidebar active owner should avoid verbose/backend wording:\n%s", narrowOut)
	}
}

func TestAgentHierarchySidebarCompactsLongActiveBlueprintOwner(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.hitFocus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionAgents
	a.sidebar.SetLayout([]string{"agents"}, nil)
	a.session.sessions = []gact.Session{{
		ID:     "s1",
		Title:  "Blueprint session",
		Status: gact.StatusIdle,
		Metadata: map[string]any{
			"active_agent_blueprint_id":    "seismic-waveform-review",
			"active_agent_blueprint_scope": "session",
		},
	}}
	a.session.selected = 0
	a.agent.hierarchyAgents = []gact.AgentDef{
		{ID: "workflow", Title: "Workflow Root", Source: "agent_blueprint", Tier: 1, Specialization: "workflow"},
		{ID: "waveform", Title: "Waveform Review", Source: "agent_blueprint", ParentID: "workflow", Tier: 2},
	}

	out := ansi.Strip(a.sidebar.render(28, 20))
	if !strings.Contains(out, "◆ seismic-waveform") {
		t.Fatalf("long active blueprint should keep meaningful compact identity:\n%s", out)
	}
	if strings.Contains(out, "◆ seismic-waveform-review") || strings.Contains(out, "◆ seismic-w...") {
		t.Fatalf("long active blueprint should not render raw or generic truncated id:\n%s", out)
	}
}
