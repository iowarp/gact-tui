package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestPromptCatalogItemsSurfaceProfilesAndValidation(t *testing.T) {
	items := promptCatalogItems([]gact.PromptDefinition{{
		ID:               "clio.chat",
		Title:            "Chat",
		Description:      "General conversation",
		DefaultProfile:   "default",
		Scope:            "builtin",
		ValidationErrors: []string{"bad override"},
		Profiles: map[string]gact.PromptProfile{
			"default": {Name: "default", Text: "base", Scope: "builtin"},
			"debug":   {Name: "debug", Text: "debug", Scope: "global"},
		},
	}}, client.RuntimeScope{WorkspaceID: "ws1", SessionID: "s1"})

	if len(items) != 2 {
		t.Fatalf("items len = %d, want provider header and prompt row", len(items))
	}
	if items[0].id != "provider/built-in" || items[0].title != "Provider · Built-in" {
		t.Fatalf("prompt catalog provider row = %#v, want built-in provider header", items[0])
	}
	if items[0].inlineDesc != "1 prompt" {
		t.Fatalf("prompt catalog provider inline = %q, want prompt count", items[0].inlineDesc)
	}
	if items[1].title != "  └─ Chat" {
		t.Fatalf("prompt catalog title = %q, want indented prompt title", items[1].title)
	}
	for _, want := range []string{"built-in prompt", "profiles: debug, default", "default profile: default", "validation: 1 validation error - bad override", "description: General conversation"} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("prompt catalog desc missing %q: %q", want, items[1].desc)
		}
	}
	for _, want := range []string{"built-in", "2 profiles", "default profile", "1 validation issue"} {
		if !strings.Contains(items[1].inlineDesc, want) {
			t.Fatalf("prompt catalog inline summary missing %q: %#v", want, items[1])
		}
	}
	for _, notWant := range []string{"Prompt ·", "available profiles:", "uses ", "error(s)", "General conversation", "scope:", "profiles:", "default:", "validation errors:"} {
		if strings.Contains(items[1].inlineDesc, notWant) {
			t.Fatalf("prompt catalog inline summary leaked backend wording %q: %#v", notWant, items[1])
		}
	}
}

func TestPromptProfileRowsHideChecksumUntilDetail(t *testing.T) {
	desc := promptProfileDescription("default", gact.PromptProfile{
		Name:       "default",
		Scope:      "workspace",
		Provider:   "openai",
		Model:      "gpt-5",
		Checksum:   "abc123def456",
		SourcePath: "/repo/.clio/prompts/chat/default.md",
		Text:       "Rendered prompt text",
	}, true)

	for _, want := range []string{"current default", "workspace profile", "provider: openai", "model: gpt-5", "source: default.md"} {
		if !strings.Contains(desc, want) {
			t.Fatalf("profile row missing %q: %q", want, desc)
		}
	}
	for _, notWant := range []string{"checksum", "abc123def456", "Rendered prompt text"} {
		if strings.Contains(desc, notWant) {
			t.Fatalf("profile row should keep raw provenance/detail out of the tree, found %q in %q", notWant, desc)
		}
	}
}

func TestPromptRowTitleNormalizationRemovesTreeChrome(t *testing.T) {
	for _, tc := range []struct {
		in   string
		want string
	}{
		{in: "Prompt · Chat agent", want: "Chat agent"},
		{in: "  └─ Chat agent", want: "Chat agent"},
		{in: "Prompt ·   ├─ Data expert", want: "Data expert"},
	} {
		if got := stripPromptRowPrefix(tc.in); got != tc.want {
			t.Fatalf("stripPromptRowPrefix(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestPromptAndBlueprintCommandsArePaletteDiscoverableWhenSupported(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.caps.Capabilities.XClioPromptRegistry = true
	a.caps.Capabilities.XClioExpertPacks = true
	a.caps.Capabilities.XClioAgentBlueprints = true

	for _, tc := range []struct {
		filter string
		id     string
	}{
		{filter: "prompts", id: "/prompts"},
		{filter: "expert-packs", id: "/expert-packs"},
		{filter: "agent-blueprints", id: "/agent-blueprints"},
		{filter: "blueprints", id: "/agent-blueprints"},
	} {
		a.paletteFilter = tc.filter
		found := false
		for _, cmd := range a.paletteVisibleMatches() {
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
	a.caps.Capabilities.XClioAgentBlueprints = true

	for _, filter := range []string{"agent-blueprint-install", "agent-blueprint-validate"} {
		a.paletteFilter = filter
		for _, cmd := range a.paletteMatches() {
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
	a.caps.Capabilities.XClioAgentBlueprints = true
	a.caps.Capabilities.XClioExpertPacks = true
	a.commands = []gact.Command{
		{ID: "/clear", Title: "Clear chat history", Source: "builtin"},
		{ID: "/add", Title: "Add file to context", Source: "builtin"},
		{ID: "/agents", Title: "Pick an agent", Source: "builtin"},
	}

	a.paletteFilter = ""
	out := ansi.Strip(a.viewPalette())
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
	for _, cmd := range a.paletteVisibleMatches() {
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
		a.paletteFilter = tc.filter
		found := false
		for _, cmd := range a.paletteVisibleMatches() {
			if cmd.ID == tc.id {
				found = true
			}
		}
		if !found {
			t.Fatalf("explicit palette filter %q should expose canonical %s", tc.filter, tc.id)
		}
	}
	for _, filter := range []string{"catalog", "theme-export"} {
		a.paletteFilter = filter
		if got := a.paletteVisibleMatches(); len(got) != 0 {
			t.Fatalf("deprecated alias search %q should not be advertised in the operator palette, got %#v", filter, got)
		}
	}
}

func TestPaletteDefaultOverviewUsesThreeAreaColumnsOnDemoWidth(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 150
	a.height = 40
	a.caps.Capabilities.XClioAgentBlueprints = true
	a.caps.Capabilities.XClioExpertPacks = true
	a.paletteOpen = true

	out := ansi.Strip(a.viewPalette())
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

func TestPaletteClassifiesThemeNavigationAndMCPPrompts(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	trueValue := true
	a.commands = []gact.Command{
		{ID: "/theme-next", Title: "Cycle next theme", Source: "builtin"},
		{ID: "/theme-prev", Title: "Cycle previous theme", Source: "builtin"},
		{
			ID: "/summarize", Title: "Summarize MCP text", Source: "mcp_prompt",
			CommandSource: "mcp_prompt", Invocation: "mcp_prompt",
			UserInvocable: &trueValue, AgentInvocable: &trueValue, PlannerVisible: &trueValue,
		},
	}

	a.paletteFilter = ""
	for _, cmd := range a.paletteVisibleMatches() {
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
	out := ansi.Strip(a.viewPalette())
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
	a.paletteOpen = true
	a.commands = []gact.Command{
		{ID: "/custom-report", Title: "Custom Report", Source: "backend"},
		{ID: "/tools", Title: "Tools", Source: "builtin"},
	}

	if group := paletteCommandGroup(a.commands[0]); group != "Extension Commands" {
		t.Fatalf("unknown backend command group = %q, want Extension Commands", group)
	}
	out := ansi.Strip(a.viewPalette())
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
	a.commands = []gact.Command{
		{ID: "/tools", Title: "Runtime", Source: "builtin"},
		{ID: "/catalog", Title: "Catalog", Source: "builtin"},
	}
	a.paletteFilter = "catalog"

	matches := a.paletteVisibleMatches()
	if len(matches) != 0 {
		t.Fatalf("deprecated /catalog command should not be advertised by search, got %#v", matches)
	}
}

func TestPaletteCategorySelectionFiltersDefaultCommands(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.caps.Capabilities.XClioAgentBlueprints = true
	a.caps.Capabilities.XClioExpertPacks = true
	a.paletteOpen = true

	if a.paletteGroup != "" {
		t.Fatalf("initial palette group = %q, want all", a.paletteGroup)
	}
	model, _ := a.handlePaletteKey(keyMsg("tab"))
	a = model.(*App)
	if a.paletteGroup != "Session" {
		t.Fatalf("palette group after tab = %q, want Session", a.paletteGroup)
	}
	for _, cmd := range a.paletteVisibleMatches() {
		if group := paletteCommandGroup(cmd); group != "Session" {
			t.Fatalf("session-filtered palette included %s in %s", cmd.ID, group)
		}
	}

	for i := 0; i < 2; i++ {
		model, _ = a.handlePaletteKey(keyMsg("tab"))
		a = model.(*App)
	}
	if a.paletteGroup != "Runtime" {
		t.Fatalf("palette group after three tabs = %q, want Runtime", a.paletteGroup)
	}
	out := ansi.Strip(a.viewPalette())
	if !strings.Contains(out, "/tools") || strings.Contains(out, "/clear") {
		t.Fatalf("runtime palette should show capability commands only:\n%s", out)
	}

	a.paletteFilter = "theme"
	if got := a.paletteVisibleMatches(); len(got) == 0 || got[0].ID != "/theme" {
		t.Fatalf("explicit search should ignore category filter, got %#v", got)
	}
}

func TestPaletteCategoryOrderPrioritizesOperatorEntrypoints(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.caps.Capabilities.XClioAgentBlueprints = true
	a.caps.Capabilities.XClioExpertPacks = true
	a.caps.Capabilities.XClioPromptRegistry = true
	a.paletteGroup = "Runtime"

	matches := a.paletteVisibleMatches()
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
	a.caps.Capabilities.XClioPromptRegistry = true
	a.paletteOpen = true
	a.paletteGroup = "Runtime"

	out := ansi.Strip(a.viewPalette())
	for _, want := range []string{
		"Runtime area - tools, MCP, prompts",
		"┌─ ▌ /tools",
		"Browse actions and MCP",
		"Enter open Actions and MCP",
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
	a.paletteOpen = true
	a.paletteGroup = "Runtime"
	a.paletteSel = 2

	model, _ := a.handlePaletteKey(keyMsg("backspace"))
	a = model.(*App)
	if a.paletteGroup != "" || a.paletteSel != 0 {
		t.Fatalf("backspace from category should return to area overview, group=%q sel=%d", a.paletteGroup, a.paletteSel)
	}
	if !a.paletteShowingGroupOverview() {
		t.Fatalf("palette should show area overview after category backspace:\n%s", ansi.Strip(a.viewPalette()))
	}
}

func TestPaletteFilterBackspaceStillEditsTextBeforeAreaNavigation(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.paletteOpen = true
	a.paletteGroup = "Runtime"
	a.paletteFilter = "tools"
	a.paletteCursor = len(a.paletteFilter)
	a.paletteCursorSet = true

	model, _ := a.handlePaletteKey(keyMsg("backspace"))
	a = model.(*App)
	if a.paletteGroup != "Runtime" {
		t.Fatalf("editing filter should not leave category, group=%q", a.paletteGroup)
	}
	if a.paletteFilter != "tool" {
		t.Fatalf("backspace should edit filter before category navigation, filter=%q", a.paletteFilter)
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
	a.commands = []gact.Command{
		{ID: "/tools", Title: "Runtime", Description: "Unified catalog of built-in, recipe, extension, and MCP-provided tools", Source: "builtin"},
		{ID: "/mcp", Title: "MCP connections", Description: "Inspect MCP connection health, resources, prompts, and management actions", Source: "builtin"},
	}

	matches := a.paletteMatches()
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
	a.caps.Capabilities.XClioAgentBlueprints = true
	a.caps.Capabilities.XClioExpertPacks = true
	a.paletteOpen = true

	if !a.paletteShowingGroupOverview() {
		t.Fatalf("empty palette should land on category overview:\n%s", ansi.Strip(a.viewPalette()))
	}
	model, _ := a.handlePaletteKey(keyMsg("enter"))
	a = model.(*App)
	if a.paletteGroup != "Session" {
		t.Fatalf("enter on first category set group %q, want Session", a.paletteGroup)
	}
	out := ansi.Strip(a.viewPalette())
	if !strings.Contains(out, "/clear") || strings.Contains(out, "/tools") {
		t.Fatalf("session category should show session commands only:\n%s", out)
	}
}

func TestPaletteOverviewUsesBrowseHint(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.caps.Capabilities.XClioAgentBlueprints = true
	a.caps.Capabilities.XClioExpertPacks = true
	a.paletteOpen = true

	out := ansi.Strip(a.viewPalette())
	if !strings.Contains(out, "Enter browse area") || !strings.Contains(out, "Tab cycle areas") {
		t.Fatalf("group overview should describe category browsing:\n%s", out)
	}
	if strings.Contains(out, "Enter run") {
		t.Fatalf("group overview should not describe Enter as running a command:\n%s", out)
	}

	a.paletteGroup = "Runtime"
	out = ansi.Strip(a.viewPalette())
	if !strings.Contains(out, "Enter open Actions and MCP") {
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
	a.commands = []gact.Command{
		{ID: "/tools", Title: "Tools", Description: "Browse callable tools", Source: "builtin"},
		{ID: "/summarize", Title: "Summarize", Source: "mcp_prompt", CommandSource: "mcp_prompt", Invocation: "mcp_prompt"},
	}
	a.paletteOpen = true
	a.paletteFilter = "tools"

	out := ansi.Strip(a.viewPalette())
	if !strings.Contains(out, "Enter open Actions and MCP") {
		t.Fatalf("/tools footer should describe catalog open:\n%s", out)
	}

	a.paletteFilter = "summarize"
	a.paletteSel = 0
	out = ansi.Strip(a.viewPalette())
	if !strings.Contains(out, "Enter run prompt") {
		t.Fatalf("MCP prompt footer should describe prompt execution:\n%s", out)
	}
}

func TestPaletteAgentSettingsCommandUsesExpertLanguage(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.commands = []gact.Command{
		{ID: "/agent", Title: "Agent", Description: "Choose default expert", Source: "builtin"},
	}
	a.paletteOpen = true
	a.paletteGroup = "Settings"

	out := ansi.Strip(a.viewPalette())
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
	a.commands = []gact.Command{
		{ID: "/duplicate", Title: "Copy current session's title/expert to a fresh session", Source: "builtin"},
	}
	a.paletteOpen = true
	a.paletteGroup = "Session"

	out := ansi.Strip(a.viewPalette())
	for _, want := range []string{"/duplicate", "Copy title and expert"} {
		if !strings.Contains(out, want) {
			t.Fatalf("/duplicate palette should use operator expert language %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "title/model/agent") {
		t.Fatalf("/agent footer leaked stale agent wording:\n%s", out)
	}
}

func TestAgentBlueprintManageModalUsesSharedTextEntrySemantics(t *testing.T) {
	a := newReadyApp(nil, nil)

	a.openAgentBlueprintManage(agentBlueprintManageInstall)
	installView := ansi.Strip(a.viewAgentBlueprintManage())
	for _, want := range []string{"Install agent blueprint", "install", "current workspace"} {
		if !strings.Contains(installView, want) {
			t.Fatalf("install modal missing %q:\n%s", want, installView)
		}
	}

	a.openAgentBlueprintManage(agentBlueprintManageValidate)
	_, _ = a.handleAgentBlueprintManageKey(keyMsg("/"))
	if a.agentBlueprintManageInput != "/" {
		t.Fatalf("slash-prefixed paths should be editable, input=%q", a.agentBlueprintManageInput)
	}
	a.agentBlueprintManageInput = ""
	a.agentBlueprintManageCursor = 0
	_, _ = a.Update(tea.PasteMsg{Content: "/workspace/My Blueprint/\r\nAGENT.md\n"})
	if a.agentBlueprintManageInput != "/workspace/My Blueprint/AGENT.md" {
		t.Fatalf("paste should route to blueprint modal, input=%q", a.agentBlueprintManageInput)
	}
	a.agentBlueprintManageInput = ""
	a.agentBlueprintManageCursor = 0
	validateView := ansi.Strip(a.viewAgentBlueprintManage())
	for _, want := range []string{"Validate agent blueprint", "validate", "without", "installing"} {
		if !strings.Contains(validateView, want) {
			t.Fatalf("validate modal missing %q:\n%s", want, validateView)
		}
	}

	_, _ = a.handleAgentBlueprintManageKey(keyMsg("enter"))
	if !strings.Contains(a.agentBlueprintManageErr, "required") {
		t.Fatalf("empty validate submit should surface a truthful error, got %q", a.agentBlueprintManageErr)
	}
}

func TestAgentBlueprintInstallPrefillsLastValidatedSource(t *testing.T) {
	a := newReadyApp(nil, nil)
	source := "/workspace/.clio/agent-blueprints/data/AGENT.md"

	model, _ := a.Update(agentBlueprintManageDoneMsg{
		action: agentBlueprintManageValidate,
		source: source,
		check:  gact.AgentBlueprintValidationResult{Enabled: true},
	})
	a = model.(*App)
	if a.agentBlueprintLastValidatedSource != source {
		t.Fatalf("last validated source = %q, want %q", a.agentBlueprintLastValidatedSource, source)
	}

	a.openAgentBlueprintManage(agentBlueprintManageInstall)
	if a.agentBlueprintManageInput != source {
		t.Fatalf("install input = %q, want validated source", a.agentBlueprintManageInput)
	}
	if a.agentBlueprintManageCursor != len([]rune(source)) {
		t.Fatalf("install cursor = %d, want end of source", a.agentBlueprintManageCursor)
	}
	out := ansi.Strip(a.viewAgentBlueprintManage())
	for _, want := range []string{"Prefilled from the last successful validation", source} {
		if !strings.Contains(out, want) {
			t.Fatalf("install modal missing prefill hint %q:\n%s", want, out)
		}
	}
}

func TestAgentBlueprintManageButtonsUseSemanticHitTargets(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.openAgentBlueprintManage(agentBlueprintManageValidate)

	a.beginHitFrame()
	modal := a.viewAgentBlueprintManage()
	validateTarget, ok := findHitTargetForTest(a, "button:agent-blueprint-manage:validate")
	if !ok {
		t.Fatal("missing validate button hit target")
	}
	cancelTarget, ok := findHitTargetForTest(a, "button:agent-blueprint-manage:cancel")
	if !ok {
		t.Fatal("missing cancel button hit target")
	}
	rect := overlayMouseRect(modal, a.width, a.height)
	for id, target := range map[string]uiHitTarget{
		"validate": validateTarget,
		"cancel":   cancelTarget,
	} {
		if wantY := rect.y + 2; target.rect.y != wantY {
			t.Fatalf("%s button y = %d, want shared header row %d", id, target.rect.y, wantY)
		}
	}

	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      validateTarget.rect.x,
		Y:      validateTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("empty validate click should not dispatch a backend command")
	}
	if !a.agentBlueprintManageOpen {
		t.Fatal("empty validate click should keep modal open")
	}
	if !strings.Contains(a.agentBlueprintManageErr, "required") {
		t.Fatalf("empty validate click should surface required error, got %q", a.agentBlueprintManageErr)
	}

	a.beginHitFrame()
	_ = a.viewAgentBlueprintManage()
	cancelTarget, ok = findHitTargetForTest(a, "button:agent-blueprint-manage:cancel")
	if !ok {
		t.Fatal("missing cancel button hit target after validation error")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      cancelTarget.rect.x,
		Y:      cancelTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("cancel click should not dispatch a backend command")
	}
	if a.agentBlueprintManageOpen {
		t.Fatal("cancel click should close blueprint manage modal")
	}
}

func TestFormatResolvedPromptShowsProvenanceAndText(t *testing.T) {
	out := formatResolvedPrompt(gact.ResolvedPrompt{
		ID: "clio.chat", Profile: "debug", Scope: "global", SourcePath: "/tmp/prompt.md",
		Provider: "openai", Model: "gpt-5", Checksum: "abc123", FallbackProfile: "default",
		Text: "Stay grounded.", Metadata: map[string]any{"saved_by": "test"},
	})

	for _, want := range []string{
		"status: fallback profile used",
		"fallback profile: default",
		"provider: openai",
		"model: gpt-5",
		"source: /tmp/prompt.md",
		"Operator paths",
		"render preview: inspect the runtime prompt with session and workspace substitutions applied",
		"validate: check an edited profile before using it in a session",
		"customize: edit a profile or save the current profile as a codex override",
		"saved_by",
		"Stay grounded.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("resolved prompt detail missing %q:\n%s", want, out)
		}
	}
	for _, raw := range []string{"press e", "s to save profile as codex", "Actions"} {
		if strings.Contains(out, raw) {
			t.Fatalf("resolved prompt detail should keep keypresses in footer/actions, found %q:\n%s", raw, out)
		}
	}
}

func TestFormatRenderedPromptValidationAndReload(t *testing.T) {
	rendered := formatRenderedPrompt(gact.ResolvedPrompt{
		ID: "clio.chat", Profile: "heavy", Scope: "workspace", SourcePath: "/tmp/prompt.md",
		Checksum: "abc", Text: "Rendered body", Metadata: map[string]any{
			"session_id":   "s1",
			"workspace_id": "",
			"rendered":     true,
			"prompt_family": map[string]any{
				"id": "clio.chat",
			},
		},
	})
	for _, want := range []string{"Rendered body", "Operator context", "prompt: clio.chat", "profile: heavy", "scope: workspace", "Technical provenance", "checksum: abc", "Render provenance", "session: s1", "prompt family:"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("rendered prompt missing %q:\n%s", want, rendered)
		}
	}
	if strings.Index(rendered, "Rendered body") > strings.Index(rendered, "Operator context") {
		t.Fatalf("rendered prompt body should appear before runtime provenance:\n%s", rendered)
	}
	for _, raw := range []string{`"session_id": "s1"`, "session_id:", "prompt_family:", "prompt id:", "prompt scope:", "rendered: true", `workspace: ""`, `workspace: "\"\""`} {
		if strings.Contains(rendered, raw) {
			t.Fatalf("rendered prompt should show provenance as operator labels, found %q:\n%s", raw, rendered)
		}
	}

	validation := formatPromptValidation(gact.PromptValidationResult{
		Enabled: false, ValidationErrors: []string{"unknown placeholder"},
		Prompt: gact.PromptDefinition{ID: "clio.chat", Scope: "workspace"},
	})
	for _, want := range []string{"status: invalid", "unknown placeholder", "prompt: clio.chat", "scope: workspace"} {
		if !strings.Contains(validation, want) {
			t.Fatalf("validation missing %q:\n%s", want, validation)
		}
	}
	for _, raw := range []string{"prompt_id:", "prompt id:", "prompt scope:"} {
		if strings.Contains(validation, raw) {
			t.Fatalf("validation should not expose raw prompt label %q:\n%s", raw, validation)
		}
	}

	reload := formatPromptReload(gact.PromptReloadResult{
		PromptCount: 2, PromptIDs: []string{"a", "b"}, Sources: []gact.PromptSource{{Scope: "workspace", Root: "/repo/.clio/prompts"}},
	})
	for _, want := range []string{"prompts loaded: 2", "prompt ids: a, b", "workspace: /repo/.clio/prompts"} {
		if !strings.Contains(reload, want) {
			t.Fatalf("reload missing %q:\n%s", want, reload)
		}
	}
	for _, raw := range []string{"prompt_count:", "prompt_ids:"} {
		if strings.Contains(reload, raw) {
			t.Fatalf("reload should not expose raw %q label:\n%s", raw, reload)
		}
	}
}

func TestPromptCatalogEmptyStateExplainsScope(t *testing.T) {
	items := promptCatalogItems(nil, client.RuntimeScope{WorkspaceID: "ws1", SessionID: "s1"})
	if len(items) != 3 {
		t.Fatalf("items len = %d, want empty-state checklist rows", len(items))
	}
	row := items[0]
	if row.disabled || row.statusTag != "empty" {
		t.Fatalf("empty prompt row should be visible empty state without disabled chrome: %#v", row)
	}
	combined := catalogItemTestText(items)
	for _, want := range []string{"No prompts available", "workflow prompt library is empty", "Activate workflow", "open /agent-blueprints and activate workflow", "Reload prompt library", "reopen /prompts after activation"} {
		if !strings.Contains(combined, want) {
			t.Fatalf("empty prompt checklist missing %q:\n%s", want, combined)
		}
	}
	if intro := catalogBrowserIntro(catalogKindPrompts); !strings.Contains(intro, "active workspace/session") || !strings.Contains(intro, "session override prompts") {
		t.Fatalf("prompt intro should explain prompt scope, got %q", intro)
	}

	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindPrompts,
		title: "Prompts",
		items: items,
	}
	hint := catalogBrowserHintText(a.catalogBrowser)
	if !strings.Contains(hint, "/agent-blueprints activate workflow") || strings.Contains(hint, "Enter prompt profiles") {
		t.Fatalf("empty prompt hint should route operators to activation path, got %q", hint)
	}
	_, cmd := a.handleCatalogBrowserKey(keyMsg("enter"))
	if cmd != nil {
		t.Fatal("enter on prompt empty state should not dispatch detail load")
	}
	a.catalogBrowser.sel = 1
	_, cmd = a.handleCatalogBrowserKey(keyMsg("enter"))
	if cmd != nil {
		t.Fatal("enter on prompt empty-state checklist row should not dispatch detail load")
	}
}

func TestCatalogBrowserContextLineShowsPromptScope(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.wsID = "ws_demo"
	a.workspaces = []gact.Workspace{{ID: "ws_demo", Name: "DemoBench"}}
	a.sessions = []gact.Session{{
		ID:    "s1",
		Title: "San Diego review",
		Metadata: map[string]any{
			"active_agent_blueprint_id":    "seismic-waveform-review",
			"active_agent_blueprint_scope": "session",
		},
	}}
	a.selected = 0
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindPrompts,
		title: "Prompts",
		items: promptCatalogItems([]gact.PromptDefinition{{
			ID: "clio.main.planner", Title: "Main planner", Scope: "agent_blueprint",
		}}, a.runtimeScope()),
	}

	out := ansi.Strip(a.viewCatalogBrowser())
	for _, want := range []string{
		"Context:",
		"workspace DemoBench",
		"session San Diego review",
		"workflow seismic-waveform-review",
		"(session)",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("prompt catalog context missing %q:\n%s", want, out)
		}
	}
}

func TestCatalogBrowserContextLineExplainsMissingSessionAndWorkflow(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.wsID = "ws_demo"
	a.workspaces = []gact.Workspace{{ID: "ws_demo", Name: "DemoBench"}}
	a.selected = -1
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindExpertPacks,
		title: "Expert Packs",
		items: expertPackCatalogItems(nil),
	}

	out := ansi.Strip(a.viewCatalogBrowser())
	for _, want := range []string{
		"Context:",
		"workspace DemoBench",
		"session no session selected",
		"workflow no active workflow",
		"blueprint",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("expert-pack catalog context missing %q:\n%s", want, out)
		}
	}
}

func TestPromptCatalogEmptyStateExplainsMissingSession(t *testing.T) {
	items := promptCatalogItems(nil, client.RuntimeScope{WorkspaceID: "ws1"})
	if len(items) != 3 {
		t.Fatalf("items len = %d, want empty-state checklist rows", len(items))
	}
	row := items[0]
	combined := catalogItemTestText(items)
	for _, want := range []string{"No prompts available", "No session is selected", "Start or select a session", "start/select a session first", "Then activate workflow", "open /agent-blueprints after selecting a session", "reopen /prompts after activation"} {
		if !strings.Contains(combined, want) {
			t.Fatalf("empty prompt checklist without session missing %q:\n%s", want, combined)
		}
	}
	if !strings.Contains(row.inlineDesc, "start/select a session first") || strings.Contains(row.inlineDesc, "workspace/session") {
		t.Fatalf("empty prompt inline guidance should be session-specific: %#v", row)
	}
}

func TestPromptCatalogHintUsesProviderWording(t *testing.T) {
	cb := &catalogBrowserState{
		kind: catalogKindPrompts,
		items: []catalogItem{
			{id: "provider/built-in", title: "Provider · Built-in"},
			{id: "clio.chat", title: "└─ Chat agent"},
		},
	}
	if hint := catalogBrowserHintText(cb); !strings.Contains(hint, "Enter provider summary") || strings.Contains(hint, "source summary") {
		t.Fatalf("provider row hint should use prompt-provider wording, got %q", hint)
	}
	cb.sel = 1
	if hint := catalogBrowserHintText(cb); !strings.Contains(hint, "Enter prompt profiles") {
		t.Fatalf("prompt row hint should open profiles, got %q", hint)
	}
}

func TestSkillsCatalogEmptyStateExplainsInstallPath(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/agents" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"agents":[]}`))
	}))
	defer server.Close()

	msg, ok := loadCatalogBrowserCmd(client.New(server.URL), catalogKindSkills, client.RuntimeScope{})().(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatal("skills catalog loader should return catalogBrowserLoadedMsg")
	}
	if msg.errText != "" {
		t.Fatalf("skills catalog load failed: %s", msg.errText)
	}
	if len(msg.items) != 1 {
		t.Fatalf("items len = %d, want one empty-state row", len(msg.items))
	}
	row := msg.items[0]
	if row.id != "none" || row.title != "No skills available" || row.statusTag != "empty" {
		t.Fatalf("skills empty row = %#v", row)
	}
	for _, want := range []string{"Install or activate", "agent blueprint", "skills"} {
		if !strings.Contains(row.desc, want) {
			t.Fatalf("skills empty row missing %q: %#v", want, row)
		}
	}
	for _, notWant := range []string{"source=skill", "backend", "agent source"} {
		if strings.Contains(row.title+" "+row.desc, notWant) {
			t.Fatalf("skills empty row leaked backend wording %q: %#v", notWant, row)
		}
	}
	if intro := catalogBrowserIntro(catalogKindSkills); !strings.Contains(intro, "installed experts") || !strings.Contains(intro, "active workflow blueprints") || !strings.Contains(intro, "/agent-blueprints") {
		t.Fatalf("skills intro should point to install path, got %q", intro)
	}
	emptyHint := catalogBrowserHintText(&catalogBrowserState{kind: catalogKindSkills, items: msg.items})
	if !strings.Contains(emptyHint, "/agent-blueprints add skills") || strings.Contains(emptyHint, "Enter details") {
		t.Fatalf("empty skills hint should route operators to blueprint install path, got %q", emptyHint)
	}
	if hint := catalogBrowserHintText(&catalogBrowserState{kind: catalogKindSkills, items: []catalogItem{{id: "skill", title: "Skill"}}}); !strings.Contains(hint, "Enter details") {
		t.Fatalf("skills hint should advertise details drill-down, got %q", hint)
	}

	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindSkills,
		title: "Skills",
		items: msg.items,
	}
	_, cmd := a.handleCatalogBrowserKey(keyMsg("enter"))
	if cmd != nil {
		t.Fatal("enter on skills empty state should not dispatch detail load")
	}
}

func TestOpenPromptDetailDoesNotDuplicatePromptPrefix(t *testing.T) {
	a := newReadyApp(nil, nil)
	cmd := a.openPromptDetail("clio.chat", "Prompt · Chat")
	if cmd == nil {
		t.Fatal("openPromptDetail should dispatch a detail load command")
	}
	if a.catalogBrowser == nil || a.catalogBrowser.title != "Prompt · Chat" {
		t.Fatalf("prompt detail title = %#v, want single Prompt prefix", a.catalogBrowser)
	}
}

func TestPromptDetailSeparatesManagementFromProfiles(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 36
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:          catalogKindPromptDetail,
		title:         "Prompt · Chat",
		promptID:      "clio.chat",
		promptProfile: "default",
		items: []catalogItem{
			{id: "prompt/clio.chat", title: "Definition · Chat", desc: "General conversation", statusTag: "builtin"},
			{id: "profile/debug", title: "└─ debug", desc: "diagnostic output", statusTag: "builtin"},
			{id: "profile/default", title: "└─ default", desc: "operator output", statusTag: "builtin default"},
		},
	}

	out := ansi.Strip(a.viewCatalogBrowser())
	for _, want := range []string{"Management", "render default", "validate default", "reload registry", "Prompt and profiles", "Definition · Chat", "└─ debug", "└─ default", "Enter details", "s save->codex"} {
		if !strings.Contains(out, want) {
			t.Fatalf("prompt detail missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "Enter text") {
		t.Fatalf("prompt detail footer should not imply rows are raw text:\n%s", out)
	}
	if strings.Contains(out, "Profile ·") {
		t.Fatalf("prompt detail profile tree should not repeat object type labels:\n%s", out)
	}
	for _, legacyActionRow := range []string{"Rendered runtime preview", "Validate prompt", "Reload prompt registry"} {
		if strings.Contains(out, legacyActionRow) {
			t.Fatalf("prompt detail leaked legacy action row %q:\n%s", legacyActionRow, out)
		}
	}
}

func TestPromptDetailManagementShortcutsDispatch(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:          catalogKindPromptDetail,
		title:         "Prompt · Chat",
		promptID:      "clio.chat",
		promptProfile: "default",
		items: []catalogItem{
			{id: "prompt/clio.chat", title: "Definition · Chat"},
			{id: "profile/default", title: "└─ Profile · default"},
		},
	}

	for _, key := range []string{"r", "v", "u"} {
		_, cmd := a.handleCatalogBrowserKey(keyMsg(key))
		if cmd == nil {
			t.Fatalf("%q in prompt detail should dispatch a management command", key)
		}
	}
}

func TestAgentPromptResolutionDescription(t *testing.T) {
	got := agentPromptResolutionDescription(gact.AgentDef{Metadata: map[string]any{
		"prompt_resolution": map[string]any{
			"id": "clio.expert.data", "profile": "heavy", "scope": "global", "status": "resolved",
			"provider": "openai", "model": "gpt-5",
		},
	}})
	for _, want := range []string{"prompt: clio.expert.data", "profile: heavy", "scope: global", "status: resolved", "provider: openai", "model: gpt-5"} {
		if !strings.Contains(got, want) {
			t.Fatalf("prompt resolution missing %q: %q", want, got)
		}
	}
	for _, raw := range []string{"prompt id:", "prompt scope:"} {
		if strings.Contains(got, raw) {
			t.Fatalf("prompt resolution should avoid backend-ish label %q: %q", raw, got)
		}
	}
}

func TestPromptEditModalStatesBuiltinOverrideScope(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.openPromptEdit("clio.chat", "default", "Chat", "Use grounded answers.")
	out := a.viewPromptEdit()
	for _, want := range []string{"Edit prompt override · clio.chat", "profile codex", "Use grounded answers."} {
		if !strings.Contains(out, want) {
			t.Fatalf("prompt edit modal missing %q:\n%s", want, out)
		}
	}
}

func TestExpertPackCatalogItemsSurfaceScopeAndValidation(t *testing.T) {
	items := expertPackCatalogItems([]gact.ExpertPackDefinition{{
		ID: "data-semantics", Title: "Data Semantics", Version: "1.0.0", Scope: "workspace",
		DefinitionPath: "/tmp/.clio/expert-packs/data-semantics/clio-pack.yaml",
		Description:    "Routes data questions to specialist agents.",
		Enabled:        true,
	}, {
		ID: "broken", Title: "Broken", Scope: "session", Enabled: false,
		Description:      "Invalid pack kept visible for validation diagnostics.",
		ValidationErrors: []string{"missing root agent"},
	}})

	if len(items) != 2 {
		t.Fatalf("items len = %d, want 2", len(items))
	}
	if items[0].id != "broken" || items[0].statusTag != "invalid" {
		t.Fatalf("invalid expert pack should be first session-scoped invalid row: %#v", items[0])
	}
	for _, want := range []string{"Routes data questions", "ready", "workspace", "v1.0.0"} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("expert-pack catalog desc missing %q: %q", want, items[1].desc)
		}
	}
	for _, raw := range []string{"version:", "definition file:"} {
		if strings.Contains(items[1].desc, raw) {
			t.Fatalf("expert-pack catalog desc should not expose raw metadata %q: %q", raw, items[1].desc)
		}
	}
	for _, want := range []string{"ready", "workspace", "v1.0.0"} {
		if !strings.Contains(items[1].inlineDesc, want) {
			t.Fatalf("expert-pack inline summary missing %q: %q", want, items[1].inlineDesc)
		}
	}
	if strings.Contains(items[1].inlineDesc, "Routes data questions") {
		t.Fatalf("expert-pack inline summary should keep long prose for detail view: %q", items[1].inlineDesc)
	}
	for _, raw := range []string{"invalid ·", "validation error"} {
		if strings.Contains(items[0].inlineDesc, raw) {
			t.Fatalf("invalid expert-pack inline summary should not repeat status/validation chrome %q: %q", raw, items[0].inlineDesc)
		}
	}
	if !strings.Contains(items[0].inlineDesc, "needs fix: missing root agent") {
		t.Fatalf("invalid expert-pack inline summary should include concise validation reason: %q", items[0].inlineDesc)
	}
	if strings.Contains(items[0].inlineDesc, "Invalid pack kept visible") {
		t.Fatalf("invalid expert-pack inline summary should prioritize the repair reason over filler descriptions: %q", items[0].inlineDesc)
	}
	items = expertPackCatalogItems([]gact.ExpertPackDefinition{{
		ID: "broken-parent", Title: "Broken Parent", Scope: "workspace", Enabled: false,
		ValidationErrors: []string{"parent_id references missing expert"},
	}})
	if strings.Contains(items[0].inlineDesc, "parent_id") || !strings.Contains(items[0].inlineDesc, "missing parent expert") {
		t.Fatalf("expert-pack validation reason should use operator text: %q", items[0].inlineDesc)
	}
}

func TestExpertPackCatalogEmptyStateExplainsPurpose(t *testing.T) {
	items := expertPackCatalogItems(nil)
	if len(items) != 3 {
		t.Fatalf("items len = %d, want empty-state checklist rows", len(items))
	}
	row := items[0]
	if row.disabled || row.statusTag != "empty" {
		t.Fatalf("empty expert-pack row should be non-actionable empty state without disabled chrome: %#v", row)
	}
	combined := catalogItemTestText(items)
	for _, want := range []string{"No expert packs installed", "workflow pack library is empty", "Install workflow pack", "open /agent-blueprints and install from marketplace", "Activate for session", "reopen /expert-packs and activate for session"} {
		if !strings.Contains(combined, want) {
			t.Fatalf("empty expert-pack checklist missing %q:\n%s", want, combined)
		}
	}
	if intro := catalogBrowserIntro(catalogKindExpertPacks); !strings.Contains(intro, "workflow-ready experts") {
		t.Fatalf("expert-pack intro should explain the concept, got %q", intro)
	} else if strings.Contains(intro, "runtimes") || strings.Contains(intro, "specialist agents") {
		t.Fatalf("expert-pack intro should avoid backend/runtime agent wording, got %q", intro)
	}
	if hint := catalogBrowserHintText(&catalogBrowserState{kind: catalogKindExpertPacks, items: []catalogItem{{id: "pack", title: "Pack"}}}); !strings.Contains(hint, "Enter details") || strings.Contains(hint, "Enter inspect") {
		t.Fatalf("expert-pack catalog hint should use operator detail wording, got %q", hint)
	}

	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindExpertPacks,
		title: "Expert Packs",
		items: items,
	}
	hint := catalogBrowserHintText(a.catalogBrowser)
	if !strings.Contains(hint, "/agent-blueprints") || !strings.Contains(hint, "install workflow packs") {
		t.Fatalf("empty expert-pack hint should route operators to installation path, got %q", hint)
	}
	_, cmd := a.handleCatalogBrowserKey(keyMsg("enter"))
	if cmd != nil {
		t.Fatal("enter on expert-pack empty state should not dispatch detail load")
	}
	a.catalogBrowser.sel = 1
	_, cmd = a.handleCatalogBrowserKey(keyMsg("enter"))
	if cmd != nil {
		t.Fatal("enter on expert-pack empty-state checklist row should not dispatch detail load")
	}
}

func catalogItemTestText(items []catalogItem) string {
	parts := make([]string, 0, len(items)*4)
	for _, item := range items {
		parts = append(parts, item.title, item.desc, item.inlineDesc, item.statusTag)
	}
	return strings.Join(parts, "\n")
}

func TestExpertPackCatalogInstallShortcutOpensSourceModal(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.stage = StageReady
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindExpertPacks,
		title: "Expert Packs",
		items: []catalogItem{{id: "pack/data-semantics", title: "Data Semantics"}},
	}

	model, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: 'i', Text: "i"})
	a = model.(*App)

	if cmd != nil {
		t.Fatalf("install shortcut should only open modal, got cmd %T", cmd)
	}
	if !a.expertPackInstallOpen || !a.catalogBrowserOpen {
		t.Fatalf("expert-pack install modal/catalog open = %v/%v", a.expertPackInstallOpen, a.catalogBrowserOpen)
	}
}

func TestExpertPackInstallRequiresSource(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.openExpertPackInstall()

	model, cmd := a.handleExpertPackInstallKey(keyMsg("enter"))
	a = model.(*App)

	if cmd != nil {
		t.Fatalf("empty install source should not dispatch cmd %T", cmd)
	}
	if got := a.expertPackInstallErr; got != "install source is required" {
		t.Fatalf("install error = %q", got)
	}
}

func TestExpertPackInstallFailureStaysInModalWithOperatorMessage(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.openExpertPackInstall()
	a.expertPackInstallSaving = true
	err := &client.Error{Status: 502, Code: "install_failed", Message: "expert pack install failed: manifest clio-pack.yaml was not found"}

	model, cmd := a.Update(expertPackManagedMsg{action: "install", err: err})
	a = model.(*App)

	if cmd != nil {
		t.Fatalf("failed install should not schedule follow-up cmd %T", cmd)
	}
	if !a.expertPackInstallOpen || a.expertPackInstallSaving {
		t.Fatalf("failed install modal open/saving = %v/%v", a.expertPackInstallOpen, a.expertPackInstallSaving)
	}
	if got := a.expertPackInstallErr; got != "expert pack install failed: manifest clio-pack.yaml was not found" {
		t.Fatalf("install error = %q", got)
	}
	if strings.Contains(a.expertPackInstallErr, "install_failed") || strings.Contains(a.expertPackInstallErr, "gact:") {
		t.Fatalf("install error leaked backend wrapper: %q", a.expertPackInstallErr)
	}
}

func TestSkillsCatalogRowsLeadWithSkillPurpose(t *testing.T) {
	items := agentCatalogItems([]gact.AgentDef{{
		ID:          "test_writer",
		Source:      "skill",
		Title:       "Test Writer",
		Description: "Writes table-driven Go tests for a target package.",
		Tools:       []string{"read_file", "edit_file"},
		Enabled:     true,
	}}, catalogKindSkills)

	if len(items) != 1 {
		t.Fatalf("items len = %d, want one skill row", len(items))
	}
	if items[0].title != "Test Writer" || items[0].statusTag != "2 tools" {
		t.Fatalf("skill row identity = %#v", items[0])
	}
	for _, want := range []string{"Writes table-driven Go tests", "2 tools"} {
		if !strings.Contains(items[0].inlineDesc, want) {
			t.Fatalf("skill inline summary missing %q: %#v", want, items[0])
		}
	}
	if strings.HasPrefix(items[0].inlineDesc, "2 tools") {
		t.Fatalf("skill inline summary should lead with purpose, not only tool count: %#v", items[0])
	}
}

func TestAgentBlueprintCatalogItemsSurfaceRuntimeMetadata(t *testing.T) {
	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{{
		ID: "data-exploration", Title: "Data Exploration", Version: "1.0.0", Scope: "builtin",
		RootExpert: "data", DefinitionPath: "/tmp/AGENT.md", Description: "Markdown root agent.",
		Enabled: true,
	}, {
		ID: "broken", Title: "Broken", Scope: "workspace", RootExpert: "missing", Enabled: false,
		ValidationErrors: []string{"root_expert not found"},
	}})

	if len(items) != 4 {
		t.Fatalf("items len = %d, want provider + child rows for built-in and workspace", len(items))
	}
	if items[0].id != "provider/built-in" || items[1].id != "data-exploration" || items[2].id != "provider/workspace" || items[3].id != "broken" {
		t.Fatalf("provider-grouped items = %#v", items)
	}
	if items[3].statusTag != "invalid" {
		t.Fatalf("broken blueprint status = %q, want invalid", items[3].statusTag)
	}
	for _, want := range []string{"version: 1.0.0", "root expert: data", "definition file: /tmp/AGENT.md", "Markdown root agent"} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("blueprint desc missing %q: %q", want, items[1].desc)
		}
	}
}

func TestAgentBlueprintCatalogItemsSurfaceSourceProvenance(t *testing.T) {
	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{{
		ID: "seismic-market", Title: "Seismic Marketplace", Version: "1.2.0", Scope: "workspace",
		RootExpert: "orchestrator", Enabled: true,
		Metadata: map[string]any{"install": map[string]any{
			"source":       "https://example.org/community/seismic-agents.git",
			"source_kind":  "git",
			"ref":          "main",
			"commit":       "0123456789abcdef",
			"checksum":     "abcdef0123456789",
			"installed_at": "2026-06-02T20:00:00Z",
			"scope":        "workspace",
		}},
	}})

	if len(items) != 2 {
		t.Fatalf("items len = %d, want 1 blueprint row plus 1 source row", len(items))
	}
	if items[0].id != "source/0" || items[0].title != "Source · community/seismic-agents" {
		t.Fatalf("source row missing or wrong: %#v", items[0])
	}
	if strings.Contains(items[0].title, "git ·") {
		t.Fatalf("source row title should not repeat source kind already shown as status: %#v", items[0])
	}
	if items[1].id != "seismic-market" || !strings.Contains(items[1].title, "└─ Seismic Marketplace") {
		t.Fatalf("source-owned blueprint should render as a child row, got %#v", items[1])
	}
	for _, want := range []string{"branch main", "1 blueprint"} {
		if !strings.Contains(items[0].inlineDesc, want) {
			t.Fatalf("source row inline summary missing %q: %#v", want, items)
		}
	}
	if items[0].statusTag != "available" {
		t.Fatalf("source row should surface marketplace availability, got %#v", items[0])
	}
	for _, notWant := range []string{"ref main", "commit", "0123456789ab", "blueprint(s)", "synced"} {
		if strings.Contains(items[0].inlineDesc, notWant) {
			t.Fatalf("source row inline summary leaked backend wording %q: %#v", notWant, items)
		}
	}
	if !strings.Contains(items[1].inlineDesc, "v1.2.0") || !strings.Contains(items[1].inlineDesc, "installed") {
		t.Fatalf("source-backed rows should expose compact inline summaries: %#v", items)
	}
	for _, notWant := range []string{"version 1.2.0", "root expert orchestrator", "entry orchestrator", "starts at", "ref main", "commit 01234567"} {
		if strings.Contains(items[1].inlineDesc, notWant) {
			t.Fatalf("blueprint inline summary leaked backend wording %q: %#v", notWant, items[1])
		}
	}
	for _, want := range []string{
		"ref: main",
		"commit: 0123456789abcdef",
		"checksum: abcdef0123456789",
		"blueprints: Seismic Marketplace",
	} {
		if !strings.Contains(items[0].desc, want) {
			t.Fatalf("source row desc missing %q:\n%s", want, items[0].desc)
		}
	}
	if strings.Contains(items[0].desc, `"install"`) {
		t.Fatalf("source row should be structured, not raw JSON:\n%s", items[0].desc)
	}
	for _, want := range []string{
		"marketplace state: installed",
		"source: git",
		"from: https://example.org/community/seismic-agents.git",
		"ref: main",
		"commit: 0123456789ab",
		"checksum: abcdef012345",
	} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("blueprint provenance desc missing %q: %q", want, items[1].desc)
		}
	}
}

func TestAgentBlueprintCatalogItemsMarkActiveBlueprintInTree(t *testing.T) {
	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{{
		ID: "seismic-market", Title: "Seismic Marketplace", Version: "1.2.0", Scope: "workspace",
		RootExpert: "main", Enabled: true,
		Metadata: map[string]any{"install": map[string]any{
			"source":      "https://example.org/community/seismic-agents.git",
			"source_kind": "git",
		}},
	}})
	items = markActiveAgentBlueprintCatalogItems(items, "seismic-market", "session")

	if len(items) != 2 {
		t.Fatalf("items len = %d, want source and blueprint rows", len(items))
	}
	row := items[1]
	if row.id != "seismic-market" || !strings.Contains(row.title, "└─ ◆ Seismic Marketplace") {
		t.Fatalf("active blueprint should keep tree indentation and marker: %#v", row)
	}
	if strings.Contains(row.title, "Active ·") {
		t.Fatalf("active blueprint title should use a compact marker, not repeat active text: %#v", row)
	}
	if row.statusTag != "active" || !strings.Contains(row.inlineDesc, "active in selected session") {
		t.Fatalf("active blueprint row should surface active state inline: %#v", row)
	}
}

func TestAgentBlueprintSourceRowsSurfaceFailureState(t *testing.T) {
	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{{
		ID: "stale-market", Title: "Stale Marketplace", Version: "0.9.0", Scope: "workspace",
		RootExpert: "root", Enabled: true,
		Metadata: map[string]any{"install": map[string]any{
			"source":              "https://example.org/community/stale-agents.git",
			"source_kind":         "git",
			"ref":                 "release",
			"status":              "sync_failed",
			"status_message":      "last sync failed",
			"trust":               "community",
			"last_synced_at":      "2026-06-02T19:00:00Z",
			"validation_warnings": []any{"source has not been synced in 7 days"},
			"last_error":          "git fetch exited 128",
			"scope":               "workspace",
		}},
	}})

	if len(items) != 2 {
		t.Fatalf("items len = %d, want blueprint row plus source row", len(items))
	}
	source := items[0]
	if source.statusTag != "attention" {
		t.Fatalf("source status = %q, want attention: %#v", source.statusTag, source)
	}
	for _, want := range []string{
		"status: sync_failed",
		"status message: last sync failed",
		"trust: community",
		"last synced: 2026-06-02T19:00:00Z",
		"Warnings",
		"source has not been synced in 7 days",
		"Validation",
		"git fetch exited 128",
	} {
		if !strings.Contains(source.desc, want) {
			t.Fatalf("source failure detail missing %q:\n%s", want, source.desc)
		}
	}
	if strings.Contains(source.desc, `"install"`) || strings.Contains(source.desc, `"last_error"`) {
		t.Fatalf("source failure row should be structured, not raw JSON:\n%s", source.desc)
	}
}

func TestAgentBlueprintCatalogItemsGroupSourceBackedBlueprints(t *testing.T) {
	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{{
		ID: "builtin", Title: "Bundled Blueprint", Scope: "builtin", RootExpert: "root", Enabled: true,
	}, {
		ID: "available", Title: "Available Marketplace", Scope: "marketplace", RootExpert: "root", Enabled: true,
		Metadata: map[string]any{"install": map[string]any{
			"source":      "https://example.org/community/agents.git",
			"source_kind": "git",
			"ref":         "main",
			"scope":       "marketplace",
		}},
	}, {
		ID: "installed", Title: "Installed Marketplace", Scope: "workspace", RootExpert: "root", Enabled: true,
		Metadata: map[string]any{"install": map[string]any{
			"source":       "https://example.org/community/agents.git",
			"source_kind":  "git",
			"ref":          "main",
			"installed_at": "2026-06-03T07:00:00Z",
			"scope":        "workspace",
		}},
	}})

	if len(items) != 5 {
		t.Fatalf("items len = %d, want one source group, two marketplace rows, one built-in provider, and one bundled row: %#v", len(items), items)
	}
	for i, wantID := range []string{"source/0", "available", "installed", "provider/built-in", "builtin"} {
		if items[i].id != wantID {
			t.Fatalf("items[%d].id = %q, want %q; items=%#v", i, items[i].id, wantID, items)
		}
	}
	if !strings.Contains(items[1].desc, "marketplace state: available") {
		t.Fatalf("available marketplace row missing state:\n%s", items[1].desc)
	}
	if items[1].statusTag != "available" {
		t.Fatalf("available marketplace row status = %q, want available: %#v", items[1].statusTag, items[1])
	}
	if !strings.Contains(items[2].desc, "marketplace state: installed") {
		t.Fatalf("installed marketplace row missing state:\n%s", items[2].desc)
	}
	if items[2].statusTag != "installed" {
		t.Fatalf("installed marketplace row status = %q, want installed: %#v", items[2].statusTag, items[2])
	}
	if !strings.Contains(items[0].desc, "blueprints: Available Marketplace") ||
		!strings.Contains(items[0].desc, "Installed Marketplace") ||
		!strings.Contains(items[0].desc, "scope: marketplace, workspace") {
		t.Fatalf("source rows should describe grouped blueprints: %#v", items)
	}
	if !strings.Contains(items[0].desc, "blueprint states:") ||
		!strings.Contains(items[0].desc, "Available Marketplace (available)") ||
		!strings.Contains(items[0].desc, "Installed Marketplace (installed)") {
		t.Fatalf("source rows should describe per-blueprint install state:\n%s", items[0].desc)
	}
}

func TestAgentBlueprintCatalogItemsSurfaceLifecycleStatusTags(t *testing.T) {
	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{{
		ID: "stale", Title: "Stale Marketplace", Scope: "workspace", RootExpert: "root", Enabled: true,
		Metadata: map[string]any{"install": map[string]any{
			"source":         "https://example.org/community/agents.git",
			"source_kind":    "git",
			"ref":            "main",
			"status":         "update available",
			"status_message": "new commit available",
			"installed_at":   "2026-06-03T07:00:00Z",
		}},
	}, {
		ID: "warning", Title: "Warning Marketplace", Scope: "workspace", RootExpert: "root", Enabled: true,
		ValidationWarnings: []string{"descriptor requires explicit trust"},
		Metadata: map[string]any{"install": map[string]any{
			"source":       "https://example.org/community/agents.git",
			"source_kind":  "git",
			"ref":          "main",
			"installed_at": "2026-06-03T07:00:00Z",
		}},
	}, {
		ID: "invalid", Title: "Invalid Marketplace", Scope: "workspace", RootExpert: "root", Enabled: true,
		ValidationErrors: []string{"missing root expert"},
		Metadata: map[string]any{"install": map[string]any{
			"source":       "https://example.org/community/agents.git",
			"source_kind":  "git",
			"ref":          "main",
			"installed_at": "2026-06-03T07:00:00Z",
		}},
	}})

	if len(items) != 4 {
		t.Fatalf("items len = %d, want one source group and three blueprint rows: %#v", len(items), items)
	}
	want := map[string]string{
		"stale":   "update_available",
		"warning": "warning",
		"invalid": "invalid",
	}
	for _, item := range items {
		if expected, ok := want[item.id]; ok && item.statusTag != expected {
			t.Fatalf("%s status = %q, want %q: %#v", item.id, item.statusTag, expected, item)
		}
	}
	if !strings.Contains(items[1].desc, "marketplace state: installed") {
		t.Fatalf("lifecycle row should keep install state in description:\n%s", items[1].desc)
	}
}

func TestAgentBlueprintCatalogAndDetailSurfaceValidationWarnings(t *testing.T) {
	blueprint := gact.AgentBlueprintDefinition{
		ID: "community-warning", Title: "Community Warning", Version: "0.9.0", Scope: "workspace",
		RootExpert: "root", Enabled: true,
		ValidationWarnings: []string{
			"descriptor requires explicit trust before install",
			"skill ndp resolved from community source",
		},
		Metadata: map[string]any{"install": map[string]any{
			"source":      "https://example.org/community/warning-agents.git",
			"source_kind": "git",
			"ref":         "main",
		}},
	}

	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{blueprint})
	if len(items) != 2 {
		t.Fatalf("items = %#v", items)
	}
	if items[0].statusTag != "attention" {
		t.Fatalf("source row should use attention status for grouped warning-only blueprint: %#v", items[0])
	}
	if !strings.Contains(items[0].desc, "community-warning: descriptor requires explicit trust before install") {
		t.Fatalf("source row should summarize grouped blueprint warnings:\n%s", items[0].desc)
	}
	if items[1].id != "community-warning" || items[1].statusTag != "warning" {
		t.Fatalf("warning-only blueprint should use warning status: %#v", items)
	}
	if !strings.Contains(items[1].inlineDesc, "2 warnings") || strings.Contains(items[1].inlineDesc, "warning(s)") {
		t.Fatalf("warning-only blueprint inline summary should use natural pluralization: %#v", items[1])
	}
	for _, want := range []string{
		"warnings: descriptor requires explicit trust before install; skill ndp resolved from community source",
		"source: git",
		"from: https://example.org/community/warning-agents.git",
	} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("blueprint catalog row missing %q:\n%s", want, items[1].desc)
		}
	}

	detailItems := agentBlueprintDetailItems(gact.AgentBlueprintDetail{AgentBlueprint: blueprint})
	var hasSummaryWarnings, hasWarningRow bool
	for _, item := range detailItems {
		switch item.id {
		case "blueprint/community-warning":
			hasSummaryWarnings = strings.Contains(item.desc, "Validation warnings") &&
				strings.Contains(item.desc, "descriptor requires explicit trust before install") &&
				strings.Contains(item.desc, "skill ndp resolved from community source")
		case "validation-warnings":
			hasWarningRow = item.statusTag == "warning" &&
				strings.Contains(item.desc, "descriptor requires explicit trust before install") &&
				strings.Contains(item.desc, "skill ndp resolved from community source")
		}
	}
	if !hasSummaryWarnings || !hasWarningRow {
		t.Fatalf("blueprint detail missing validation warnings: %#v", detailItems)
	}
}

func TestExpertPackDetailItemsExposeActivationAndAgents(t *testing.T) {
	items := expertPackDetailItems(gact.ExpertPackDetail{
		ExpertPack: gact.ExpertPackDefinition{
			ID: "data-semantics", Title: "Data Semantics", Version: "1.0.0", Scope: "workspace", Enabled: true,
			Defaults: map[string]any{"provider": "openai"},
			Metadata: map[string]any{"install": map[string]any{"source": "git@example.org:data-semantics.git", "commit": "abc123"}},
		},
		Agents: []gact.AgentDef{{
			ID: "data.root", Title: "Data Root", Source: "expert_pack", Enabled: true,
			Tools: []string{"mcp.parquet.read"},
		}},
	})

	if len(items) < 3 {
		t.Fatalf("detail items len = %d, want activation, pack summary, and agent", len(items))
	}
	if items[0].id != "activate" {
		t.Fatalf("first expert-pack detail row = %q, want activate", items[0].id)
	}
	for _, wantID := range []string{"expert-pack-action/update", "expert-pack-action/delete"} {
		var found bool
		for _, item := range items {
			if item.id == wantID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expert-pack detail missing action row %q: %#v", wantID, items)
		}
	}
	for _, want := range []string{"only for the current selected session", "new sessions keep the workspace default"} {
		if !strings.Contains(items[0].desc, want) {
			t.Fatalf("expert-pack activation row missing scope/default text %q: %#v", want, items[0])
		}
	}
	for _, want := range []string{"Operator summary", "workflow", "activation", "session scope", "experts: 1", "tools: mcp.parquet.read"} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("pack summary missing %q:\n%s", want, items[1].desc)
		}
	}
	if !strings.HasPrefix(items[1].title, "Workflow pack · ") {
		t.Fatalf("pack summary title should use operator-facing workflow label: %#v", items[1])
	}
	for _, want := range []string{"Workflow pack identity", "Source evidence"} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("pack summary missing operator-facing section %q:\n%s", want, items[1].desc)
		}
	}
	if strings.Contains(items[1].desc, "session_scope") {
		t.Fatalf("pack summary should not expose raw session_scope label:\n%s", items[1].desc)
	}
	if strings.Contains(items[0].desc+items[1].desc, "backend/workspace") {
		t.Fatalf("expert-pack detail should not expose backend-default wording:\n%s\n%s", items[0].desc, items[1].desc)
	}
	if !strings.Contains(items[1].desc, "provider") {
		t.Fatalf("pack summary should surface defaults metadata:\n%s", items[1].desc)
	}
	if !strings.Contains(items[1].desc, "git@example.org:data-semantics.git") || !strings.Contains(items[1].desc, "abc123") {
		t.Fatalf("pack summary should surface install provenance metadata:\n%s", items[1].desc)
	}
	agentRow := catalogItemByIDForTest(items, "agent/data.root")
	if agentRow.id == "" || !strings.Contains(agentRow.desc, "mcp.parquet.read") {
		t.Fatalf("agent detail row missing drilldown/tool metadata: %#v", agentRow)
	}
	if !strings.Contains(agentRow.inlineDesc, "1 tool") {
		t.Fatalf("agent detail row should expose compact hierarchy/tool summary: %#v", agentRow)
	}
}

func TestExpertPackDetailActionsRenderOutsideStructureRows(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:         catalogKindExpertPackDetail,
		title:        "Expert Pack · Data Semantics",
		expertPackID: "data-semantics",
		items: []catalogItem{
			{id: "activate", title: "Activate for current session"},
			{id: "expert-pack-action/update", title: "Update pack"},
			{id: "expert-pack-action/delete", title: "Delete pack"},
			{id: "pack/data-semantics", title: "Workflow pack · Data Semantics", desc: "Operator summary"},
			{id: "agent/main", title: "Root expert · Main Expert"},
			{id: "agent/analysis", title: "  └─ Expert · Analysis Expert"},
		},
	}

	out := a.viewCatalogBrowser()
	for _, want := range []string{"Pack actions", "activate", "update", "delete", "Pack structure", "Workflow pack · Data Semantics", "Root expert · Main Expert", "└─ Expert · Analysis Expert"} {
		if !strings.Contains(out, want) {
			t.Fatalf("expert-pack detail missing %q:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{"Update pack", "Delete pack"} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("expert-pack action leaked into structure rows as %q:\n%s", unwanted, out)
		}
	}
}

func TestExpertPackDetailItemsUseExpertHierarchy(t *testing.T) {
	items := expertPackDetailItems(gact.ExpertPackDetail{
		ExpertPack: gact.ExpertPackDefinition{ID: "data-semantics", Title: "Data Semantics", Scope: "workspace", Enabled: true},
		Agents: []gact.AgentDef{{
			ID: "main", Title: "Main Expert", Source: "expert_pack", Enabled: true,
		}, {
			ID: "analysis", Title: "Analysis Expert", Source: "expert_pack", Enabled: true, ParentID: "main",
		}},
	})

	joined := catalogItemsTextForTest(items)
	for _, want := range []string{
		"Root expert · Main Expert",
		"└─ Expert · Analysis Expert",
		"reports to Main Expert",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("expert-pack hierarchy missing %q:\n%s", want, joined)
		}
	}
}

func catalogItemByIDForTest(items []catalogItem, id string) catalogItem {
	for _, item := range items {
		if item.id == id {
			return item
		}
	}
	return catalogItem{}
}

func TestCatalogBrowser_ExpertPackDeleteRequiresConfirmation(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:         catalogKindExpertPackDetail,
		title:        "Expert Pack · Data Semantics",
		expertPackID: "data-semantics",
		items: []catalogItem{
			{id: "activate", title: "Activate for current session"},
			{id: "expert-pack-action/delete", title: "Delete pack"},
		},
	}

	model, cmd := a.handleCatalogBrowserKey(keyMsg("d"))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("first expert-pack delete press should schedule confirmation hint")
	}
	if a.catalogBrowser.pendingDeleteExpertPackID != "data-semantics" {
		t.Fatalf("pending expert-pack delete id = %q, want data-semantics", a.catalogBrowser.pendingDeleteExpertPackID)
	}
	if !strings.Contains(a.transientHint, "confirm deleting data-semantics") {
		t.Fatalf("transient hint = %q, want delete confirmation", a.transientHint)
	}
	if hint := catalogBrowserHintText(a.catalogBrowser); !strings.Contains(hint, "confirm delete armed") {
		t.Fatalf("armed expert-pack hint = %q", hint)
	}

	model, cmd = a.handleCatalogBrowserKey(keyMsg("x"))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("non-confirming key should not dispatch delete")
	}
	if a.catalogBrowser.pendingDeleteExpertPackID != "" {
		t.Fatalf("pending expert-pack delete should clear on other key, got %q", a.catalogBrowser.pendingDeleteExpertPackID)
	}
}

func TestExpertPackDetailBlocksInvalidActivation(t *testing.T) {
	items := expertPackDetailItems(gact.ExpertPackDetail{
		ExpertPack: gact.ExpertPackDefinition{
			ID: "broken", Title: "Broken", Scope: "workspace", Enabled: false,
			Description:      "Invalid pack kept visible for validation diagnostics.",
			ValidationErrors: []string{"parent_id references missing expert"},
		},
	})

	if len(items) < 3 {
		t.Fatalf("detail items len = %d, want validation, activation, and pack summary", len(items))
	}
	if items[0].id != "activate" || !items[0].disabled || items[0].statusTag != "blocked" {
		t.Fatalf("invalid expert pack activation should be blocked: %#v", items[0])
	}
	for _, want := range []string{"Activation blocked", "cannot activate until validation errors are resolved"} {
		if !strings.Contains(items[0].title+" "+items[0].desc, want) {
			t.Fatalf("blocked activation row missing %q: %#v", want, items[0])
		}
	}
	if strings.Contains(items[1].desc, "select Activate to use this pack") {
		t.Fatalf("invalid pack summary should not advertise activation:\n%s", items[1].desc)
	}
	if !strings.Contains(items[1].desc, "activation: cannot activate until validation errors are resolved") {
		t.Fatalf("invalid pack summary should explain blocked activation:\n%s", items[1].desc)
	}
	validationRow := catalogItemByIDForTest(items, "validation")
	if !strings.Contains(validationRow.desc, "parent_id references missing expert") {
		t.Fatalf("validation row should preserve backend validation evidence: %#v", validationRow)
	}
}

func TestAgentBlueprintDetailItemsExposeActivationMCPAndAgents(t *testing.T) {
	items := agentBlueprintDetailItems(gact.AgentBlueprintDetail{
		AgentBlueprint: gact.AgentBlueprintDefinition{
			ID: "data-exploration", Title: "Data Exploration", Version: "1.0.0", Scope: "builtin",
			RootExpert: "data", Enabled: true, Defaults: map[string]any{"prompt_profile": "heavy"},
			Metadata: map[string]any{"install": map[string]any{
				"source":              "/tmp/community-blueprints",
				"source_kind":         "path",
				"checksum":            "abcdef0123456789",
				"installed_at":        "2026-06-02T20:00:00Z",
				"status":              "sync_failed",
				"status_message":      "last sync failed",
				"trust":               "community",
				"last_synced_at":      "2026-06-02T19:00:00Z",
				"validation_warnings": []any{"source has not been synced in 7 days"},
				"last_error":          "git fetch exited 128",
			}},
		},
		MCPDescriptors: []map[string]any{{
			"id": "earthscope", "name": "EarthScope MCP", "transport": "stdio",
			"command": "earthscope-mcp", "args": []any{"serve"}, "enabled": false, "status": "disabled",
			"trust":        map[string]any{"policy": "explicit", "trusted": false, "source": "blueprint"},
			"install":      map[string]any{"method": "manual", "status": "missing"},
			"runtime":      map[string]any{"transport": "stdio", "server_id": "mcp_earthscope"},
			"env_policy":   map[string]any{"mode": "restricted", "allowlist": []any{"EARTHSCOPE_TOKEN"}},
			"verification": map[string]any{"status": "unsigned", "checksum": "abcdef0123456789"},
			"validation_warnings": []any{
				"descriptor requires explicit trust before enabling",
			},
		}},
		HookDescriptors: []map[string]any{{
			"id": "pre_message", "title": "Pre Message", "event": "pre_message", "status": "disabled",
			"source": "agent_blueprint", "scope": "workspace", "definition_path": "/tmp/community-blueprints/hooks/pre_message.py",
			"checksum": "0123456789abcdef", "enabled": false,
			"trust":               map[string]any{"policy": "explicit", "trusted": false},
			"validation_warnings": []any{"Blueprint packaged hooks are disabled until explicitly enabled and trusted"},
		}},
		Agents: []gact.AgentDef{{
			ID: "data", Title: "Data Root", Source: "agent_blueprint", Enabled: true,
			Tools: []string{"mcp.parquet.read"}, Commands: []string{"/validate-dataset"},
		}},
	})

	if len(items) < 6 {
		t.Fatalf("detail items len = %d, want activation, blueprint, management actions, mcp, and agent", len(items))
	}
	if items[0].id != "activate" {
		t.Fatalf("first detail row = %q, want activate", items[0].id)
	}
	for _, want := range []string{"only for the current selected session", "new sessions keep the workspace default"} {
		if !strings.Contains(items[0].desc, want) {
			t.Fatalf("blueprint activation row missing scope/default text %q: %#v", want, items[0])
		}
	}
	if !strings.Contains(items[1].desc, "prompt_profile") {
		t.Fatalf("blueprint summary should surface defaults:\n%s", items[1].desc)
	}
	if !strings.HasPrefix(items[1].title, "Blueprint · Data Exploration") {
		t.Fatalf("blueprint summary should use operator blueprint label: %#v", items[1])
	}
	for _, want := range []string{
		"Operator summary",
		"workflow: Data Exploration",
		"status: ready",
		"activation: select Activate to use this blueprint for the current session",
		"session scope: new sessions keep the workspace default",
		"Blueprint identity",
		"id: data-exploration",
	} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("blueprint summary missing operator wording %q:\n%s", want, items[1].desc)
		}
	}
	if strings.Contains(items[1].desc, "activation ready") || strings.Contains(items[1].desc, "blueprint id") {
		t.Fatalf("blueprint summary should not lead with schema-style labels:\n%s", items[1].desc)
	}
	if strings.Contains(items[0].desc+items[1].desc, "backend/workspace") {
		t.Fatalf("blueprint detail should not expose backend-default wording:\n%s\n%s", items[0].desc, items[1].desc)
	}
	for _, want := range []string{"ready", "root: data", "v1.0.0"} {
		if !strings.Contains(items[1].inlineDesc, want) {
			t.Fatalf("blueprint summary inline preview missing %q: %#v", want, items[1])
		}
	}
	if strings.Contains(items[1].inlineDesc, "Operator summary") || strings.Contains(items[1].inlineDesc, "workflow:") {
		t.Fatalf("blueprint inline preview should stay compact: %#v", items[1])
	}
	for _, want := range []string{
		"Source provenance",
		"source url: /tmp/community-blueprints",
		"source type: path",
		"checksum: abcdef0123456789",
		"status: sync_failed",
		"status message: last sync failed",
		"trust: community",
		"last synced: 2026-06-02T19:00:00Z",
		"Source warnings",
		"source has not been synced in 7 days",
		"Source errors",
		"git fetch exited 128",
	} {
		if !strings.Contains(items[1].desc, want) {
			t.Fatalf("blueprint summary missing provenance %q:\n%s", want, items[1].desc)
		}
	}
	if strings.Contains(items[1].desc, `"install"`) {
		t.Fatalf("blueprint install provenance should be structured, not raw metadata JSON:\n%s", items[1].desc)
	}
	if items[2].id != "blueprint-action/update" || !items[2].disabled {
		t.Fatalf("builtin blueprint update action should be visible but disabled: %#v", items[2])
	}
	for _, want := range []string{"protected scope: builtin", "source: /tmp/community-blueprints", "status: sync_failed", "status message: last sync failed", "last synced: 2026-06-02T19:00:00Z", "trust: community"} {
		if !strings.Contains(items[2].desc, want) {
			t.Fatalf("builtin update action missing lifecycle state %q: %#v", want, items[2])
		}
	}
	if items[3].id != "blueprint-action/delete" || !items[3].disabled {
		t.Fatalf("builtin blueprint delete action should be visible but disabled: %#v", items[3])
	}
	for _, want := range []string{
		"Connection setup",
		"earthscope-mcp",
		"command args: serve",
		"activation: disabled",
		"trust policy: explicit",
		"trusted: false",
		"trust source: blueprint",
		"install method: manual",
		"install status: missing",
		"runtime transport: stdio",
		"runtime server id: mcp_earthscope",
		"environment policy: restricted",
		"environment policy allowlist: EARTHSCOPE_TOKEN",
		"verification checksum: abcdef0123456789",
		"verification status: unsigned",
		"Warnings",
		"descriptor requires explicit trust before enabling",
	} {
		if items[4].id != "mcp/earthscope" || !strings.Contains(items[4].desc, want) {
			t.Fatalf("mcp descriptor row missing %q: %#v", want, items[4])
		}
	}
	if !strings.HasPrefix(items[4].title, "Integration · MCP · EarthScope MCP") {
		t.Fatalf("mcp descriptor should be visibly grouped as an integration: %#v", items[4])
	}
	for _, want := range []string{"earthscope-mcp", "disabled", "stdio", "mcp_earthscope", "warnings"} {
		if !strings.Contains(items[4].inlineDesc, want) {
			t.Fatalf("mcp descriptor inline summary missing %q: %#v", want, items[4])
		}
	}
	if strings.Contains(items[4].inlineDesc, "Connection setup") || strings.Contains(items[4].inlineDesc, "command args") {
		t.Fatalf("mcp descriptor inline summary should stay compact: %#v", items[4])
	}
	if strings.Contains(items[4].desc, `"trust"`) || strings.Contains(items[4].desc, `"install"`) {
		t.Fatalf("mcp descriptor should be structured, not raw JSON: %#v", items[4])
	}
	for _, notWant := range []string{"\n  args: serve", "enabled: false"} {
		if strings.Contains(items[4].desc, notWant) {
			t.Fatalf("mcp descriptor leaked schema-style copy %q: %#v", notWant, items[4])
		}
	}
	if items[4].id != "mcp/earthscope" || !strings.Contains(items[4].desc, "earthscope-mcp") {
		t.Fatalf("mcp descriptor row missing enable target/command: %#v", items[4])
	}
	for _, want := range []string{"Automation setup", "runs on: pre_message", "activation: disabled", "trust policy: explicit", "trusted: false", "hook file: /tmp/community-blueprints/hooks/pre_message.py", "checksum: 0123456789abcdef"} {
		if items[5].id != "hook/pre_message" || !strings.Contains(items[5].desc, want) {
			t.Fatalf("hook descriptor row missing %q: %#v", want, items[5])
		}
	}
	if strings.Contains(items[5].desc, "enabled: false") {
		t.Fatalf("hook descriptor leaked schema-style enabled label: %#v", items[5])
	}
	if !strings.HasPrefix(items[5].title, "Automation · Hook · Pre Message") {
		t.Fatalf("hook descriptor should be visibly grouped as automation: %#v", items[5])
	}
	for _, want := range []string{"runs on pre_message", "disabled", "workspace", "provided by agent blueprint", "warnings"} {
		if !strings.Contains(items[5].inlineDesc, want) {
			t.Fatalf("hook descriptor inline summary missing %q: %#v", want, items[5])
		}
	}
	if strings.Contains(items[5].inlineDesc, "Automation setup") || strings.Contains(items[5].inlineDesc, "hook file") || strings.Contains(items[5].inlineDesc, "agent_blueprint") {
		t.Fatalf("hook descriptor inline summary should stay compact: %#v", items[5])
	}
	if strings.Contains(items[5].desc, "agent_blueprint") {
		t.Fatalf("hook descriptor should not leak raw backend source enums: %#v", items[5])
	}
	if strings.Contains(items[5].desc, `"trust"`) {
		t.Fatalf("hook descriptor should be structured, not raw JSON: %#v", items[5])
	}
	if items[6].id != "agent/data" || !strings.Contains(items[6].desc, "mcp.parquet.read") {
		t.Fatalf("agent row missing drilldown/tool metadata: %#v", items[6])
	}
	if items[6].statusTag != "agent blueprint" {
		t.Fatalf("agent row should humanize backend source status: %#v", items[6])
	}
	if !strings.HasPrefix(items[6].title, "Expert · Data Root") {
		t.Fatalf("agent row should be visibly grouped as an expert: %#v", items[6])
	}
	if !strings.Contains(items[6].inlineDesc, "1 tool") || !strings.Contains(items[6].inlineDesc, "1 command") {
		t.Fatalf("agent row should expose compact hierarchy summary: %#v", items[6])
	}
	if !strings.Contains(items[6].desc, "commands exposed: /validate-dataset") {
		t.Fatalf("agent row should show declared packaged commands: %#v", items[6])
	}
}

func TestPaletteCommandSubtitleSurfacesAgentBlueprintCommandProvenance(t *testing.T) {
	trueValue := true
	command := gact.Command{
		ID:                 "/validate-dataset",
		Title:              "Validate Dataset",
		CommandSource:      "agent_blueprint",
		CommandScope:       "agent_blueprint",
		CommandPath:        "/tmp/work/.clio/agent-blueprints/qc/commands/validate-dataset.md",
		AgentBlueprintID:   "qc-agent",
		AgentBlueprintRoot: "/tmp/work/.clio/agent-blueprints/qc",
		AgentID:            "root",
		UserInvocable:      &trueValue,
		AgentInvocable:     &trueValue,
		PlannerVisible:     &trueValue,
		ArgumentHint:       "<path>",
	}

	got := paletteCommandSubtitle(command)
	for _, want := range []string{
		"from workflow qc-agent",
		"operator command",
		"expert root",
		"input <path>",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("subtitle missing %q: %q", want, got)
		}
	}
	for _, notWant := range []string{"agent blueprint:", "owner:", "args:", "path:", "planner", "commands/validate-dataset.md"} {
		if strings.Contains(got, notWant) {
			t.Fatalf("subtitle should not expose backend label %q: %q", notWant, got)
		}
	}
}

func TestAgentBlueprintValidationFormatsPackagedHooks(t *testing.T) {
	out := formatAgentBlueprintValidation(gact.AgentBlueprintValidationResult{
		Enabled:            true,
		ValidationWarnings: []string{"descriptor requires explicit trust before install"},
		MCPDescriptors: []map[string]any{{
			"id": "earthscope", "name": "EarthScope MCP", "transport": "stdio",
			"trust":               map[string]any{"policy": "explicit", "trusted": false},
			"validation_warnings": []any{"descriptor requires explicit trust"},
		}},
		HookDescriptors: []map[string]any{{
			"id": "pre_message", "title": "Pre Message", "event": "pre_message",
			"source": "agent_blueprint", "definition_path": "/tmp/bp/hooks/pre_message.py",
			"trust":               map[string]any{"policy": "explicit", "trusted": false},
			"validation_warnings": []any{"disabled until trusted"},
		}},
	})
	for _, want := range []string{"status: warning", "warnings: descriptor requires explicit trust before install", "MCP descriptors", "EarthScope MCP", "Warnings", "descriptor requires explicit trust", "Packaged hooks", "Pre Message", "runs on: pre_message", "trust policy: explicit", "trusted: false", "disabled until trusted"} {
		if !strings.Contains(out, want) {
			t.Fatalf("validation output missing %q:\n%s", want, out)
		}
	}
	for _, notWant := range []string{"warnings: descriptor requires explicit trust\n", "warnings: disabled until trusted"} {
		if strings.Contains(out, notWant) {
			t.Fatalf("validation descriptor detail should use warning sections, not inline labels %q:\n%s", notWant, out)
		}
	}
	if strings.Contains(out, `"trust"`) {
		t.Fatalf("validation output should not dump hook JSON:\n%s", out)
	}
}

func TestAgentBlueprintValidationWithSourceGivesInstallNextStep(t *testing.T) {
	out := formatAgentBlueprintValidationWithSource(gact.AgentBlueprintValidationResult{
		Enabled: true,
		AgentBlueprint: gact.AgentBlueprintDefinition{
			ID:      "seismic-waveform-review",
			Title:   "Seismic Waveform Review",
			Enabled: true,
		},
	}, "https://example.org/community/seismic-agents.git")

	for _, want := range []string{
		"Validated source",
		"source: https://example.org/community/seismic-agents.git",
		"next action: press Esc, choose install source, and use the same source",
		"Validation",
		"status: valid",
		"Blueprint identity",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("validation source report missing %q:\n%s", want, out)
		}
	}
}

func TestAgentBlueprintDetailItemsPrioritizeValidationBeforeUnsafeActivation(t *testing.T) {
	items := agentBlueprintDetailItems(gact.AgentBlueprintDetail{
		AgentBlueprint: gact.AgentBlueprintDefinition{
			ID: "broken-blueprint", Title: "Broken Blueprint", Scope: "workspace", Enabled: true,
			ValidationErrors: []string{"root expert not found: missing"},
		},
	})

	if len(items) < 3 {
		t.Fatalf("detail items len = %d, want validation, activation, and summary", len(items))
	}
	if items[0].id != "validation" || items[0].statusTag != "error" {
		t.Fatalf("first row = %#v, want validation error before actions", items[0])
	}
	if items[1].id != "activate" || !items[1].disabled || items[1].statusTag != "blocked" {
		t.Fatalf("activation row = %#v, want disabled blocked activation", items[1])
	}
	if !strings.Contains(items[1].desc, "cannot activate until validation errors are resolved") {
		t.Fatalf("activation row should explain validation blocker: %#v", items[1])
	}
	if !strings.Contains(items[0].desc, "missing root expert") || strings.Contains(items[0].desc, "root_expert") {
		t.Fatalf("validation row should use operator-facing validation text: %#v", items[0])
	}
	if !strings.Contains(items[2].inlineDesc, "needs fix: missing root expert") || strings.Contains(items[2].inlineDesc, "invalid ·") || strings.Contains(items[2].inlineDesc, "root_expert") {
		t.Fatalf("broken blueprint summary should lead with repair reason, got %#v", items[2])
	}
}

func TestAgentBlueprintDetailItemsMarkActiveActivationState(t *testing.T) {
	items := agentBlueprintDetailItems(gact.AgentBlueprintDetail{
		AgentBlueprint: gact.AgentBlueprintDefinition{
			ID: "seismic-market", Title: "Seismic Marketplace", Scope: "workspace", Enabled: true,
		},
	})
	items = markActiveAgentBlueprintDetailItems(items, "seismic-market", "seismic-market", "session")

	if len(items) < 2 {
		t.Fatalf("detail items len = %d, want activation and summary", len(items))
	}
	if items[0].id != "activate" || items[0].title != "Active for current session" || items[0].statusTag != "active" {
		t.Fatalf("active activation row not marked clearly: %#v", items[0])
	}
	if !strings.Contains(items[0].desc, "already active") || !strings.Contains(items[0].desc, "keeps the session pinned") {
		t.Fatalf("active activation row should explain current state: %#v", items[0])
	}
	if strings.Contains(items[0].desc, "Press Enter") {
		t.Fatalf("active activation row should keep keypress prose out of the body: %#v", items[0])
	}
	if items[1].id != "blueprint/seismic-market" || items[1].statusTag != "active" {
		t.Fatalf("active blueprint summary row should be marked active: %#v", items[1])
	}
}

func TestAgentBlueprintDetailItemsExposeManagementActionsForInstalledBlueprint(t *testing.T) {
	items := agentBlueprintDetailItems(gact.AgentBlueprintDetail{
		AgentBlueprint: gact.AgentBlueprintDefinition{
			ID: "workspace-blueprint", Title: "Workspace Blueprint", Scope: "workspace", Enabled: true,
			Metadata: map[string]any{"install": map[string]any{
				"source":         "https://example.org/community/workspace-blueprint.git",
				"source_kind":    "git",
				"status":         "update_available",
				"status_message": "new commit available",
				"last_sync":      "2026-06-03T01:00:00Z",
				"trust_policy":   "explicit",
			}},
		},
	})

	if len(items) < 4 {
		t.Fatalf("detail items len = %d, want activation, blueprint, update, delete", len(items))
	}
	if items[2].id != "blueprint-action/update" || items[2].disabled {
		t.Fatalf("workspace blueprint update action should be enabled: %#v", items[2])
	}
	for _, want := range []string{"refresh this installed blueprint through CLIO", "source: https://example.org/community/workspace-blueprint.git", "status: update_available", "status message: new commit available", "last synced: 2026-06-03T01:00:00Z", "trust: explicit"} {
		if !strings.Contains(items[2].desc, want) {
			t.Fatalf("workspace update action missing lifecycle state %q: %#v", want, items[2])
		}
	}
	if items[3].id != "blueprint-action/delete" || items[3].disabled {
		t.Fatalf("workspace blueprint delete action should be enabled: %#v", items[3])
	}
	for _, want := range []string{"remove this installed blueprint through CLIO", "source: https://example.org/community/workspace-blueprint.git", "status: update_available"} {
		if !strings.Contains(items[3].desc, want) {
			t.Fatalf("workspace delete action missing lifecycle state %q: %#v", want, items[3])
		}
	}
}
