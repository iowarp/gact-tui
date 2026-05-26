package ui

import (
	"strconv"
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
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

func TestWheelHitTargetsCanSitBehindRowClickTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.beginHitFrame()
	wheeled := false
	clicked := false
	a.registerScreenWheelHit("section:wheel", mouseRect{x: 0, y: 0, w: 10, h: 5}, func(*App, tea.MouseButton) tea.Cmd {
		wheeled = true
		return nil
	})
	a.registerScreenHit("row:click", mouseRect{x: 0, y: 0, w: 10, h: 1}, func(*App) tea.Cmd {
		clicked = true
		return nil
	})

	if _, handled := a.activateWheelHitAt(1, 0, tea.MouseWheelDown); !handled {
		t.Fatal("expected wheel hit to activate through overlaid row click target")
	}
	if !wheeled {
		t.Fatal("wheel action did not run")
	}
	if clicked {
		t.Fatal("wheel action should not run click handler")
	}
}

func TestRenderModalHeaderKeepsActionButtonsReachable(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	buttons := []menuButton{{
		id:     "sample:close",
		label:  "close",
		action: func(*App) tea.Cmd { return nil },
	}}

	row, buttonCol := a.renderModalHeader("Very long modal title that should truncate", 24, buttons)
	plain := ansi.Strip(row)

	if !strings.Contains(plain, "close") {
		t.Fatalf("header should keep action button visible: %q", plain)
	}
	if strings.Contains(plain, "Very long modal title that should truncate") {
		t.Fatalf("header should truncate title before it collides with buttons: %q", plain)
	}
	if buttonCol <= 0 {
		t.Fatalf("buttonCol = %d, want positive registration column", buttonCol)
	}
}

func TestModalListRendersDescriptionRowsIntoOneHit(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	rendered := a.renderModalList([]modalListItem{{
		id:          "row:alpha",
		title:       "alpha",
		description: "long description that should wrap onto more than one rendered row so mouse hits cover the whole item",
		selected:    true,
		action:      func(*App) tea.Cmd { return nil },
	}}, modalListOptions{width: 36, rowBudget: 4, descriptionLines: 2})

	if len(rendered.rows) != 3 {
		t.Fatalf("rows = %d, want title plus two description rows: %#v", len(rendered.rows), rendered.rows)
	}
	if len(rendered.hits) != 1 {
		t.Fatalf("hits = %d, want one item hit", len(rendered.hits))
	}
	if rendered.hits[0].id != "row:alpha" || rendered.hits[0].row != 0 || rendered.hits[0].height != 3 {
		t.Fatalf("hit = %+v, want one hit spanning all rendered rows", rendered.hits[0])
	}
}

func TestModalListSupportsCustomSelectedMarker(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	rendered := a.renderModalList([]modalListItem{{
		id:             "row:current",
		title:          "current",
		selected:       true,
		selectedMarker: "✓ ",
		action:         func(*App) tea.Cmd { return nil },
	}}, modalListOptions{width: 24, rowBudget: 1})

	if len(rendered.rows) != 1 {
		t.Fatalf("rows = %d, want one row", len(rendered.rows))
	}
	if got := ansi.Strip(rendered.rows[0]); !strings.Contains(got, "✓ current") {
		t.Fatalf("custom selected marker not rendered: %q", got)
	}
}

func TestModalButtonsRenderAndRegisterWithSameLabels(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	buttons := []menuButton{
		{id: "primary", label: "apply", action: func(*App) tea.Cmd { return nil }},
		{id: "cancel", label: "cancel", action: func(*App) tea.Cmd { return nil }},
	}
	row := a.renderModalButtons(buttons, 0)
	if !strings.Contains(ansi.Strip(row), "apply") || !strings.Contains(ansi.Strip(row), "cancel") {
		t.Fatalf("button row did not render labels: %q", ansi.Strip(row))
	}
	modal := a.renderDefaultModalSurface(50, row)
	a.beginHitFrame()
	a.registerModalButtons(modal, 0, 0, buttons)
	if _, ok := findHitTargetForTest(a, "button:primary"); !ok {
		t.Fatal("missing primary button hit")
	}
	if _, ok := findHitTargetForTest(a, "button:cancel"); !ok {
		t.Fatal("missing cancel button hit")
	}
}

func TestModalActionRowAppendsAndRegistersConsistently(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	buttons := []menuButton{
		{id: "save", label: "save", action: func(*App) tea.Cmd { return nil }},
		{id: "cancel", label: "cancel", action: func(*App) tea.Cmd { return nil }},
	}
	rows, row := a.appendModalActionRow([]string{"title", ""}, buttons, 1)
	if row != 2 {
		t.Fatalf("action row = %d, want appended row index 2", row)
	}
	if got := ansi.Strip(rows[row]); !strings.Contains(got, "save") || !strings.Contains(got, "cancel") {
		t.Fatalf("action row did not render labels: %q", got)
	}
	modal := a.renderDefaultModalSurface(50, strings.Join(rows, "\n"))
	a.beginHitFrame()
	a.registerModalActionRow(modal, row, buttons)
	if _, ok := findHitTargetForTest(a, "button:save"); !ok {
		t.Fatal("missing save button hit")
	}
	if _, ok := findHitTargetForTest(a, "button:cancel"); !ok {
		t.Fatal("missing cancel button hit")
	}
}

func TestModalTabsRenderAndRegisterWithSameLabels(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	tabs := []menuTab{
		{id: "one", label: "One", active: true, action: func(*App) tea.Cmd { return nil }},
		{id: "two", label: "Two", action: func(*App) tea.Cmd { return nil }},
	}
	row := a.renderModalTabsWithLayout(tabs, 1, 0)
	if !strings.Contains(ansi.Strip(row), "One") || !strings.Contains(ansi.Strip(row), "Two") {
		t.Fatalf("tab row did not render labels: %q", ansi.Strip(row))
	}
	modal := a.renderDefaultModalSurface(50, row)
	a.beginHitFrame()
	a.registerModalTabsWithLayout(modal, 0, tabs, 1, 0)
	if _, ok := findHitTargetForTest(a, "tab:one"); !ok {
		t.Fatal("missing first tab hit")
	}
	if _, ok := findHitTargetForTest(a, "tab:two"); !ok {
		t.Fatal("missing second tab hit")
	}
}

func TestModalFrameRegistersHeaderButtonsAndTabs(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.beginHitFrame()

	buttons := []menuButton{{
		id:     "frame:close",
		label:  "close",
		action: func(*App) tea.Cmd { return nil },
	}}
	tabs := []menuTab{
		{id: "frame-one", label: "One", active: true, action: func(*App) tea.Cmd { return nil }},
		{id: "frame-two", label: "Two", action: func(*App) tea.Cmd { return nil }},
	}
	rendered := a.renderModalFrameWithLayout(modalFrameOptions{
		width:      64,
		title:      "Frame Title",
		buttons:    buttons,
		tabs:       tabs,
		tabPadding: 1,
		tabSpacing: 0,
		body:       "primary body",
		footer:     "footer hint",
	})

	if rendered.bodyRow != 4 {
		t.Fatalf("bodyRow = %d, want 4 after title, spacer, tabs, spacer", rendered.bodyRow)
	}
	if rendered.footerRow <= rendered.bodyRow {
		t.Fatalf("footerRow = %d should follow bodyRow %d", rendered.footerRow, rendered.bodyRow)
	}

	plain := ansi.Strip(rendered.modal)
	for _, want := range []string{"Frame Title", "close", "One", "Two", "primary body", "footer hint"} {
		if !strings.Contains(plain, want) {
			t.Fatalf("modal frame missing %q:\n%s", want, plain)
		}
	}
	if _, ok := findHitTargetForTest(a, "button:frame:close"); !ok {
		t.Fatal("missing frame close button hit target")
	}
	if _, ok := findHitTargetForTest(a, "tab:frame-two"); !ok {
		t.Fatal("missing frame tab hit target")
	}
}

func TestBoundedScrollWindowClampsToVisibleRange(t *testing.T) {
	tests := []struct {
		name       string
		total      int
		budget     int
		scroll     int
		wantStart  int
		wantEnd    int
		wantScroll int
	}{
		{name: "negative scroll", total: 10, budget: 4, scroll: -3, wantStart: 0, wantEnd: 4, wantScroll: 0},
		{name: "past end", total: 10, budget: 4, scroll: 99, wantStart: 6, wantEnd: 10, wantScroll: 6},
		{name: "content shorter than budget", total: 3, budget: 10, scroll: 4, wantStart: 0, wantEnd: 3, wantScroll: 0},
		{name: "zero budget", total: 3, budget: 0, scroll: 2, wantStart: 2, wantEnd: 3, wantScroll: 2},
	}
	for _, tc := range tests {
		got := boundedScrollWindow(tc.total, tc.budget, tc.scroll)
		if got.start != tc.wantStart || got.end != tc.wantEnd || got.scroll != tc.wantScroll || got.total != tc.total {
			t.Fatalf("%s: got %+v, want start=%d end=%d scroll=%d total=%d", tc.name, got, tc.wantStart, tc.wantEnd, tc.wantScroll, tc.total)
		}
	}
}

func TestWindowModalBodyAndRangeHintUseSharedScrollSemantics(t *testing.T) {
	body := strings.Join([]string{"zero", "one", "two", "three", "four"}, "\n")
	windowed := windowModalBody(body, 2, 99)

	if windowed.body != "three\nfour" {
		t.Fatalf("windowed body = %q, want final two rows", windowed.body)
	}
	if windowed.window.scroll != 3 || windowed.window.start != 3 || windowed.window.end != 5 || windowed.window.total != 5 {
		t.Fatalf("window = %+v, want clamped final window", windowed.window)
	}
	if got := modalRangeHint(windowed.window, "Up/Down scroll"); got != "Up/Down scroll" {
		t.Fatalf("range hint at bottom = %q, want base hint only", got)
	}

	windowed = windowModalBody(body, 2, 1)
	if got := modalRangeHint(windowed.window, "Up/Down scroll"); got != "2-3/5  Up/Down scroll" {
		t.Fatalf("range hint = %q, want visible range prefix", got)
	}
}

func TestSelectionAndScrollMovementClamp(t *testing.T) {
	selectionCases := []struct {
		name  string
		sel   int
		count int
		delta int
		want  int
	}{
		{name: "moves down", sel: 1, count: 4, delta: 1, want: 2},
		{name: "clamps first", sel: 0, count: 4, delta: -1, want: 0},
		{name: "clamps last", sel: 3, count: 4, delta: 1, want: 3},
		{name: "keeps empty", sel: 5, count: 0, delta: 1, want: 5},
		{name: "keeps neutral", sel: 2, count: 4, delta: 0, want: 2},
	}
	for _, tc := range selectionCases {
		if got := moveSelection(tc.sel, tc.count, tc.delta); got != tc.want {
			t.Fatalf("%s: moveSelection = %d, want %d", tc.name, got, tc.want)
		}
	}

	if got := moveScrollOffset(0, -1); got != 0 {
		t.Fatalf("moveScrollOffset should clamp at zero, got %d", got)
	}
	if got := moveScrollOffset(4, 1); got != 5 {
		t.Fatalf("moveScrollOffset should increment, got %d", got)
	}
}

func TestSelectedItemWindowKeepsSelectionVisible(t *testing.T) {
	tests := []struct {
		name      string
		total     int
		selected  int
		budget    int
		wantStart int
		wantEnd   int
	}{
		{name: "top", total: 20, selected: 0, budget: 8, wantStart: 0, wantEnd: 8},
		{name: "middle", total: 20, selected: 10, budget: 8, wantStart: 6, wantEnd: 14},
		{name: "bottom", total: 20, selected: 19, budget: 8, wantStart: 12, wantEnd: 20},
		{name: "short", total: 3, selected: 2, budget: 8, wantStart: 0, wantEnd: 3},
		{name: "empty", total: 0, selected: 2, budget: 8, wantStart: 0, wantEnd: 0},
	}
	for _, tc := range tests {
		got := selectedItemWindow(tc.total, tc.selected, tc.budget)
		if got.start != tc.wantStart || got.end != tc.wantEnd {
			t.Fatalf("%s: window = %+v, want start=%d end=%d", tc.name, got, tc.wantStart, tc.wantEnd)
		}
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
	target, ok := findHitTargetForTest(a, "tab:doctor-capabilities")
	if !ok {
		t.Fatal("missing semantic doctor capabilities tab target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.doctor == nil || a.doctor.tab != doctorTabCapabilities {
		t.Fatalf("doctor tab = %v, want capabilities", a.doctor)
	}
}

func TestDoctorButtonsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.doctorOpen = true
	a.doctor = &doctorState{tab: doctorTabCapabilities}

	_ = a.View()
	refreshTarget, ok := findHitTargetForTest(a, "button:doctor:refresh")
	if !ok {
		t.Fatal("missing semantic doctor refresh target")
	}
	closeTarget, ok := findHitTargetForTest(a, "button:doctor:close")
	if !ok {
		t.Fatal("missing semantic doctor close target")
	}

	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      refreshTarget.rect.x,
		Y:      refreshTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("clicking doctor refresh should dispatch a fetch command")
	}
	if a.doctor == nil || !a.doctor.loading || a.doctor.tab != doctorTabCapabilities {
		t.Fatalf("refresh should preserve tab and enter loading state, got %+v", a.doctor)
	}

	a.doctor = &doctorState{tab: doctorTabHealth}
	_ = a.View()
	closeTarget, ok = findHitTargetForTest(a, "button:doctor:close")
	if !ok {
		t.Fatal("missing semantic doctor close target after refresh")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      closeTarget.rect.x,
		Y:      closeTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("clicking doctor close should not dispatch a command")
	}
	if a.doctorOpen || a.doctor != nil {
		t.Fatal("clicking doctor close should close modal and clear state")
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
	target, ok := findHitTargetForTest(a, "tab:settings-tui")
	if !ok {
		t.Fatal("missing semantic settings TUI tab target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
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

func TestSettingsCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:settings:close")
	if !ok {
		t.Fatal("missing semantic settings close target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("settings close should not dispatch a command")
	}
	if a.settingsOpen {
		t.Fatal("settings close should close the modal")
	}
}

func TestSettingsOutsideClickUsesSharedCloseState(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3}

	_ = a.View()
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      0,
		Y:      0,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("outside settings click should not dispatch a command")
	}
	if a.settingsOpen {
		t.Fatal("outside settings click should close the modal")
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
	target, ok := findHitTargetForTest(a, "settings:tui:cost-danger")
	if !ok {
		t.Fatal("missing semantic settings TUI cost danger target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
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

func TestSettingsModelRowUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 0}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "settings:model:change-provider")
	if !ok {
		t.Fatal("missing semantic settings model target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd == nil {
		t.Fatal("model row click should dispatch provider fetch command")
	}
	if a.settingsOpen || !a.lmConfigOpen || a.lmConfig == nil {
		t.Fatalf("model row click should switch to provider modal, settingsOpen=%v lmConfigOpen=%v lmConfig=%+v", a.settingsOpen, a.lmConfigOpen, a.lmConfig)
	}
}

func TestSettingsAgentRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 40
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{
		tab:      1,
		agentSel: 0,
		agentList: []gact.AgentDef{{
			ID:           "main",
			Source:       "builtin",
			Title:        "Main Agent",
			Description:  "orchestrator",
			SystemPrompt: "Route to the right expert.",
			Tier:         1,
		}, {
			ID:           "analysis",
			Source:       "builtin",
			Title:        "Analysis Expert",
			Description:  "scientific reasoning",
			SystemPrompt: "Analyze the data.",
			Tier:         2,
		}},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "settings:agent:analysis")
	if !ok {
		t.Fatal("missing semantic settings agent target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("agent row click should not dispatch command")
	}
	if a.settings == nil || a.settings.agentSel != 1 {
		t.Fatalf("agent row click should select analysis, settings=%+v", a.settings)
	}
	if !a.detailViewOpen || a.detailView == nil || !strings.Contains(a.detailView.title, "Analysis") {
		t.Fatalf("agent row click should open clicked detail, detail=%+v", a.detailView)
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
	options := availableLanguageOptions()
	if len(options) < 3 {
		t.Fatalf("need at least three language options, got %d", len(options))
	}
	target, ok := findHitTargetForTest(a, "settings:language:"+options[2].Locale)
	if !ok {
		t.Fatal("missing semantic settings language target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
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
	targetTab := helpTabIndex("Commands")
	target, ok := findHitTargetForTest(a, "tab:help-commands")
	if !ok {
		t.Fatal("missing semantic help commands tab target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
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

func TestHelpCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 30
	a.stage = StageReady
	a.helpOpen = true
	a.helpTab = helpTabIndex("Commands")

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:help:close")
	if !ok {
		t.Fatal("missing semantic help close button target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("clicking help close should not dispatch a command")
	}
	if a.helpOpen {
		t.Fatal("clicking help close should close help")
	}
	if a.helpTab != 0 {
		t.Fatalf("helpTab = %d, want reset to 0", a.helpTab)
	}
}

func TestHelpOverlayUsesSharedBodyWindowAndMouseWheel(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 16
	a.stage = StageReady
	a.helpOpen = true
	a.helpTab = helpTabIndex("Commands")
	a.helpScroll = 1 << 30

	out := stripANSI(a.viewHelp())
	if !strings.Contains(out, "switch tab") {
		t.Fatalf("help footer should keep the base hint visible:\n%s", out)
	}
	if a.helpScroll <= 0 {
		t.Fatalf("render should clamp and persist positive help scroll, got %d", a.helpScroll)
	}

	before := a.helpScroll
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{Button: tea.MouseWheelUp}))
	a = model.(*App)
	if a.helpScroll >= before {
		t.Fatalf("wheel up should reduce help scroll, before=%d after=%d", before, a.helpScroll)
	}
}

func TestMetricsButtonsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 30
	a.stage = StageReady
	a.metricsOpen = true
	a.metrics = &metricsState{data: gact.Metrics{UptimeS: 42}}

	_ = a.View()
	refreshTarget, ok := findHitTargetForTest(a, "button:metrics:refresh")
	if !ok {
		t.Fatal("missing semantic metrics refresh target")
	}
	closeTarget, ok := findHitTargetForTest(a, "button:metrics:close")
	if !ok {
		t.Fatal("missing semantic metrics close target")
	}

	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      refreshTarget.rect.x,
		Y:      refreshTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("clicking refresh should dispatch a metrics load command")
	}
	if a.metrics == nil || !a.metrics.loading {
		t.Fatalf("clicking refresh should mark metrics loading, got %+v", a.metrics)
	}

	_ = a.View()
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      closeTarget.rect.x,
		Y:      closeTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("clicking close should not dispatch a command")
	}
	if a.metricsOpen {
		t.Fatal("clicking close should close metrics")
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
	target, ok := findHitTargetForTest(a, "catalog:item:1")
	if !ok {
		t.Fatal("missing semantic catalog item target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
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

func TestCatalogRowTargetsAlignWithSharedFrameBody(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{
			{id: "one", title: "One", desc: "first tool"},
			{id: "two", title: "Two", desc: "second tool"},
		},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "catalog:item:0")
	if !ok {
		t.Fatal("missing semantic first catalog target")
	}
	rect := overlayMouseRect(a.viewCatalogBrowser(), a.width, a.height)
	if wantY := rect.y + 2 + 2; target.rect.y != wantY {
		t.Fatalf("first catalog row y = %d, want shared frame body row %d", target.rect.y, wantY)
	}
}

func TestCatalogNonRowClickDoesNotChooseByCoordinates(t *testing.T) {
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
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 5,
		Y:      rect.y + 2 + 10,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("non-row click inside catalog should not dispatch")
	}
	if !a.catalogBrowserOpen {
		t.Fatal("non-row click inside catalog should keep browser open")
	}
	if a.detailViewOpen {
		t.Fatal("non-row click inside catalog should not open detail")
	}
}

func TestCatalogCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{{id: "shell_bash", title: "shell_bash"}},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:catalog:close")
	if !ok {
		t.Fatal("missing semantic catalog close button target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("catalog close button should not dispatch a command")
	}
	if a.catalogBrowserOpen || a.catalogBrowser != nil {
		t.Fatalf("catalog close button should close browser, open=%v browser=%v", a.catalogBrowserOpen, a.catalogBrowser)
	}
}

func TestCatalogBackButtonUsesSemanticHitTarget(t *testing.T) {
	parent := &catalogBrowserState{
		kind:  catalogKindMcp,
		title: "MCP servers",
		items: []catalogItem{{id: "mcp_fs", title: "Filesystem"}},
	}
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:   catalogKindMcpDetail,
		title:  "MCP detail",
		parent: parent,
		items:  []catalogItem{{id: "summary", title: "Summary"}},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:catalog:back")
	if !ok {
		t.Fatal("missing semantic catalog back button target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("catalog back button should not dispatch a command")
	}
	if !a.catalogBrowserOpen {
		t.Fatal("catalog back button should keep browser open")
	}
	if a.catalogBrowser != parent {
		t.Fatalf("catalog back button should restore parent browser, got %#v", a.catalogBrowser)
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

func TestFilePickerTargetsAlignWithSharedFrameBody(t *testing.T) {
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
	target, ok := findHitTargetForTest(a, "file-picker:item:0")
	if !ok {
		t.Fatal("missing semantic first file picker row target")
	}
	rect := overlayMouseRect(a.viewFilePicker(), a.width, a.height)
	if wantY := rect.y + 2 + 4; target.rect.y != wantY {
		t.Fatalf("first file picker row y = %d, want shared frame body/list row %d", target.rect.y, wantY)
	}
}

func TestFilePickerCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.filePickerOpen = true
	a.filePicker = &filePickerState{
		loaded: true,
		filter: "beta",
		entries: []gact.FileEntry{
			{Path: "alpha.csv"},
			{Path: "beta.parquet"},
		},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:file-picker:close")
	if !ok {
		t.Fatal("missing semantic file picker close target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("file picker close should not dispatch a command")
	}
	if a.filePickerOpen || a.filePicker != nil {
		t.Fatalf("file picker close should clear picker state, open=%v picker=%v", a.filePickerOpen, a.filePicker)
	}
	if got := a.input.Value(); strings.Contains(got, "@") {
		t.Fatalf("close should not insert a file, input=%q", got)
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

func TestPaletteCommandTargetsAlignWithSharedFrameBody(t *testing.T) {
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
	rect := overlayMouseRect(a.viewPalette(), a.width, a.height)
	if wantY := rect.y + 2 + 5; target.rect.y != wantY {
		t.Fatalf("first palette command y = %d, want shared frame body/list row %d", target.rect.y, wantY)
	}
}

func TestPaletteCommandWindowFollowsSelection(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	for i := 0; i < 14; i++ {
		id := "/cmd" + strconv.Itoa(i)
		a.commands = append(a.commands, gact.Command{ID: id, Title: "Command " + strconv.Itoa(i), Source: "builtin"})
	}
	a.paletteOpen = true
	a.paletteSel = 10

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "palette:command:10"); !ok {
		t.Fatal("selected offscreen palette command should be rendered with a semantic target")
	}
	if _, ok := findHitTargetForTest(a, "palette:command:0"); ok {
		t.Fatal("palette command window should not keep the first row target when selection moves down-list")
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

func TestPaletteCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.paletteOpen = true
	a.paletteFilter = "/theme"
	a.paletteSel = 1
	a.searchMatches = []client.SearchMatch{{MessageID: "m1", Snippet: "stale"}}
	a.searching = true

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:palette:close")
	if !ok {
		t.Fatal("missing semantic palette close target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("palette close should not dispatch a command")
	}
	if a.paletteOpen || a.paletteFilter != "" || a.paletteSel != 0 || len(a.searchMatches) != 0 || a.searching {
		t.Fatalf("palette close should reset state, open=%v filter=%q sel=%d matches=%d searching=%v", a.paletteOpen, a.paletteFilter, a.paletteSel, len(a.searchMatches), a.searching)
	}
}

func TestPaletteSearchCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.paletteOpen = true
	a.paletteFilter = "?needle"
	a.searchMatches = []client.SearchMatch{{MessageID: "m1", Snippet: "needle"}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:palette:close")
	if !ok {
		t.Fatal("missing semantic palette search close target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("palette search close should not dispatch a command")
	}
	if a.paletteOpen || a.paletteFilter != "" || len(a.searchMatches) != 0 {
		t.Fatalf("palette search close should reset state, open=%v filter=%q matches=%d", a.paletteOpen, a.paletteFilter, len(a.searchMatches))
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

func TestDetailCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.detailViewOpen = true
	a.detailScroll = 3
	a.detailView = &bulkyPartRef{
		title:    "Context detail",
		fullText: strings.Repeat("detail line\n", 20),
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:detail:close")
	if !ok {
		t.Fatal("missing semantic detail close target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("clicking detail close should not dispatch a command")
	}
	if a.detailViewOpen || a.detailView != nil {
		t.Fatal("clicking detail close should close detail")
	}
	if a.detailScroll != 0 {
		t.Fatalf("detailScroll = %d, want reset to 0", a.detailScroll)
	}
}

func TestDetailOutsideClickUsesSharedCloseState(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.detailViewOpen = true
	a.detailScroll = 4
	a.detailView = &bulkyPartRef{
		title:    "Very long detail title that should not collide with the close action",
		fullText: strings.Repeat("detail line\n", 20),
	}

	_ = a.View()
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      0,
		Y:      0,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("outside detail click should not dispatch a command")
	}
	if a.detailViewOpen || a.detailView != nil || a.detailScroll != 0 {
		t.Fatalf("outside click should close detail and reset state, open=%v detail=%v scroll=%d", a.detailViewOpen, a.detailView, a.detailScroll)
	}
}

func TestContextRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sessions = []gact.Session{{
		ID:           "sess_1",
		WorkspaceID:  "ws_default",
		Title:        "demo",
		Agent:        gact.AgentRef{ID: "analysis"},
		Status:       gact.StatusIdle,
		UpdatedAt:    time.Date(2026, 5, 25, 12, 0, 0, 0, time.UTC),
		MessageCount: 7,
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
		"File",
		"path: docs/ARC_MEMORY_LAYER.md",
		"mode: read",
		"size: 2.0 KiB",
		"language: markdown",
		"Session",
		"id: sess_1",
		"workspace: ws_default",
		"status: idle",
		"agent: analysis",
		"latest_activity: 2026-05-25T12:00:00Z",
		"messages: 7",
		"Actions",
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

func TestPermissionBannerActionsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusWaitingPermission}}
	a.selected = 0
	a.currentStatus = gact.StatusWaitingPermission
	a.pendingPermissions = []client.PermissionWire{{
		PermissionRequest: gact.PermissionRequest{
			ID:        "perm_1",
			SessionID: "sess_1",
			Summary:   "Run shell command: rm -rf /tmp/scratch",
		},
		Status: "pending",
	}}

	_ = a.View()
	for _, id := range []string{
		"permission:allow",
		"permission:deny",
		"permission:session",
		"permission:workspace",
	} {
		if _, ok := findHitTargetForTest(a, id); !ok {
			t.Fatalf("missing semantic permission hit target %q", id)
		}
	}

	target, _ := findHitTargetForTest(a, "permission:allow")
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd == nil {
		t.Fatal("clicking allow should dispatch a permission response command")
	}
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

func TestQuitConfirmButtonsAlignWithSharedFrameBody(t *testing.T) {
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
	view := a.viewQuitConfirm()
	rect := overlayMouseRect(view, a.width, a.height)
	buttonLine := -1
	for i, line := range strings.Split(stripANSI(view), "\n") {
		if strings.Contains(line, "close") && strings.Contains(line, "no") && strings.Contains(line, "detach") {
			buttonLine = i
			break
		}
	}
	if buttonLine < 0 {
		t.Fatalf("could not find visible quit action row in:\n%s", stripANSI(view))
	}
	if wantY := rect.y + buttonLine; target.rect.y != wantY {
		t.Fatalf("quit no button y = %d, want visible action row %d", target.rect.y, wantY)
	}
}

func TestQuitConfirmButtonsUseSharedLabels(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	buttons := a.quitConfirmButtons()
	if len(buttons) != len(quitConfirmOptions) {
		t.Fatalf("buttons = %d, want %d", len(buttons), len(quitConfirmOptions))
	}
	for i, button := range buttons {
		if button.id != "quit:"+quitConfirmOptions[i] {
			t.Fatalf("button %d id = %q", i, button.id)
		}
		if button.label == "" || button.action == nil {
			t.Fatalf("button %d should carry render label and action: %+v", i, button)
		}
	}
	row := ansi.Strip(a.renderModalButtons(buttons, 1))
	for _, want := range []string{"close", "no", "detach"} {
		if !strings.Contains(row, want) {
			t.Fatalf("quit button row missing %q: %q", want, row)
		}
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

func TestMcpRemoveTargetsAlignWithSharedFrameBody(t *testing.T) {
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
	target, ok := findHitTargetForTest(a, "mcp-remove:item:0")
	if !ok {
		t.Fatal("missing semantic first MCP remove row target")
	}
	rect := overlayMouseRect(a.viewMcpRemove(), a.width, a.height)
	if wantY := rect.y + 2 + 2; target.rect.y != wantY {
		t.Fatalf("first MCP remove row y = %d, want shared frame body row %d", target.rect.y, wantY)
	}
}

func TestMcpRemoveDescriptionRowUsesSameSemanticHit(t *testing.T) {
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
	if target.rect.h < 2 {
		t.Fatalf("MCP remove target height = %d, want title and description rows", target.rect.h)
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y + target.rect.h - 1,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.mcpRemoveSel != 1 || !a.mcpRemoveSaving || cmd == nil {
		t.Fatalf("description-row click should remove row 1, sel=%d saving=%v cmd=%v", a.mcpRemoveSel, a.mcpRemoveSaving, cmd)
	}
}

func TestMcpRemoveUsesBoundedScrollWindowAndVisibleHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemoveOpen = true
	a.mcpRemoveSel = 10
	for i := 0; i < 16; i++ {
		a.mcpRemoveOptions = append(a.mcpRemoveOptions, gact.McpServer{
			ID:        "srv_" + itoa2(i),
			Name:      "server " + itoa2(i),
			Transport: "stdio",
		})
	}

	out := stripANSI(a.viewMcpRemove())
	if !strings.Contains(out, "server 10") {
		t.Fatalf("selected MCP server should remain visible in bounded window:\n%s", out)
	}
	if strings.Contains(out, "server 00") {
		t.Fatalf("bounded MCP remove window should not render every server:\n%s", out)
	}
	if !strings.Contains(out, "↑ ") || !strings.Contains(out, "↓ ") {
		t.Fatalf("bounded MCP remove window should show overflow indicators:\n%s", out)
	}

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "mcp-remove:item:10"); !ok {
		t.Fatal("missing semantic target for selected row inside scrolled MCP remove window")
	}
	if _, ok := findHitTargetForTest(a, "mcp-remove:item:0"); ok {
		t.Fatal("offscreen MCP remove row should not register a stale hit target")
	}
}

func TestMcpRemoveMouseWheelMovesSelection(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemoveOpen = true
	for i := 0; i < 4; i++ {
		a.mcpRemoveOptions = append(a.mcpRemoveOptions, gact.McpServer{
			ID:        "srv_" + itoa2(i),
			Name:      "server " + itoa2(i),
			Transport: "stdio",
		})
	}

	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{Button: tea.MouseWheelDown}))
	a = model.(*App)
	if a.mcpRemoveSel != 1 {
		t.Fatalf("wheel down should move MCP remove selection, got %d", a.mcpRemoveSel)
	}
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{Button: tea.MouseWheelUp}))
	a = model.(*App)
	if a.mcpRemoveSel != 0 {
		t.Fatalf("wheel up should move MCP remove selection, got %d", a.mcpRemoveSel)
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

func TestMcpRemoveCancelButtonUsesSharedCloseState(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemoveOpen = true
	a.mcpRemoveSel = 1
	a.mcpRemoveSaving = true
	a.mcpRemoveOptions = []gact.McpServer{
		{ID: "srv_one", Name: "one", Transport: "stdio"},
		{ID: "srv_two", Name: "two", Transport: "http"},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:mcp-remove:cancel")
	if !ok {
		t.Fatal("missing semantic MCP remove cancel button target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("cancel click should not dispatch a command")
	}
	if a.mcpRemoveOpen || a.mcpRemoveOptions != nil || a.mcpRemoveSel != 0 || a.mcpRemoveSaving {
		t.Fatalf("cancel should clear remove modal state, open=%v options=%v sel=%d saving=%v", a.mcpRemoveOpen, a.mcpRemoveOptions, a.mcpRemoveSel, a.mcpRemoveSaving)
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

func TestMcpInstallOutsideClickUsesSharedCloseState(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpInstallOpen = true
	a.mcpInstallInput = "bad"
	a.mcpInstallErr = "parse failed"
	a.mcpInstallSaving = true

	_ = a.View()
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      0,
		Y:      0,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("outside click should not dispatch a command")
	}
	if a.mcpInstallOpen || a.mcpInstallInput != "" || a.mcpInstallErr != "" || a.mcpInstallSaving {
		t.Fatalf("outside click should clear install modal state, open=%v input=%q err=%q saving=%v", a.mcpInstallOpen, a.mcpInstallInput, a.mcpInstallErr, a.mcpInstallSaving)
	}
}
