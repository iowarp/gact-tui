package ui

import (
	"fmt"
	"strconv"
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestPaletteCommandTargetsAlignWithSharedFrameBody(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "/theme"

	_ = a.View()
	target, ok := findHitTargetForTest(a, "palette:command:0")
	if !ok {
		t.Fatal("missing semantic palette command target")
	}
	rect := overlayMouseRect(a.cmdPalette.view(), a.width, a.height)
	if wantY := rect.y + 2 + 6; target.rect.y != wantY {
		t.Fatalf("first palette command y = %d, want shared frame body/list row %d", target.rect.y, wantY)
	}
}

func TestPaletteCommandWindowFollowsSelection(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	for i := 0; i < 40; i++ {
		id := "/cmd" + strconv.Itoa(i)
		a.cmdPalette.commands = append(a.cmdPalette.commands, gact.Command{ID: id, Title: "Command " + strconv.Itoa(i), Source: "builtin"})
	}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Extension Commands"
	a.cmdPalette.paletteSel = 32

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "palette:command:32"); !ok {
		t.Fatal("selected offscreen palette command should be rendered with a semantic target")
	}
	if _, ok := findHitTargetForTest(a, "palette:command:0"); ok {
		t.Fatal("palette command window should not keep the first row target when selection moves down-list")
	}
	out := ansi.Strip(a.cmdPalette.view())
	if strings.Contains(out, "showing ") {
		t.Fatalf("palette should use shared scroll affordance instead of textual ranges:\n%s", out)
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("palette should render shared side scroll affordance for long command lists:\n%s", out)
	}
}

func TestPaletteCommandRowsUseDenseInlineMetadata(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	for i := 0; i < 16; i++ {
		a.cmdPalette.commands = append(a.cmdPalette.commands, gact.Command{
			ID:          "/cmd" + strconv.Itoa(i),
			Description: "Run command " + strconv.Itoa(i),
			Source:      "builtin",
		})
	}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "/cmd"

	out := ansi.Strip(a.cmdPalette.view())
	if !strings.Contains(out, "/cmd15") {
		t.Fatalf("dense palette should show 16 command rows in the shared body budget:\n%s", out)
	}
	if !strings.Contains(out, "/cmd0  Run command 0") {
		t.Fatalf("palette command metadata should render on the title row:\n%s", out)
	}
}

func TestPaletteUsesHelpLikeBodyHeight(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 50
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true

	paletteRect := overlayMouseRect(a.cmdPalette.view(), a.width, a.height)
	a.help.open = true
	a.help.tab = helpTabIndex("Global")
	keybindingRect := overlayMouseRect(a.help.view(), a.width, a.height)
	a.help.tab = helpTabIndex("Commands")
	commandRect := overlayMouseRect(a.help.view(), a.width, a.height)
	if paletteRect.h < keybindingRect.h-2 {
		t.Fatalf("palette height = %d, want close to compact keybinding help height %d", paletteRect.h, keybindingRect.h)
	}
	if paletteRect.h >= commandRect.h {
		t.Fatalf("palette height = %d, should stay shorter than command catalog height %d", paletteRect.h, commandRect.h)
	}
	if paletteRect.h > 26 {
		t.Fatalf("palette height = %d, should not fill a tall viewport", paletteRect.h)
	}
}

func TestPaletteCategoryViewDoesNotFillTallViewport(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 50
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Runtime"

	rect := overlayMouseRect(a.cmdPalette.view(), a.width, a.height)
	if rect.h > 24 {
		t.Fatalf("palette category height = %d, should stay compact in tall viewport:\n%s", rect.h, ansi.Strip(a.cmdPalette.view()))
	}
}

func TestPaletteLongCategoryStaysWithinViewport(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 43
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Extension Commands"
	for i := 1; i <= 24; i++ {
		a.cmdPalette.commands = append(a.cmdPalette.commands, gact.Command{
			ID:          fmt.Sprintf("/runtime-demo-%02d", i),
			Title:       fmt.Sprintf("Runtime demo action %02d", i),
			Description: "Synthetic runtime command used to exercise palette overflow and scrolling.",
			Source:      "builtin",
		})
	}

	view := a.cmdPalette.view()
	rect := overlayMouseRect(view, a.width, a.height)
	if rect.y < 0 || rect.y+rect.h > a.height {
		t.Fatalf("long palette category should fit viewport, rect=%#v height=%d:\n%s", rect, a.height, ansi.Strip(view))
	}
	if rect.h > 36 {
		t.Fatalf("long palette category height = %d, should stay bounded:\n%s", rect.h, ansi.Strip(view))
	}
	out := ansi.Strip(view)
	if !strings.Contains(out, "/runtime-demo-01") || !strings.Contains(out, "/runtime-demo-08") {
		t.Fatalf("long palette should render the first visible tile window:\n%s", out)
	}
	if strings.Contains(out, "/runtime-demo-09") {
		t.Fatalf("long palette should not render more tiles than fit in one window:\n%s", out)
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("long palette should render a side scroll affordance:\n%s", out)
	}
}

func TestPaletteCategoryViewUsesCommandGridInsteadOfRepeatedGroupList(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 50
	a.stage = StageReady
	a.session.caps.Capabilities.XClioAgentBlueprints = true
	a.session.caps.Capabilities.XClioExpertPacks = true
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Experts"

	out := ansi.Strip(a.cmdPalette.view())
	if strings.Contains(out, "Agents (") {
		t.Fatalf("category drill-in should not repeat a flat group header:\n%s", out)
	}
	for _, want := range []string{"/agent-blueprints", "/experts", "/expert-packs", "Manage agent blueprints"} {
		if !strings.Contains(out, want) {
			t.Fatalf("category command grid missing %q:\n%s", want, out)
		}
	}
	_ = a.View()
	if _, ok := findHitTargetForTest(a, "palette:command:0"); !ok {
		t.Fatal("category command grid should preserve semantic command hit targets")
	}
}

func TestPaletteCapabilitiesCopyFitsCommandGrid(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 50
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Runtime"

	out := ansi.Strip(a.cmdPalette.view())
	for _, want := range []string{"/tools", "Browse actions and MCP"} {
		if !strings.Contains(out, want) {
			t.Fatalf("runtime palette missing %q:\n%s", want, out)
		}
	}
	for _, want := range []string{"/mcp", "Manage MCP connections"} {
		if !strings.Contains(out, want) {
			t.Fatalf("runtime palette missing MCP connection management %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "Callable capabilities from") || strings.Contains(out, "…") {
		t.Fatalf("runtime palette should avoid clipped backend-style prose:\n%s", out)
	}

	a.cmdPalette.paletteFilter = "tools"
	a.cmdPalette.paletteGroup = ""
	a.cmdPalette.paletteSel = 0
	out = ansi.Strip(a.cmdPalette.view())
	if !strings.Contains(out, "/tools  Browse actions and MCP") {
		t.Fatalf("filtered /tools row should use compact operator copy:\n%s", out)
	}
	if strings.Contains(out, "Callable capabilities from") || strings.Contains(out, "…") {
		t.Fatalf("filtered /tools row should not clip long prose:\n%s", out)
	}
}

func TestPaletteMCPPromptTileUsesFittedOperatorSubtitle(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 50
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Runtime"
	a.cmdPalette.commands = append(a.cmdPalette.commands, gact.Command{
		ID:            "/summarize",
		Title:         "Summarize MCP text",
		Source:        "mcp_prompt",
		CommandSource: "mcp_prompt",
		Invocation:    "mcp_prompt",
		AgentID:       "clio.expert.data",
		ArgumentHint:  "text required from selected source material",
	})

	out := ansi.Strip(a.cmdPalette.view())
	if !strings.Contains(out, "/summarize") || !strings.Contains(out, "MCP prompt action") {
		t.Fatalf("runtime palette should show MCP prompt with operator subtitle:\n%s", out)
	}
	for _, stale := range []string{"input text require", "expert clio.expert.data", "…"} {
		if strings.Contains(out, stale) {
			t.Fatalf("runtime MCP prompt tile should avoid clipped backend-style prose %q:\n%s", stale, out)
		}
	}
}

func TestPaletteCopyCommandUsesBlockCopyLanguage(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 50
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Session"

	out := ansi.Strip(a.cmdPalette.view())
	for _, want := range []string{"/copy", "Copy the selected conversation block", "Enter copy selected block"} {
		if !strings.Contains(out, want) {
			t.Fatalf("session palette missing selected-block copy language %q:\n%s", want, out)
		}
	}
	for _, stale := range []string{"copy conversation item", "Copy message"} {
		if strings.Contains(out, stale) {
			t.Fatalf("session palette should not use stale copy language %q:\n%s", stale, out)
		}
	}
}

func TestPaletteCategoryTabsUseCompactLabels(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 50
	a.stage = StageReady
	a.session.caps.Capabilities.XClioPromptRegistry = true
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Runtime"

	out := ansi.Strip(a.cmdPalette.view())
	for _, want := range []string{"All", "Runtime", "Experts", "/tools", "/prompts"} {
		if !strings.Contains(out, want) {
			t.Fatalf("palette category tab row missing %q:\n%s", want, out)
		}
	}
	if !strings.Contains(out, "/mcp") {
		t.Fatalf("palette category should include MCP connection management:\n%s", out)
	}
	if strings.Contains(out, "Prompt Templates") {
		t.Fatalf("palette category tabs should use compact labels, not wrap long group names:\n%s", out)
	}
}

func TestPaletteCommandSubtitleSkipsDuplicateCommandNames(t *testing.T) {
	c := gact.Command{ID: "/doctor", Title: "/doctor", Description: "Inspect backend health", Source: "builtin"}
	if got := paletteCommandSubtitle(c); got != "Inspect backend health" {
		t.Fatalf("subtitle = %q, want description", got)
	}
	c = gact.Command{ID: "/clear", Title: "clear", Source: "builtin"}
	if got := paletteCommandSubtitle(c); got != "builtin" {
		t.Fatalf("subtitle = %q, want source fallback for duplicate title", got)
	}
	c = gact.Command{ID: "/optimize", Title: "Optimize", Status: "unavailable", DisabledReason: "optimizer not installed"}
	if got := paletteCommandSubtitle(c); got != "unavailable · optimizer not installed" {
		t.Fatalf("subtitle = %q, want unavailable reason", got)
	}
}
