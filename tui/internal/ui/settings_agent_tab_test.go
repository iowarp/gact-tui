package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestSessionUpdatedAgentPatchShowsConfirmation(t *testing.T) {
	a := newReadyApp([]gact.Session{{
		ID:     "sess_1",
		Title:  "demo",
		Status: gact.StatusIdle,
		Agent:  gact.AgentRef{ID: "main"},
	}}, nil)
	a.settings.open = false

	model, cmd := a.Update(sessionUpdatedMsg{
		session: gact.Session{
			ID:     "sess_1",
			Title:  "demo",
			Status: gact.StatusIdle,
			Agent:  gact.AgentRef{ID: "tui-test"},
		},
		agentID: "tui-test",
	})
	a = model.(*App)

	if got := a.session.sessions[0].Agent.ID; got != "tui-test" {
		t.Fatalf("session agent = %q, want tui-test", got)
	}
	if !strings.Contains(a.transientHint, "agent: tui-test") {
		t.Fatalf("transientHint = %q, want agent confirmation", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("expected hint-expiration command")
	}
}

func TestSelectableSessionAgentsExcludesSkillsAndNanoagents(t *testing.T) {
	agents := []gact.AgentDef{
		{ID: "main", Source: "builtin", Tier: 1},
		{ID: "analysis", Source: "builtin", Tier: 2},
		{ID: "tui-test", Source: "skill", Tier: 2},
		{ID: "worker-1", Source: "builtin", Tier: 3},
		{ID: "custom", Source: "user", Tier: 2},
	}

	got := selectableSessionAgents(agents)
	ids := make([]string, 0, len(got))
	for _, ag := range got {
		ids = append(ids, ag.ID)
	}
	want := []string{"main", "analysis", "custom"}
	if strings.Join(ids, ",") != strings.Join(want, ",") {
		t.Fatalf("selectable ids = %v, want %v", ids, want)
	}
}

func TestSettingsAgentTabShowsSelectedAgentDetails(t *testing.T) {
	a := newReadyApp([]gact.Session{{
		ID:     "sess_1",
		Title:  "demo",
		Status: gact.StatusIdle,
		Agent:  gact.AgentRef{ID: "analysis"},
	}}, nil)
	a.width = 140
	a.height = 42
	a.settings.open = true
	a.settings.settingsState = settingsState{
		tab:      1,
		agentSel: 0,
		agentList: []gact.AgentDef{{
			ID:             "analysis",
			Source:         "builtin",
			Title:          "Analysis Expert",
			Description:    "Scientific reasoning and quantitative analysis",
			SystemPrompt:   "You are the CLIO Analysis Expert.",
			Tier:           2,
			Specialization: "data_analysis",
			Keywords:       []string{"statistics", "parquet"},
			Tools:          []string{"parquet_analyze_schema", "csv_read_table"},
		}},
	}

	out := ansi.Strip(a.settings.view())

	for _, want := range []string{
		"Capability snapshot",
		"Expert: analysis",
		"Comes from: built in",
		"Routing depth: 2",
		"Role: data_analysis",
		"Can use: parquet_analyze_schema, csv_read_table",
		"Good for: statistics, parquet",
		"Instruction: You are the CLIO Analysis Expert.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("settings agent details missing %q:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{
		"ID: analysis",
		"Source: builtin",
		"Tier: 2",
		"Specialization: data_analysis",
		"Tools: parquet_analyze_schema, csv_read_table",
		"Keywords: statistics, parquet",
		"Default model:",
		"DSPy module:",
		"DSPy signature:",
		"Structured outputs:",
		"Fanout:",
		"Prompt: You are the CLIO Analysis Expert.",
	} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("settings agent details leaked backend-style label %q:\n%s", unwanted, out)
		}
	}
}

func TestSettingsAgentTabLoadErrorDoesNotRenderLoadingPlaceholder(t *testing.T) {
	a := newReadyApp([]gact.Session{{
		ID:     "sess_1",
		Title:  "demo",
		Status: gact.StatusIdle,
	}}, nil)
	a.width = 120
	a.height = 32
	a.settings.open = true
	a.settings.settingsState = settingsState{
		tab:     1,
		loadErr: "agents: backend unavailable",
	}

	out := ansi.Strip(a.settings.view())
	if !strings.Contains(out, "agents: backend unavailable") {
		t.Fatalf("settings agent tab should surface backend error:\n%s", out)
	}
	if strings.Contains(out, "loading") || strings.Contains(out, "Loading") {
		t.Fatalf("agent tab load error should not be paired with loading placeholder:\n%s", out)
	}
}

func TestSettingsAgentListDescriptionOmitsGeneratedCommonToolsTail(t *testing.T) {
	a := New("http://unused")
	ag := gact.AgentDef{
		ID:          "extracted",
		Title:       "Extracted from 2 session(s)",
		Description: "Auto-extracted agent from 2 session log(s). Common tools: analysis, data, shell",
		Tools:       []string{"analysis", "data", "shell"},
		CapabilityRefs: []gact.AgentCapabilityRef{
			{Kind: "tool", ID: "hdf5_analyze_dataset", Status: "available", Source: "builtin"},
			{Kind: "command", ID: "/optimize", Status: "unavailable", Metadata: map[string]any{"error": "not_implemented"}},
		},
	}

	got := a.settings.agentListDescription(ag)
	want := "Auto-extracted agent from 2 session log(s)."
	if got != want {
		t.Fatalf("list description = %q, want %q", got, want)
	}
	if detail := a.agent.agentDetailText(ag); !strings.Contains(detail, "analysis") {
		t.Fatalf("detail text should retain tool evidence:\n%s", detail)
	} else if !strings.Contains(detail, "hdf5_analyze_dataset") ||
		!strings.Contains(detail, "/optimize") ||
		!strings.Contains(detail, "not_implemented") {
		t.Fatalf("detail text should surface capability refs:\n%s", detail)
	}
}

func TestSettingsAgentTabScrollsSelectionIntoView(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 30
	a.settings.open = true
	agents := make([]gact.AgentDef, 0, 18)
	for i := 0; i < 18; i++ {
		agents = append(agents, gact.AgentDef{
			ID:          "agent-" + itoa2(i),
			Source:      "builtin",
			Title:       "Agent " + itoa2(i),
			Description: "desc",
			Tier:        2,
		})
	}
	a.settings.settingsState = settingsState{tab: 1, agentList: agents}

	for i := 0; i < 14; i++ {
		a.settings.handleKey(tea.KeyPressMsg{Code: tea.KeyDown})
	}

	if a.settings.agentSel != 14 {
		t.Fatalf("agentSel = %d, want 14", a.settings.agentSel)
	}
	if a.settings.agentScroll == 0 {
		t.Fatalf("agentScroll was not advanced for long list")
	}
	out := ansi.Strip(a.settings.view())
	if !strings.Contains(out, "Agent 14") || strings.Contains(out, "Agent 0  desc") {
		t.Fatalf("agent tab did not render a scrolled viewport:\n%s", out)
	}
}

func TestSettingsAgentTabLongDescriptionsShowEllipsisBeforeRail(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 42
	a.settings.open = true
	a.settings.settingsState = settingsState{
		tab: 1,
		agentList: []gact.AgentDef{
			{
				ID:          "default",
				Source:      "builtin",
				Title:       "Default expert",
				Description: "CLIO default behavior",
			},
			{
				ID:          "long-routing",
				Source:      "recipe",
				Title:       "CLIO Live Benchmark Orchestrator With Long Routing Title",
				Description: "Routes NDP, EarthScope, weather, visualization, validation, and artifact publication workflows for live benchmark demonstrations.",
			},
			{
				ID:          "fragile",
				Source:      "user",
				Title:       "Fragile User Expert",
				Description: "User-owned fixture for edit/delete failure handling in the TUI.",
			},
			{
				ID:          "invalid",
				Source:      "recipe",
				Title:       "Invalid Disabled Demo Expert",
				Description: "Disabled recipe with validation errors so the agent catalog can prove visible invalid states.",
			},
			{
				ID:          "geo",
				Source:      "recipe",
				Title:       "Geographic Region Resolver",
				Description: "Normalizes place names, bounding boxes, and nearby seismic station search windows.",
			},
		},
	}

	out := ansi.Strip(a.settings.view())
	if !strings.Contains(out, "Routes NDP, EarthScope") {
		t.Fatalf("long agent description not rendered:\n%s", out)
	}
	if !strings.Contains(out, "…") {
		t.Fatalf("long agent rows should show visible ellipsis before the scroll rail clips them:\n%s", out)
	}
}

func TestSettingsAgentDetailTextIncludesValidationErrors(t *testing.T) {
	a := New("http://unused")
	detail := a.agent.agentDetailText(gact.AgentDef{
		ID:               "invalid-disabled-demo-expert",
		Source:           "recipe",
		Title:            "Invalid Disabled Demo Expert",
		ValidationErrors: []string{"missing required tool: ndp_stage_resource", "parent agent not installed: main"},
	})

	for _, want := range []string{
		"Validation errors:",
		"- missing required tool: ndp_stage_resource",
		"- parent agent not installed: main",
	} {
		if !strings.Contains(detail, want) {
			t.Fatalf("agent detail missing validation evidence %q:\n%s", want, detail)
		}
	}
}

func TestSettingsAgentTabEnterOpensDetailView(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 40
	a.settings.open = true
	a.settings.settingsState = settingsState{
		tab:      1,
		agentSel: 0,
		agentList: []gact.AgentDef{{
			ID:           "main",
			Source:       "builtin",
			Title:        "Main Agent",
			Description:  "orchestrator",
			SystemPrompt: "Route to the right expert.",
			Tier:         1,
			Metadata: map[string]any{
				"routes_to": []any{"data", "analysis", "visualization", "utility"},
			},
		}},
	}

	a.settings.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("Enter on Agent tab should open detail view")
	}
	if !strings.Contains(a.detail.ref.fullText, "Routes to:") ||
		!strings.Contains(a.detail.ref.fullText, "- analysis") ||
		!strings.Contains(a.detail.ref.fullText, "Prompt:") {
		t.Fatalf("agent detail missing routing/prompt data:\n%s", a.detail.ref.fullText)
	}
}
