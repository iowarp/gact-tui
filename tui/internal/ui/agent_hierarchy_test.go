package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
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
		Source:             "plugin",
		Tier:               2,
		Skills:             []string{"python", "ndp", "adios"},
		ValidationWarnings: []string{"skill ndp resolved from community source"},
		ValidationErrors:   []string{"missing skill: adios"},
	}}

	out := ansi.Strip(a.sidebar.render(150, 20))
	for _, want := range []string{"T2 1 Data expert plugin", "skills: python, ndp, +1 more", "warnings: skill ndp", "errors: missing"} {
		if !strings.Contains(out, want) {
			t.Fatalf("agent hierarchy missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "agent_blueprint") {
		t.Fatalf("agent hierarchy should not expose backend source label:\n%s", out)
	}
}

func TestAgentHierarchySidebarPrioritizesNamesInNarrowPane(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionAgents
	a.sidebar.sectionCursor = false
	a.sidebar.SetLayout([]string{"agents"}, nil)
	a.agent.hierarchyAgents = []gact.AgentDef{
		{ID: "review", Title: "Review Root", Source: "plugin", Tier: 1},
		{ID: "waveform", Title: "Waveform Review", Source: "plugin", ParentID: "review", Tier: 2, Specialization: "seismic waveform"},
	}

	out := ansi.Strip(a.sidebar.render(30, 20))
	for _, want := range []string{"Review Root", "Waveform Review"} {
		if !strings.Contains(out, want) {
			t.Fatalf("narrow agent hierarchy should preserve agent name %q before metadata:\n%s", want, out)
		}
	}
	if strings.Contains(out, "Review Root plu") {
		t.Fatalf("narrow agent hierarchy should not append metadata by truncating the agent name:\n%s", out)
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
	if !a.detail.visible || a.detail.ref == nil || a.detail.ref.title != "Data expert" {
		t.Fatalf("agent click should open detail, visible=%v ref=%+v", a.detail.visible, a.detail.ref)
	}
}
