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
