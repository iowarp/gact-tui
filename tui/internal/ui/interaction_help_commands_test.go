package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestHelpCommandsUseSharedListRowsAndStageCommandOnClick(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 40
	a.stage = StageReady
	a.session.caps.Capabilities.XClioPromptRegistry = true
	a.session.caps.Capabilities.XClioExpertPacks = true
	a.session.caps.Capabilities.XClioAgentBlueprints = true
	a.session.caps.Capabilities.IntegrationHealth = true
	a.session.caps.Capabilities.Memory = true
	a.help.open = true
	a.help.tab = helpTabIndex("Commands")
	a.focus = FocusBody

	_ = a.View()
	target, ok := findHitTargetForTest(a, "help:command:tools")
	if !ok {
		t.Fatal("missing Help Commands row hit target for /tools")
	}
	if target.rect.h != 1 {
		t.Fatalf("help command row target height = %d, want dense one-line row", target.rect.h)
	}
	if target.rect.w >= modalScrollableBodyWidth(a.modals.modalWidth()) {
		t.Fatalf("help command column target width = %d, want narrower than full body width %d", target.rect.w, modalScrollableBodyWidth(a.modals.modalWidth()))
	}
	out := ansi.Strip(a.help.view())
	if !strings.Contains(out, "/tools") || !strings.Contains(out, "browse actions and MCP") {
		t.Fatalf("Help Commands should show full command names with operator-facing row purpose:\n%s", out)
	}
	if !strings.Contains(out, "/copy") || !strings.Contains(out, "copy selected block") {
		t.Fatalf("Help Commands should describe /copy as selected block copy, not selected message copy:\n%s", out)
	}
	for command, copy := range map[string]string{
		"/compact": "reclaim context",
		"/mode":    "cycle routing mode",
	} {
		if !strings.Contains(out, command) || !strings.Contains(out, copy) {
			t.Fatalf("Help Commands should expose %s with operator copy %q:\n%s", command, copy, out)
		}
	}
	for _, want := range []string{
		"Session",
		"Workspace",
		"Runtime",
		"Experts",
		"Settings",
		"Diagnostics",
		"/agent-blueprints",
		"/expert-packs",
		"/doctor",
		"/permissions",
		"/theme-prev",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("help command boxes should expose operator command areas and canonical commands; missing %q:\n%s", want, out)
		}
	}
	clearTarget, ok := findHitTargetForTest(a, "help:command:clear")
	if !ok {
		t.Fatal("missing first-column Help Commands hit target for /clear")
	}
	expertsTarget, ok := findHitTargetForTest(a, "help:command:experts")
	if !ok {
		t.Fatal("missing second-column Help Commands hit target for /experts")
	}
	if expertsTarget.rect.x <= clearTarget.rect.x {
		t.Fatalf("expert command target x = %d, want to the right of first column at %d", expertsTarget.rect.x, clearTarget.rect.x)
	}

	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("clicking a Help command row should stage text, not execute a command")
	}
	if a.help.open {
		t.Fatal("clicking a Help command row should close Help")
	}
	if a.focus != FocusInput {
		t.Fatalf("focus = %v, want input after staging command", a.focus)
	}
	if got := a.inputComposer.input.Value(); got != "/tools" {
		t.Fatalf("input value = %q, want /tools", got)
	}
	if !strings.Contains(a.transientHint, "command staged: /tools") {
		t.Fatalf("hint = %q, want staged command confirmation", a.transientHint)
	}

	a.help.open = true
	a.help.tab = helpTabIndex("Commands")
	a.focus = FocusBody
	_ = a.View()
	mouseTarget, ok := findHitTargetForTest(a, "help:command:mouse")
	if !ok {
		t.Fatal("missing Help Commands row hit target for /mouse")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      mouseTarget.rect.x,
		Y:      mouseTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("clicking /mouse Help row should stage text, not execute")
	}
	if a.help.open {
		t.Fatal("clicking /mouse Help row should close Help")
	}
	if got := a.inputComposer.input.Value(); got != "/mouse" {
		t.Fatalf("input value after /mouse help click = %q, want /mouse", got)
	}
}

func TestHelpConversationCopyRowsExposeMouseSelection(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 40
	a.stage = StageReady
	a.help.open = true
	a.help.tab = helpTabIndex("Conversation")

	out := ansi.Strip(a.help.view())
	for _, want := range []string{
		"y  copy selected part",
		"Y  copy full transcript with tool evidence",
		"Drag  app copy of exact visible text",
		"Alt+drag  let the terminal select text",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("conversation help should expose copy mode %q:\n%s", want, out)
		}
	}
}

func TestHelpModalUsesCompactCommandAndKeybindingHeights(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 50
	a.stage = StageReady
	a.session.caps.Capabilities.XClioPromptRegistry = true
	a.session.caps.Capabilities.XClioExpertPacks = true
	a.session.caps.Capabilities.XClioAgentBlueprints = true
	a.session.caps.Capabilities.IntegrationHealth = true
	a.session.caps.Capabilities.Memory = true
	a.help.open = true

	a.help.tab = helpTabIndex("Commands")
	commands := ansi.Strip(a.help.view())
	commandLines := strings.Count(commands, "\n") + 1
	if commandLines > 30 {
		t.Fatalf("commands help modal height = %d lines, want compact body without tall empty padding:\n%s", commandLines, commands)
	}
	commandRect := overlayMouseRect(a.help.view(), a.width, a.height)
	if commandRect.w != a.help.modalWidthForTab("Commands") || commandRect.w <= a.modals.modalWidth() {
		t.Fatalf("commands help modal width = %d, want wide command catalog width %d and wider than standard %d", commandRect.w, a.help.modalWidthForTab("Commands"), a.modals.modalWidth())
	}
	if !strings.Contains(commands, "Commands") || strings.Contains(commands, "Keybindings") {
		t.Fatalf("commands help should be titled as a command catalog, not keybindings:\n%s", commands)
	}
	if strings.Count(commands, "┌") < 5 || !strings.Contains(commands, "┌Session") || !strings.Contains(commands, "┌Experts") {
		t.Fatalf("commands help should render separate boxed command areas:\n%s", commands)
	}
	areaPos := func(area string) (int, int) {
		for row, line := range strings.Split(commands, "\n") {
			if col := strings.Index(line, "┌"+area); col >= 0 {
				return row, col
			}
		}
		t.Fatalf("commands help should expose %s area:\n%s", area, commands)
		return -1, -1
	}
	sessionRow, sessionCol := areaPos("Session")
	workspaceRow, workspaceCol := areaPos("Workspace")
	runtimeRow, runtimeCol := areaPos("Runtime")
	expertsRow, expertsCol := areaPos("Experts")
	settingsRow, settingsCol := areaPos("Settings")
	diagnosticsRow, diagnosticsCol := areaPos("Diagnostics")
	if !(sessionCol == workspaceCol && sessionRow < workspaceRow) {
		t.Fatalf("commands help should stack Session then Workspace in the first column:\n%s", commands)
	}
	if !(absInt(runtimeCol-expertsCol) <= 1 && runtimeCol > workspaceCol && runtimeRow < expertsRow) {
		t.Fatalf("commands help should stack Runtime then Experts in the second column:\n%s", commands)
	}
	if !(absInt(settingsCol-diagnosticsCol) <= 1 && settingsCol > runtimeCol && settingsRow < diagnosticsRow) {
		t.Fatalf("commands help should stack Settings then Diagnostics in the third column:\n%s", commands)
	}
	if !strings.Contains(commands, "/copy") || !strings.Contains(commands, "/compact") || !strings.Contains(commands, "/mode") || !strings.Contains(commands, "/tools") || !strings.Contains(commands, "/diff") {
		t.Fatalf("commands help should still show the command grid:\n%s", commands)
	}
	for _, want := range []string{"/agent", "/model", "/experts", "/prompts", "/expert-packs", "/agent-blueprints", "/doctor", "/permissions", "/metrics", "/memory"} {
		if !strings.Contains(commands, want) {
			t.Fatalf("commands help should expose canonical operator command %q:\n%s", want, commands)
		}
	}
	if strings.Contains(commands, "/agents-list") || strings.Contains(commands, "/agents  browse registered agents") {
		t.Fatalf("commands help should not advertise /agents as the agent catalog route:\n%s", commands)
	}

	a.help.tab = helpTabIndex("Global")
	global := ansi.Strip(a.help.view())
	globalLines := strings.Count(global, "\n") + 1
	globalRect := overlayMouseRect(a.help.view(), a.width, a.height)
	if globalRect.w != a.help.modalWidthForTab("Global") || globalRect.w >= a.modals.modalWidth() {
		t.Fatalf("keybinding help modal width = %d, want compact width %d and narrower than standard %d:\n%s", globalRect.w, a.help.modalWidthForTab("Global"), a.modals.modalWidth(), global)
	}
	a.help.tab = helpTabIndex("Permission")
	permissionLines := strings.Count(ansi.Strip(a.help.view()), "\n") + 1
	if globalLines != permissionLines {
		t.Fatalf("keybinding tabs should keep a stable compact height, global=%d permission=%d", globalLines, permissionLines)
	}
	if globalLines > 18 {
		t.Fatalf("keybinding help modal height = %d lines, want compact fixed category height", globalLines)
	}
	if globalLines >= commandLines {
		t.Fatalf("keybinding help modal should be shorter than command catalog, keybindings=%d commands=%d", globalLines, commandLines)
	}
}

func absInt(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

func TestHelpCommandsHideUnsupportedOptionalSurfaces(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 50
	a.stage = StageReady
	a.session.caps.Capabilities.XClioPromptRegistry = false
	a.session.caps.Capabilities.XClioExpertPacks = false
	a.session.caps.Capabilities.XClioAgentBlueprints = false
	a.session.caps.Capabilities.IntegrationHealth = false
	a.session.caps.Capabilities.Memory = false
	a.help.open = true
	a.help.tab = helpTabIndex("Commands")

	out := ansi.Strip(a.help.view())
	for _, hidden := range []string{"/prompts", "/expert-packs", "/agent-blueprints", "/doctor", "/memory", "prompts", "blueprints", "expert packs", "backend health", "retained context"} {
		if strings.Contains(out, hidden) {
			t.Fatalf("Help Commands should not advertise unsupported %s:\n%s", hidden, out)
		}
	}
	for _, visible := range []string{"/tools", "/clear", "/copy", "/compact", "/mode", "/theme", "/agent", "/model", "/add", "/drop", "/diff", "/permissions"} {
		if !strings.Contains(out, visible) {
			t.Fatalf("Help Commands should keep core command %s visible:\n%s", visible, out)
		}
	}
	for _, hidden := range []string{"/catalog", "/theme-export", "/blueprints", "/agents-list"} {
		if strings.Contains(out, hidden) {
			t.Fatalf("Help Commands should not advertise hidden alias/action %s:\n%s", hidden, out)
		}
	}
	if !strings.Contains(out, "/mcp") {
		t.Fatalf("Help Commands should include MCP connection management:\n%s", out)
	}
}

// TestCapabilityGatedCommandsHiddenWhenUnsupported is the single-source-of-
// truth proof for the hide-when-unsupported contract: every command whose
// optional capability flag is absent must NOT appear in either the slash
// palette or the help/cheatsheet command list, and MUST appear once the
// flag is set. helpCommandSupported is the shared gate both surfaces filter
// through. Commands without a clear capability flag (core surfaces) are not
// table entries here — they always show regardless of flags.
func TestCapabilityGatedCommandsHiddenWhenUnsupported(t *testing.T) {
	cases := []struct {
		id     string
		enable func(c *gact.CapabilityFlags)
	}{
		{"/prompts", func(c *gact.CapabilityFlags) { c.XClioPromptRegistry = true }},
		{"/expert-packs", func(c *gact.CapabilityFlags) { c.XClioExpertPacks = true }},
		{"/agent-blueprints", func(c *gact.CapabilityFlags) { c.XClioAgentBlueprints = true }},
		{"/doctor", func(c *gact.CapabilityFlags) { c.IntegrationHealth = true }},
		{"/memory", func(c *gact.CapabilityFlags) { c.Memory = true }},
		{"/skills", func(c *gact.CapabilityFlags) { c.SkillsExtraction = true }},
	}

	inPalette := func(a *App, id string) bool {
		for _, c := range a.cmdPalette.matches() {
			if strings.EqualFold(c.ID, id) {
				return true
			}
		}
		return false
	}

	for _, tc := range cases {
		t.Run(tc.id, func(t *testing.T) {
			// Unsupported: hidden from palette, help gate, and cheatsheet.
			off := newReadyApp(nil, nil)
			off.width = 150
			off.height = 50
			if inPalette(off, tc.id) {
				t.Fatalf("%s should be hidden from the palette when its capability is absent", tc.id)
			}
			if off.help.commandSupported(tc.id) {
				t.Fatalf("helpCommandSupported(%s) should be false when its capability is absent", tc.id)
			}
			off.help.open = true
			off.help.tab = helpTabIndex("Commands")
			if strings.Contains(ansi.Strip(off.help.view()), tc.id) {
				t.Fatalf("%s should not appear in the Commands cheatsheet when unsupported", tc.id)
			}

			// Supported: surfaced in palette, help gate, and cheatsheet.
			on := newReadyApp(nil, nil)
			on.width = 150
			on.height = 50
			tc.enable(&on.session.caps.Capabilities)
			if !inPalette(on, tc.id) {
				t.Fatalf("%s should appear in the palette when its capability is present", tc.id)
			}
			if !on.help.commandSupported(tc.id) {
				t.Fatalf("helpCommandSupported(%s) should be true when its capability is present", tc.id)
			}
			on.help.open = true
			on.help.tab = helpTabIndex("Commands")
			if !strings.Contains(ansi.Strip(on.help.view()), tc.id) {
				t.Fatalf("%s should appear in the Commands cheatsheet when supported", tc.id)
			}
		})
	}
}

func TestHelpGlobalRowsUseSharedModalListRendering(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 40
	a.stage = StageReady
	a.help.open = true
	a.help.tab = 0

	out := ansi.Strip(a.help.view())
	if !strings.Contains(out, "Ctrl+N  create a new session") || !strings.Contains(out, "Ctrl+S  open model") {
		t.Fatalf("global help rows should render key and description through shared list rows:\n%s", out)
	}
	for _, hiddenUntilScroll := range []string{"Ctrl+Y  send the configured voice placeholder", "?  toggle this help overlay"} {
		if strings.Contains(out, hiddenUntilScroll) {
			t.Fatalf("compact global help initial view should keep later shortcuts below the fold until scroll; found %q:\n%s", hiddenUntilScroll, out)
		}
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("compact global help should show scroll affordance for hidden shortcuts:\n%s", out)
	}
	if strings.Contains(out, "▌ Ctrl+N") {
		t.Fatalf("non-command help rows should not render selected-list markers:\n%s", out)
	}
}
