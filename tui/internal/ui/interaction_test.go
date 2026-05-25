package ui

import (
	"strconv"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestHitRegistryReturnsTopmostTarget(t *testing.T) {
	var hits uiHitRegistry
	hits.add(uiHitTarget{id: "base", rect: mouseRect{x: 0, y: 0, w: 10, h: 10}, action: func(*App) tea.Cmd { return nil }})
	hits.add(uiHitTarget{id: "modal", rect: mouseRect{x: 2, y: 2, w: 4, h: 4}, action: func(*App) tea.Cmd { return nil }})

	got, ok := hits.at(3, 3)
	if !ok {
		t.Fatal("expected hit")
	}
	if got.id != "modal" {
		t.Fatalf("hit id = %q, want topmost modal", got.id)
	}
}

func TestDoctorTabsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.doctorOpen = true
	a.doctor = &doctorState{tab: doctorTabHealth}

	_ = a.View()
	rect := overlayMouseRect(a.viewDoctor(), a.width, a.height)
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 3 + 15,
		Y:      rect.y + 2 + 2,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.doctor == nil || a.doctor.tab != doctorTabCapabilities {
		t.Fatalf("doctor tab = %v, want capabilities", a.doctor)
	}
}

func TestSettingsTabsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 0}

	_ = a.View()
	rect := overlayMouseRect(a.viewSettings(), a.width, a.height)
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 3 + 31,
		Y:      rect.y + 2 + 2,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.settings == nil || a.settings.tab != 3 {
		t.Fatalf("settings tab = %v, want TUI tab", a.settings)
	}
	if !a.settingsOpen {
		t.Fatal("clicking a settings tab should not close settings")
	}
}

func TestSettingsTUIRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3, tuiRow: 0}

	_ = a.View()
	rect := overlayMouseRect(a.viewSettings(), a.width, a.height)
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 3 + 4,
		Y:      rect.y + 2 + 12,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.settings == nil || a.settings.tuiRow != 2 {
		t.Fatalf("settings TUI row = %v, want row 2", a.settings)
	}
	if !a.settingsOpen {
		t.Fatal("clicking a TUI option should not close settings")
	}
}

func TestSettingsLanguageRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 4, languageSel: 0}

	_ = a.View()
	rect := overlayMouseRect(a.viewSettings(), a.width, a.height)
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 3 + 4,
		Y:      rect.y + 2 + 8,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.settings == nil || a.settings.languageSel != 2 {
		t.Fatalf("settings language row = %v, want row 2", a.settings)
	}
	if !a.settingsOpen {
		t.Fatal("clicking a language row should select without closing settings")
	}
}

func TestHelpTabsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 30
	a.stage = StageReady
	a.helpOpen = true
	a.helpTab = 0

	_ = a.View()
	rect := overlayMouseRect(a.viewHelp(), a.width, a.height)
	targetTab := helpTabIndex("Commands")
	col := 0
	for i := 0; i < targetTab; i++ {
		col += lipgloss.Width(a.localizedHelpTabTitle(helpTabs[i].title)) + 2
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 3 + col + 1,
		Y:      rect.y + 2 + 2,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.helpTab != targetTab {
		t.Fatalf("helpTab = %d, want %d", a.helpTab, targetTab)
	}
	if !a.helpOpen {
		t.Fatal("clicking a help tab should not close help")
	}
}

func TestCatalogRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentDetail,
		title: "Agent detail",
		items: []catalogItem{
			{id: "summary", title: "Summary", desc: "long summary row consumes an extra visual line"},
			{id: "handoffs", title: "Handoffs", desc: "routes to downstream experts"},
		},
	}

	_ = a.View()
	rect := overlayMouseRect(a.viewCatalogBrowser(), a.width, a.height)
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 3 + 4,
		Y:      rect.y + 2 + 5,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("catalog row click should open detail view")
	}
	if a.detailView.title != "Handoffs" {
		t.Fatalf("detail title = %q, want Handoffs", a.detailView.title)
	}
}

func TestFilePickerRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.filePickerOpen = true
	a.filePicker = &filePickerState{
		loaded: true,
		entries: []gact.FileEntry{
			{Path: "alpha.csv"},
			{Path: "beta.parquet"},
		},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "file-picker:item:1")
	if !ok {
		t.Fatal("missing semantic file picker row target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.filePickerOpen {
		t.Fatal("file picker should close after clicked insert")
	}
	if got := a.input.Value(); !strings.Contains(got, "@beta.parquet ") {
		t.Fatalf("input = %q, want clicked beta path inserted", got)
	}
}

func TestFilePickerNonRowClickDoesNotChooseByCoordinates(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.filePickerOpen = true
	a.filePicker = &filePickerState{
		loaded: true,
		entries: []gact.FileEntry{
			{Path: "alpha.csv"},
			{Path: "beta.parquet"},
		},
	}

	_ = a.View()
	rect := overlayMouseRect(a.viewFilePicker(), a.width, a.height)
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + rect.w - 2,
		Y:      rect.y + 2 + 3,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("non-row click inside file picker should not dispatch")
	}
	if !a.filePickerOpen {
		t.Fatal("non-row click inside file picker should keep picker open")
	}
	if got := a.input.Value(); strings.Contains(got, "@") {
		t.Fatalf("non-row click should not insert a file, input=%q", got)
	}
}

func TestPaletteCommandRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.paletteOpen = true
	a.paletteFilter = "/theme"

	_ = a.View()
	target, ok := findHitTargetForTest(a, "palette:command:0")
	if !ok {
		t.Fatal("missing semantic palette command target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("/theme palette click should not dispatch command")
	}
	if a.paletteOpen {
		t.Fatal("palette command click should close palette")
	}
	if !a.settingsOpen || a.settings == nil || a.settings.tab != 2 {
		t.Fatalf("palette command click should open theme settings, open=%v settings=%+v", a.settingsOpen, a.settings)
	}
}

func TestPaletteNonRowClickDoesNotChooseByCoordinates(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.paletteOpen = true
	a.paletteFilter = "/theme"

	_ = a.View()
	rect := overlayMouseRect(a.viewPalette(), a.width, a.height)
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + rect.w - 2,
		Y:      rect.y + 2 + 3,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("non-row click inside palette should not dispatch")
	}
	if !a.paletteOpen {
		t.Fatal("non-row click inside palette should keep palette open")
	}
	if a.settingsOpen {
		t.Fatal("non-row click inside palette should not choose /theme")
	}
}

func TestPaletteSearchRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.paletteOpen = true
	a.paletteFilter = "?needle"
	a.searchMatches = []client.SearchMatch{{MessageID: "m2", Snippet: "needle hit"}}
	a.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleUser},
		{ID: "m2", Role: gact.RoleAssistant},
		{ID: "m3", Role: gact.RoleAssistant},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "palette:search:0")
	if !ok {
		t.Fatal("missing semantic palette search target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("search result click should not dispatch command")
	}
	if a.paletteOpen {
		t.Fatal("search result click should close palette")
	}
	if a.scrollOffset != 1 {
		t.Fatalf("search result click should jump to m2, scrollOffset=%d", a.scrollOffset)
	}
}

func TestConversationPartsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.selected = 0
	a.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "first"}}},
		{ID: "m2", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p2", Type: gact.PartTypeText, Text: "second"}}},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:part:1:0")
	if !ok {
		t.Fatal("missing conversation hit target for second message")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.focus != FocusBody {
		t.Fatalf("focus = %v, want body", a.focus)
	}
	if a.bodySelMsgIdx != 1 || a.bodySelPartIdx != 0 {
		t.Fatalf("body cursor = msg %d part %d, want msg 1 part 0", a.bodySelMsgIdx, a.bodySelPartIdx)
	}
}

func TestConversationSelectedPartSecondClickOpensDetail(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.selected = 0
	a.messages = []gact.Message{{
		ID:   "m1",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:   "p1",
			Type: gact.PartTypeText,
			Text: strings.Repeat("detail line\n", 20),
		}},
	}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:part:0:0")
	if !ok {
		t.Fatal("missing conversation hit target")
	}
	click := tea.MouseClickMsg(tea.Mouse{X: target.rect.x, Y: target.rect.y, Button: tea.MouseLeft})
	model, _ := a.Update(click)
	a = model.(*App)
	_ = a.View()
	model, _ = a.Update(click)
	a = model.(*App)

	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("second click on selected conversation part should open detail")
	}
	if a.detailView.partID != "p1" {
		t.Fatalf("detail partID = %q, want p1", a.detailView.partID)
	}
}

func TestContextRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sessions = []gact.Session{{
		ID:    "sess_1",
		Title: "demo",
		Agent: gact.AgentRef{ID: "analysis"},
	}}
	a.selected = 0
	a.contextFiles = []gact.ContextFile{{
		Path:         "docs/ARC_MEMORY_LAYER.md",
		Mode:         "read",
		Size:         2048,
		Language:     "markdown",
		AddedAt:      "2026-05-25T10:00:00Z",
		LastModified: "2026-05-24T18:30:00Z",
	}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:context:file:docs/ARC_MEMORY_LAYER.md")
	if !ok {
		t.Fatal("missing context file hit target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("context row click should open detail")
	}
	for _, want := range []string{
		"path: docs/ARC_MEMORY_LAYER.md",
		"mode: read",
		"size: 2.0 KiB",
		"language: markdown",
		"id: sess_1",
		"agent: analysis",
	} {
		if !strings.Contains(a.detailView.fullText, want) {
			t.Fatalf("context detail missing %q:\n%s", want, a.detailView.fullText)
		}
	}
}

func TestContextHeaderUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sessions = []gact.Session{{ID: "sess_1", Title: "demo"}}
	a.selected = 0
	a.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read"}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:context:header")
	if !ok {
		t.Fatal("missing context header hit target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if !a.sidebarContextCollapsed {
		t.Fatal("context header click should collapse context section")
	}
	if a.sidebarSectionFocus != sidebarSectionContext || !a.sidebarSectionCursor {
		t.Fatalf("context focus not set: focus=%v cursor=%v", a.sidebarSectionFocus, a.sidebarSectionCursor)
	}
}

func TestContextRowsHaveKeyboardParity(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionContext
	a.sidebarSectionCursor = true
	a.sessions = []gact.Session{{
		ID:    "sess_1",
		Title: "demo",
		Agent: gact.AgentRef{ID: "analysis"},
	}}
	a.selected = 0
	a.contextFiles = []gact.ContextFile{
		{Path: "docs/first.md", Mode: "read"},
		{Path: "docs/second.md", Mode: "edit", Size: 4096},
	}

	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.sidebarSectionCursor || a.sidebarSectionFocus != sidebarSectionContext {
		t.Fatalf("down from context header should focus file rows, cursor=%v section=%v", a.sidebarSectionCursor, a.sidebarSectionFocus)
	}
	if a.contextFileSel != 0 {
		t.Fatalf("contextFileSel = %d, want first row", a.contextFileSel)
	}

	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.contextFileSel != 1 {
		t.Fatalf("second down contextFileSel = %d, want second row", a.contextFileSel)
	}

	a.handleSidebarKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("enter on selected context file should open detail")
	}
	if !strings.Contains(a.detailView.fullText, "path: docs/second.md") || !strings.Contains(a.detailView.fullText, "size: 4.0 KiB") {
		t.Fatalf("detail should describe selected context file:\n%s", a.detailView.fullText)
	}
}

func TestContextRowSelectionRendersSingleSidebarCursor(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionContext
	a.sidebarSectionCursor = false
	a.contextFileSel = 0
	a.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.selected = 0
	a.contextFiles = []gact.ContextFile{{Path: "docs/first.md", Mode: "read"}}

	out := ansi.Strip(a.renderSidebar(42, 18))
	if strings.Contains(out, "▌○ demo") {
		t.Fatalf("session row should not show active cursor while context row is selected:\n%s", out)
	}
	if !strings.Contains(out, "▌R docs/first.md") {
		t.Fatalf("selected context row should show active cursor:\n%s", out)
	}
}

func TestContextSectionRemainsVisibleWhenSessionsOverflow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionContext
	a.sidebarSectionCursor = false
	a.sessions = []gact.Session{{ID: "sess_0", Title: "current", Status: gact.StatusIdle}}
	for i := 1; i < 24; i++ {
		a.sessions = append(a.sessions, gact.Session{
			ID:              "sess_child_" + strconv.Itoa(i),
			Title:           "analysis_validator subagent",
			Status:          gact.StatusIdle,
			ParentSessionID: "sess_0",
		})
	}
	a.selected = 0
	a.contextFiles = []gact.ContextFile{{Path: "visual_loop/README.md", Mode: "read"}}

	out := ansi.Strip(a.renderSidebar(42, 24))
	if !strings.Contains(out, "CONTEXT") || !strings.Contains(out, "▌R visual_loop/README.md") {
		t.Fatalf("context section should remain visible below overflowing sessions:\n%s", out)
	}
}

func findHitTargetForTest(a *App, id string) (uiHitTarget, bool) {
	if a.hits == nil {
		return uiHitTarget{}, false
	}
	for _, target := range a.hits.targets {
		if target.id == id {
			return target, true
		}
	}
	return uiHitTarget{}, false
}

func TestQuitConfirmButtonsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.quitConfirmOpen = true
	a.quitConfirmSelected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:quit:no")
	if !ok {
		t.Fatal("missing semantic no button hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("clicking no should not quit")
	}
	if a.quitConfirmOpen {
		t.Fatal("clicking no should close quit confirmation")
	}
}

func TestQuitConfirmNonButtonClickDoesNotChooseByCoordinates(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.quitConfirmOpen = true
	a.quitConfirmSelected = 0

	_ = a.View()
	rect := overlayMouseRect(a.viewQuitConfirm(), a.width, a.height)
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + rect.w - 2,
		Y:      rect.y + 2 + 4,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("non-button click inside quit modal should not fire a command")
	}
	if !a.quitConfirmOpen {
		t.Fatal("non-button click inside quit modal should keep the modal open")
	}
	if a.quitConfirmSelected != 0 {
		t.Fatalf("non-button click should not change selection, got %d", a.quitConfirmSelected)
	}
}

func TestMcpRemoveRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemoveOpen = true
	a.mcpRemoveOptions = []gact.McpServer{
		{ID: "srv_one", Name: "one", Transport: "stdio"},
		{ID: "srv_two", Name: "two", Transport: "http"},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "mcp-remove:item:1")
	if !ok {
		t.Fatal("missing semantic MCP remove row target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.mcpRemoveSel != 1 {
		t.Fatalf("mcpRemoveSel = %d, want clicked row", a.mcpRemoveSel)
	}
	if !a.mcpRemoveSaving {
		t.Fatal("clicking a remove row should enter saving/removing state")
	}
	if cmd == nil {
		t.Fatal("clicking a remove row should dispatch uninstall command")
	}
}

func TestMcpRemoveNonRowClickDoesNotChooseByCoordinates(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemoveOpen = true
	a.mcpRemoveSel = 0
	a.mcpRemoveOptions = []gact.McpServer{{ID: "srv_one", Name: "one", Transport: "stdio"}}

	_ = a.View()
	rect := overlayMouseRect(a.viewMcpRemove(), a.width, a.height)
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + rect.w - 2,
		Y:      rect.y + 2 + 1,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("non-row click inside MCP remove modal should not dispatch")
	}
	if !a.mcpRemoveOpen {
		t.Fatal("non-row click inside MCP remove modal should keep modal open")
	}
	if a.mcpRemoveSaving {
		t.Fatal("non-row click should not enter removing state")
	}
}

func TestMcpInstallButtonsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpInstallOpen = true
	a.mcpInstallInput = "bad"

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:mcp-install:install")
	if !ok {
		t.Fatal("missing semantic MCP install button target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("invalid install click should not dispatch command")
	}
	if a.mcpInstallErr == "" {
		t.Fatal("invalid install click should surface parse error")
	}
}
