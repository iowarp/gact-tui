package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestPaletteClassifiesThemeNavigationAndMCPPrompts(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	trueValue := true
	a.cmdPalette.commands = []gact.Command{
		{ID: "/theme-next", Title: "Cycle next theme", Source: "builtin"},
		{ID: "/theme-prev", Title: "Cycle previous theme", Source: "builtin"},
		{
			ID: "/summarize", Title: "Summarize MCP text", Source: "mcp_prompt",
			CommandSource: "mcp_prompt", Invocation: "mcp_prompt",
			UserInvocable: &trueValue, AgentInvocable: &trueValue, PlannerVisible: &trueValue,
		},
	}

	a.cmdPalette.paletteFilter = ""
	for _, cmd := range a.cmdPalette.visibleMatches() {
		switch cmd.ID {
		case "/theme-next", "/theme-prev":
			if group := paletteCommandGroup(cmd); group != "Settings" {
				t.Fatalf("%s grouped as %q, want Settings", cmd.ID, group)
			}
		case "/summarize":
			if group := paletteCommandGroup(cmd); group != "Runtime" {
				t.Fatalf("%s grouped as %q, want Runtime", cmd.ID, group)
			}
		}
	}
	out := ansi.Strip(a.cmdPalette.view())
	for _, want := range []string{"Settings", "Runtime"} {
		if !strings.Contains(out, want) {
			t.Fatalf("palette overview missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "Prompt Templates") {
		t.Fatalf("MCP prompt commands should fold into Runtime, not a separate prompt-template area:\n%s", out)
	}
	if strings.Contains(out, "┌─ Commands [") {
		t.Fatalf("known commands should not fall into vague Commands bucket:\n%s", out)
	}
}

func TestPaletteUnknownBackendCommandsUseExtensionCategory(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.commands = []gact.Command{
		{ID: "/custom-report", Title: "Custom Report", Source: "backend"},
		{ID: "/tools", Title: "Tools", Source: "builtin"},
	}

	if group := paletteCommandGroup(a.cmdPalette.commands[0]); group != "Extension Commands" {
		t.Fatalf("unknown backend command group = %q, want Extension Commands", group)
	}
	out := ansi.Strip(a.cmdPalette.view())
	for _, want := range []string{"Extension Commands", "custom backend commands", "/custom-report"} {
		if !strings.Contains(out, want) {
			t.Fatalf("palette missing extension command copy %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "┌─ Commands [") {
		t.Fatalf("palette should not show vague Commands category:\n%s", out)
	}
}

func TestPaletteDeprecatedAliasSearchDoesNotAdvertiseAlias(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.cmdPalette.commands = []gact.Command{
		{ID: "/tools", Title: "Runtime", Source: "builtin"},
		{ID: "/catalog", Title: "Catalog", Source: "builtin"},
	}
	a.cmdPalette.paletteFilter = "catalog"

	matches := a.cmdPalette.visibleMatches()
	if len(matches) != 0 {
		t.Fatalf("deprecated /catalog command should not be advertised by search, got %#v", matches)
	}
}

func TestPaletteCategorySelectionFiltersDefaultCommands(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.session.caps.Capabilities.XClioAgentBlueprints = true
	a.session.caps.Capabilities.XClioExpertPacks = true
	a.cmdPalette.paletteOpen = true

	if a.cmdPalette.paletteGroup != "" {
		t.Fatalf("initial palette group = %q, want all", a.cmdPalette.paletteGroup)
	}
	model, _ := a.cmdPalette.handleKey(keyMsg("tab"))
	a = model.(*App)
	if a.cmdPalette.paletteGroup != "Session" {
		t.Fatalf("palette group after tab = %q, want Session", a.cmdPalette.paletteGroup)
	}
	for _, cmd := range a.cmdPalette.visibleMatches() {
		if group := paletteCommandGroup(cmd); group != "Session" {
			t.Fatalf("session-filtered palette included %s in %s", cmd.ID, group)
		}
	}

	for i := 0; i < 2; i++ {
		model, _ = a.cmdPalette.handleKey(keyMsg("tab"))
		a = model.(*App)
	}
	if a.cmdPalette.paletteGroup != "Runtime" {
		t.Fatalf("palette group after three tabs = %q, want Runtime", a.cmdPalette.paletteGroup)
	}
	out := ansi.Strip(a.cmdPalette.view())
	if !strings.Contains(out, "/tools") || strings.Contains(out, "/clear") {
		t.Fatalf("runtime palette should show capability commands only:\n%s", out)
	}

	a.cmdPalette.paletteFilter = "theme"
	if got := a.cmdPalette.visibleMatches(); len(got) == 0 || got[0].ID != "/theme" {
		t.Fatalf("explicit search should ignore category filter, got %#v", got)
	}
}

func TestPaletteCategoryOrderPrioritizesOperatorEntrypoints(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.caps.Capabilities.XClioAgentBlueprints = true
	a.session.caps.Capabilities.XClioExpertPacks = true
	a.session.caps.Capabilities.XClioPromptRegistry = true
	a.cmdPalette.paletteGroup = "Runtime"

	matches := a.cmdPalette.visibleMatches()
	got := make([]string, 0, minInt(3, len(matches)))
	for i := 0; i < len(matches) && i < 3; i++ {
		got = append(got, matches[i].ID)
	}
	if strings.Join(got, " ") != "/tools /mcp /prompts" {
		t.Fatalf("runtime category first commands = %q, want tools, MCP management, and prompts", strings.Join(got, " "))
	}
	if desc := paletteCommandGroupDescription("Runtime"); desc != "tools, MCP, prompts" {
		t.Fatalf("runtime group description = %q", desc)
	}
}

func TestPaletteCategoryDrilldownUsesCommandTiles(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.session.caps.Capabilities.XClioPromptRegistry = true
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Runtime"

	out := ansi.Strip(a.cmdPalette.view())
	for _, want := range []string{
		"Runtime area - tools, MCP, prompts",
		"┌─ ▌ /tools",
		"Browse actions and MCP",
		"Enter open Tools & MCP",
		"┌─ /prompts",
		"Browse prompt profiles",
		"Enter open Prompts",
		"Backspace areas",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("runtime command drilldown should render command tiles; missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "  /tools\nBrowse callable tools") {
		t.Fatalf("runtime command drilldown should not render as a plain two-line list:\n%s", out)
	}
}

func TestPaletteCategoryBackspaceReturnsToAreaOverview(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Runtime"
	a.cmdPalette.paletteSel = 2

	model, _ := a.cmdPalette.handleKey(keyMsg("backspace"))
	a = model.(*App)
	if a.cmdPalette.paletteGroup != "" || a.cmdPalette.paletteSel != 0 {
		t.Fatalf("backspace from category should return to area overview, group=%q sel=%d", a.cmdPalette.paletteGroup, a.cmdPalette.paletteSel)
	}
	if !a.cmdPalette.showingGroupOverview() {
		t.Fatalf("palette should show area overview after category backspace:\n%s", ansi.Strip(a.cmdPalette.view()))
	}
}

func TestPaletteFilterBackspaceStillEditsTextBeforeAreaNavigation(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Runtime"
	a.cmdPalette.paletteFilter = "tools"
	a.cmdPalette.paletteCursor = len(a.cmdPalette.paletteFilter)
	a.cmdPalette.paletteCursorSet = true

	model, _ := a.cmdPalette.handleKey(keyMsg("backspace"))
	a = model.(*App)
	if a.cmdPalette.paletteGroup != "Runtime" {
		t.Fatalf("editing filter should not leave category, group=%q", a.cmdPalette.paletteGroup)
	}
	if a.cmdPalette.paletteFilter != "tool" {
		t.Fatalf("backspace should edit filter before category navigation, filter=%q", a.cmdPalette.paletteFilter)
	}
}

func TestPaletteMCPPromptSubtitleStaysCompact(t *testing.T) {
	command := gact.Command{
		ID:            "/summarize",
		Title:         "Summarize MCP text",
		Source:        "mcp_prompt",
		CommandSource: "mcp_prompt",
		Invocation:    "mcp_prompt",
		AgentID:       "clio.expert.data",
		ArgumentHint:  "text required",
	}

	got := paletteCommandSubtitle(command)
	if got != "MCP prompt action · input text required · expert clio.expert.data" {
		t.Fatalf("mcp prompt subtitle = %q", got)
	}
	if strings.Contains(got, "operator command") || strings.Contains(got, "planner visible") {
		t.Fatalf("mcp prompt subtitle should avoid backend provenance noise: %q", got)
	}
}

func TestPaletteNormalizesBackendBuiltinCommandCopy(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.cmdPalette.commands = []gact.Command{
		{ID: "/tools", Title: "Runtime", Description: "Unified catalog of built-in, recipe, extension, and MCP-provided tools", Source: "builtin"},
		{ID: "/mcp", Title: "MCP connections", Description: "Inspect MCP connection health, resources, prompts, and management actions", Source: "builtin"},
	}

	matches := a.cmdPalette.matches()
	descriptions := map[string]string{}
	for _, cmd := range matches {
		descriptions[cmd.ID] = cmd.Description
	}
	if descriptions["/tools"] != "Browse actions and MCP" {
		t.Fatalf("/tools description = %q", descriptions["/tools"])
	}
	if descriptions["/mcp"] != "Manage MCP connections" {
		t.Fatalf("/mcp description = %q", descriptions["/mcp"])
	}
}

func TestPaletteDefaultEnterChoosesCommandCategory(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.session.caps.Capabilities.XClioAgentBlueprints = true
	a.session.caps.Capabilities.XClioExpertPacks = true
	a.cmdPalette.paletteOpen = true

	if !a.cmdPalette.showingGroupOverview() {
		t.Fatalf("empty palette should land on category overview:\n%s", ansi.Strip(a.cmdPalette.view()))
	}
	model, _ := a.cmdPalette.handleKey(keyMsg("enter"))
	a = model.(*App)
	if a.cmdPalette.paletteGroup != "Session" {
		t.Fatalf("enter on first category set group %q, want Session", a.cmdPalette.paletteGroup)
	}
	out := ansi.Strip(a.cmdPalette.view())
	if !strings.Contains(out, "/clear") || strings.Contains(out, "/tools") {
		t.Fatalf("session category should show session commands only:\n%s", out)
	}
}

func TestPaletteOverviewUsesBrowseHint(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.session.caps.Capabilities.XClioAgentBlueprints = true
	a.session.caps.Capabilities.XClioExpertPacks = true
	a.cmdPalette.paletteOpen = true

	out := ansi.Strip(a.cmdPalette.view())
	if !strings.Contains(out, "Enter browse area") || !strings.Contains(out, "Tab cycle areas") {
		t.Fatalf("group overview should describe category browsing:\n%s", out)
	}
	if strings.Contains(out, "Enter run") {
		t.Fatalf("group overview should not describe Enter as running a command:\n%s", out)
	}

	a.cmdPalette.paletteGroup = "Runtime"
	out = ansi.Strip(a.cmdPalette.view())
	if !strings.Contains(out, "Enter open Tools & MCP") {
		t.Fatalf("catalog command should describe opening the catalog:\n%s", out)
	}
	if strings.Contains(out, "Enter run  Esc close") {
		t.Fatalf("catalog command should not keep generic run hint:\n%s", out)
	}
}

func TestPaletteFooterDescribesSelectedCommandAction(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.cmdPalette.commands = []gact.Command{
		{ID: "/tools", Title: "Tools", Description: "Browse callable tools", Source: "builtin"},
		{ID: "/summarize", Title: "Summarize", Source: "mcp_prompt", CommandSource: "mcp_prompt", Invocation: "mcp_prompt"},
	}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "tools"

	out := ansi.Strip(a.cmdPalette.view())
	if !strings.Contains(out, "Enter open Tools & MCP") {
		t.Fatalf("/tools footer should describe catalog open:\n%s", out)
	}

	a.cmdPalette.paletteFilter = "summarize"
	a.cmdPalette.paletteSel = 0
	out = ansi.Strip(a.cmdPalette.view())
	if !strings.Contains(out, "Enter run prompt") {
		t.Fatalf("MCP prompt footer should describe prompt execution:\n%s", out)
	}
}

func TestPaletteAgentSettingsCommandUsesExpertLanguage(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.cmdPalette.commands = []gact.Command{
		{ID: "/agent", Title: "Agent", Description: "Choose default expert", Source: "builtin"},
	}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Settings"

	out := ansi.Strip(a.cmdPalette.view())
	for _, want := range []string{"Expert settings", "Pick the session expert", "Enter open Expert settings"} {
		if !strings.Contains(out, want) {
			t.Fatalf("/agent palette should use operator expert language %q:\n%s", want, out)
		}
	}
	for _, stale := range []string{"Agent settings", "Switch agent", "Pick an agent"} {
		if strings.Contains(out, stale) {
			t.Fatalf("/agent palette leaked stale agent wording %q:\n%s", stale, out)
		}
	}
}

func TestPaletteDuplicateSessionUsesExpertLanguage(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.cmdPalette.commands = []gact.Command{
		{ID: "/duplicate", Title: "Copy current session's title/expert to a fresh session", Source: "builtin"},
	}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Session"

	out := ansi.Strip(a.cmdPalette.view())
	for _, want := range []string{"/duplicate", "Copy title and expert"} {
		if !strings.Contains(out, want) {
			t.Fatalf("/duplicate palette should use operator expert language %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "title/model/agent") {
		t.Fatalf("/agent footer leaked stale agent wording:\n%s", out)
	}
}
