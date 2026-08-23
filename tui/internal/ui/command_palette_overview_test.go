package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestPromptAndBlueprintCommandsArePaletteDiscoverableWhenSupported(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.caps.Capabilities.XClioPromptRegistry = true
	a.session.caps.Capabilities.XClioExpertPacks = true
	a.session.caps.Capabilities.XClioAgentBlueprints = true

	for _, tc := range []struct {
		filter string
		id     string
	}{
		{filter: "prompts", id: "/prompts"},
		{filter: "expert-packs", id: "/expert-packs"},
		{filter: "agent-blueprints", id: "/agent-blueprints"},
		{filter: "blueprints", id: "/agent-blueprints"},
	} {
		a.cmdPalette.paletteFilter = tc.filter
		found := false
		for _, cmd := range a.cmdPalette.visibleMatches() {
			if cmd.ID == tc.id {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("palette filter %q did not include %s", tc.filter, tc.id)
		}
	}
}

func TestAgentBlueprintManagementActionsStayInsideCatalogSurface(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.caps.Capabilities.XClioAgentBlueprints = true

	for _, filter := range []string{"agent-blueprint-install", "agent-blueprint-validate"} {
		a.cmdPalette.paletteFilter = filter
		for _, cmd := range a.cmdPalette.matches() {
			if cmd.ID == "/agent-blueprint-install" || cmd.ID == "/agent-blueprint-validate" {
				t.Fatalf("blueprint management command %s leaked into palette for filter %q", cmd.ID, filter)
			}
		}
	}
}

func TestPaletteDefaultViewGroupsCommandsAndHidesAliases(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.session.caps.Capabilities.XClioAgentBlueprints = true
	a.session.caps.Capabilities.XClioExpertPacks = true
	a.cmdPalette.commands = []gact.Command{
		{ID: "/clear", Title: "Clear chat history", Source: "builtin"},
		{ID: "/add", Title: "Add file to context", Source: "builtin"},
		{ID: "/agents", Title: "Pick an agent", Source: "builtin"},
	}

	a.cmdPalette.paletteFilter = ""
	out := ansi.Strip(a.cmdPalette.view())
	for _, want := range []string{"Session", "Workspace", "Runtime", "Experts", "Settings"} {
		if !strings.Contains(out, want) {
			t.Fatalf("default palette missing %q:\n%s", want, out)
		}
	}
	for _, want := range []string{"Session [", "/clear", "Runtime [", "/tools", "Experts [", "/agent-blueprints"} {
		if !strings.Contains(out, want) {
			t.Fatalf("default palette should render command areas as compact grouped rows; missing %q:\n%s", want, out)
		}
	}
	if strings.Count(out, "┌") < 4 || strings.Count(out, "┘") < 4 || strings.Count(out, "──") < 4 || !strings.Contains(out, "▌ Session") {
		t.Fatalf("default palette should render separate boxed command area panels:\n%s", out)
	}
	if strings.Contains(out, "┌▌ Session") || strings.Contains(out, "└ /clear") {
		t.Fatalf("default palette should use full bordered tiles, not bracket-style compact rows:\n%s", out)
	}
	visibleIDs := map[string]bool{}
	for _, cmd := range a.cmdPalette.visibleMatches() {
		visibleIDs[cmd.ID] = true
	}
	if !visibleIDs["/agent-blueprints"] {
		t.Fatal("default palette should include canonical /agent-blueprints command")
	}
	for _, want := range []string{"/clear", "/add", "/agent-blueprints"} {
		if !strings.Contains(out, want) {
			t.Fatalf("default palette should show representative command examples; missing %s:\n%s", want, out)
		}
	}
	if strings.Contains(out, "Browse and manage CLIO markdown agent blueprints") {
		t.Fatalf("default palette should not render the full flat command list:\n%s", out)
	}
	if visibleIDs["/blueprints"] {
		t.Fatal("default palette should hide duplicate /blueprints alias")
	}
	if visibleIDs["/catalog"] {
		t.Fatal("default palette should hide deprecated /catalog command")
	}
	if visibleIDs["/theme-export"] {
		t.Fatal("default palette should hide theme export from top-level discovery")
	}
	if visibleIDs["/agents-list"] {
		t.Fatal("default palette should hide compatibility /agents-list alias")
	}
	if !visibleIDs["/mcp"] {
		t.Fatal("default palette should include MCP connection management")
	}

	for _, tc := range []struct {
		filter string
		id     string
	}{
		{"blueprints", "/agent-blueprints"},
		{"mcp", "/mcp"},
	} {
		a.cmdPalette.paletteFilter = tc.filter
		found := false
		for _, cmd := range a.cmdPalette.visibleMatches() {
			if cmd.ID == tc.id {
				found = true
			}
		}
		if !found {
			t.Fatalf("explicit palette filter %q should expose canonical %s", tc.filter, tc.id)
		}
	}
	for _, filter := range []string{"catalog", "theme-export"} {
		a.cmdPalette.paletteFilter = filter
		if got := a.cmdPalette.visibleMatches(); len(got) != 0 {
			t.Fatalf("deprecated alias search %q should not be advertised in the operator palette, got %#v", filter, got)
		}
	}
}

func TestPaletteDefaultOverviewUsesThreeAreaColumnsOnDemoWidth(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 150
	a.height = 40
	a.session.caps.Capabilities.XClioAgentBlueprints = true
	a.session.caps.Capabilities.XClioExpertPacks = true
	a.cmdPalette.paletteOpen = true

	out := ansi.Strip(a.cmdPalette.view())
	session := strings.Index(out, "Session [")
	workspace := strings.Index(out, "Workspace [")
	runtime := strings.Index(out, "Runtime [")
	if session < 0 || workspace < 0 || runtime < 0 {
		t.Fatalf("wide palette overview missing first-row areas:\n%s", out)
	}
	lineStart := strings.LastIndex(out[:session], "\n") + 1
	lineEnd := strings.Index(out[session:], "\n")
	if lineEnd < 0 {
		t.Fatalf("could not isolate first overview row:\n%s", out)
	}
	firstRow := out[lineStart : session+lineEnd]
	if !strings.Contains(firstRow, "Session [") || !strings.Contains(firstRow, "Workspace [") || !strings.Contains(firstRow, "Runtime [") {
		t.Fatalf("wide palette overview should render three separate area boxes on the first row:\n%s", firstRow)
	}
	if strings.Contains(firstRow, "Experts [") {
		t.Fatalf("wide palette overview first row should be exactly the first three area boxes, got:\n%s", firstRow)
	}
}

func TestPaletteGroupOverviewExamplesPreferOperatorEntrypoints(t *testing.T) {
	commands := []gact.Command{
		{ID: "/agent-blueprints", Source: "builtin"},
		{ID: "/experts", Source: "builtin"},
		{ID: "/agents-list", Source: "builtin"},
		{ID: "/expert-packs", Source: "builtin"},
		{ID: "/mcp", Source: "builtin"},
		{ID: "/prompts", Source: "builtin"},
		{ID: "/skills", Source: "builtin"},
		{ID: "/tools", Source: "builtin"},
		{ID: "/clear", Source: "builtin"},
		{ID: "/compact", Source: "builtin"},
		{ID: "/copy", Source: "builtin"},
		{ID: "/new", Source: "builtin"},
	}

	examples := paletteCommandGroupExamples(commands, 3)
	if got := strings.Join(examples["Runtime"], " "); got != "/tools /mcp /prompts" {
		t.Fatalf("runtime examples = %q, want tools, MCP management, and prompts", got)
	}
	if got := strings.Join(examples["Experts"], " "); got != "/agent-blueprints /experts /expert-packs" {
		t.Fatalf("agent examples = %q, want canonical expert entrypoints", got)
	}
	if got := strings.Join(examples["Session"], " "); got != "/clear /copy /new" {
		t.Fatalf("session examples = %q, want common operator actions", got)
	}
}

func TestPaletteGroupOverviewExamplesHideCompatibilityAliases(t *testing.T) {
	commands := []gact.Command{
		{ID: "/agent-blueprints", Source: "builtin"},
		{ID: "/agents-list", Source: "builtin"},
		{ID: "/blueprints", Source: "builtin"},
		{ID: "/experts", Source: "builtin"},
	}

	examples := paletteCommandGroupExamples(commands, 3)
	got := strings.Join(examples["Experts"], " ")
	if strings.Contains(got, "/agents-list") || strings.Contains(got, "/blueprints") {
		t.Fatalf("expert examples should hide compatibility aliases, got %q", got)
	}
	if got != "/agent-blueprints /experts" {
		t.Fatalf("expert examples = %q, want canonical entrypoints only", got)
	}
}

func TestPaletteGroupExampleLineDropsOverflowInsteadOfTruncatingCommands(t *testing.T) {
	line := paletteGroupExampleLine([]string{"/agent-blueprints", "/experts", "/expert-packs"}, 32)
	if line != "/agent-blueprints  /experts" {
		t.Fatalf("example line = %q, want complete commands that fit", line)
	}
	if strings.Contains(line, "…") || strings.Contains(line, "/expert-packs") {
		t.Fatalf("example line should drop overflow instead of truncating commands: %q", line)
	}
}
