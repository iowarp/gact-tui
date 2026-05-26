package ui

import (
	"strconv"
	"strings"
	"testing"
	"time"

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

func TestModalFrameWithSurfaceLayerKeepsHeaderControlsReachable(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.beginHitFrame()
	closed := false
	tabbed := false
	rendered := a.renderModalFrameWithSurfaceLayer(modalFrameOptions{
		width: 42,
		title: "Layered Modal",
		buttons: []menuButton{{
			id:    "layered:close",
			label: "close",
			action: func(*App) tea.Cmd {
				closed = true
				return nil
			},
		}},
		tabs: []menuTab{{
			id:     "layered-tab",
			label:  "Tab",
			active: true,
			action: func(*App) tea.Cmd {
				tabbed = true
				return nil
			},
		}},
		body: "body",
	}, "layered")

	if _, ok := findHitTargetForTest(a, "layered:surface"); !ok {
		t.Fatal("layered frame should register an opaque modal surface")
	}
	closeTarget, ok := findHitTargetForTest(a, "button:layered:close")
	if !ok {
		t.Fatal("layered frame should register header buttons above the surface")
	}
	if _, handled := a.activateHitAt(closeTarget.rect.x, closeTarget.rect.y); !handled || !closed {
		t.Fatalf("layered close button should remain clickable above surface target, handled=%v closed=%v", handled, closed)
	}
	tabTarget, ok := findHitTargetForTest(a, "tab:layered-tab")
	if !ok {
		t.Fatal("layered frame should register tabs above the surface")
	}
	if _, handled := a.activateHitAt(tabTarget.rect.x, tabTarget.rect.y); !handled || !tabbed {
		t.Fatalf("layered tab should remain clickable above surface target, handled=%v tabbed=%v", handled, tabbed)
	}
	rect := overlayMouseRect(rendered.modal, a.width, a.height)
	if _, handled := a.activateHitAt(rect.x+1, rect.y+1); !handled {
		t.Fatal("non-control click inside layered modal should be absorbed by the surface")
	}
}

func TestModalFrameHeaderButtonsAreUnselectedByDefault(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	buttons := []menuButton{{
		id:     "sample:close",
		label:  "close",
		action: func(*App) tea.Cmd { return nil },
	}}

	row, _ := a.renderModalHeader("Title", 40, buttons)
	unselected := a.renderModalButtons(buttons, -1)
	selected := a.renderModalButtons(buttons, 0)

	if !strings.Contains(row, unselected) {
		t.Fatalf("header should render passive action buttons by default:\nrow=%q\nwant segment=%q", row, unselected)
	}
	if strings.Contains(row, selected) {
		t.Fatalf("header should not render selected button styling unless explicitly requested")
	}
}

func TestModalFrameCanExplicitlyHighlightHeaderButton(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	buttons := []menuButton{
		{id: "quit:close", label: "close", action: func(*App) tea.Cmd { return nil }},
		{id: "quit:no", label: "no", action: func(*App) tea.Cmd { return nil }},
	}

	row, _ := a.renderModalHeaderWithColor("Close the TUI?", 46, buttons, a.Theme.Warning, 1)
	selected := a.renderModalButtons(buttons, 1)

	if !strings.Contains(row, selected) {
		t.Fatalf("explicit button selection should be visible in frame header:\nrow=%q\nwant segment=%q", row, selected)
	}
}

func TestModalButtonsHaveVisibleSpacingAndMatchingHitBoxes(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	buttons := []menuButton{
		{id: "sample:close", label: "close", action: func(*App) tea.Cmd { return nil }},
		{id: "sample:save", label: "save", action: func(*App) tea.Cmd { return nil }},
	}

	row := ansi.Strip(a.renderModalButtons(buttons, -1))
	if !strings.Contains(row, "close") || !strings.Contains(row, "save") || strings.Contains(row, "closesave") {
		t.Fatalf("button row should visibly separate adjacent buttons: %q", row)
	}

	a.beginHitFrame()
	modal := a.renderDefaultModalSurface(48, row)
	a.registerModalActionRow(modal, 0, buttons)
	closeTarget, ok := findHitTargetForTest(a, "button:sample:close")
	if !ok {
		t.Fatal("missing close target")
	}
	saveTarget, ok := findHitTargetForTest(a, "button:sample:save")
	if !ok {
		t.Fatal("missing save target")
	}
	if got := saveTarget.rect.x - (closeTarget.rect.x + closeTarget.rect.w); got != modalButtonSpacing {
		t.Fatalf("button hit gap = %d, want %d", got, modalButtonSpacing)
	}
}

func TestTextEntryModalsShareEditorGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady

	cases := []struct {
		name      string
		view      func() string
		buttonID  string
		wantTitle string
	}{
		{
			name: "rename",
			view: func() string {
				a.renameOpen = true
				a.renameDraft = "session title"
				a.renameCursor = len(a.renameDraft)
				return a.viewRename()
			},
			buttonID:  "button:rename:save",
			wantTitle: "Rename session",
		},
		{
			name: "context add",
			view: func() string {
				a.contextAddOpen = true
				a.contextAddDraft = "docs/readme.md"
				a.contextAddCursor = len(a.contextAddDraft)
				return a.viewContextAdd()
			},
			buttonID:  "button:context-add:save",
			wantTitle: "Add file to context",
		},
		{
			name: "mcp install",
			view: func() string {
				a.mcpInstallOpen = true
				a.mcpInstallInput = "files stdio mcp-files /tmp"
				return a.viewMcpInstall()
			},
			buttonID:  "button:mcp-install:install",
			wantTitle: "Install MCP server",
		},
	}

	for _, tc := range cases {
		a.beginHitFrame()
		modal := tc.view()
		plain := ansi.Strip(modal)
		if !strings.Contains(plain, tc.wantTitle) {
			t.Fatalf("%s modal missing title %q:\n%s", tc.name, tc.wantTitle, plain)
		}
		if !strings.Contains(plain, "> ") {
			t.Fatalf("%s modal missing shared editor prompt:\n%s", tc.name, plain)
		}
		target, ok := findHitTargetForTest(a, tc.buttonID)
		if !ok {
			t.Fatalf("%s missing shared header button target %q", tc.name, tc.buttonID)
		}
		rect := overlayMouseRect(modal, a.width, a.height)
		if wantY := rect.y + 2; target.rect.y != wantY {
			t.Fatalf("%s button y = %d, want shared header row %d", tc.name, target.rect.y, wantY)
		}
	}
}

func TestTextEntryModalRegistersCursorHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.beginHitFrame()
	got := -1
	rendered := a.renderTextEntryModal(textEntryModalOptions{
		width:       a.modalWidth(),
		title:       "Entry",
		editor:      a.renderCursorEditor("abcdef", 6),
		editorID:    "sample",
		editorValue: "abcdef",
		cursorAction: func(_ *App, cursor int) {
			got = cursor
		},
	})

	target, ok := findHitTargetForTest(a, "text-entry:sample:cursor:3")
	if !ok {
		t.Fatal("missing shared text-entry cursor target")
	}
	if _, handled := a.activateHitAt(target.rect.x, target.rect.y); !handled {
		t.Fatal("cursor hit target should activate")
	}
	if got != 3 {
		t.Fatalf("cursor target set cursor %d, want 3", got)
	}
	rect := overlayMouseRect(rendered.modal, a.width, a.height)
	if target.rect.y <= rect.y {
		t.Fatalf("cursor target y=%d should be inside modal body below top=%d", target.rect.y, rect.y)
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

func TestModalListDescriptionContinuationDoesNotDoubleIndent(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	rendered := a.renderModalList([]modalListItem{{
		id:          "row:alpha",
		title:       "alpha",
		description: "alpha beta gamma delta epsilon zeta eta theta iota",
		action:      func(*App) tea.Cmd { return nil },
	}}, modalListOptions{width: 24, rowBudget: 4, descriptionLines: 2})

	if len(rendered.rows) < 3 {
		t.Fatalf("rows = %d, want wrapped description rows: %#v", len(rendered.rows), rendered.rows)
	}
	for i, row := range rendered.rows[1:] {
		plain := ansi.Strip(row)
		if strings.HasPrefix(plain, "    ") {
			t.Fatalf("description row %d double-indented: %q", i+1, plain)
		}
		if lipgloss.Width(plain) > 24 {
			t.Fatalf("description row %d width = %d, want <= 24: %q", i+1, lipgloss.Width(plain), plain)
		}
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

func TestModalListRegionRegistersWheelAndRowHits(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.beginHitFrame()
	rowClicked := false
	wheeled := false
	modal := a.renderDefaultModalSurface(48, "Title\n\nalpha\n  details")
	list := modalListRender{
		rows: []string{"alpha", "  details"},
		hits: []modalListHit{{
			id:     "list:item:alpha",
			row:    0,
			height: 2,
			action: func(*App) tea.Cmd {
				rowClicked = true
				return nil
			},
		}},
	}

	a.registerModalListRegion(modal, 2, 0, 42, list, "list:wheel", func(*App, tea.MouseButton) tea.Cmd {
		wheeled = true
		return nil
	})

	rowTarget, ok := findHitTargetForTest(a, "list:item:alpha")
	if !ok {
		t.Fatal("missing list row hit target")
	}
	if _, handled := a.activateHitAt(rowTarget.rect.x, rowTarget.rect.y+1); !handled || !rowClicked {
		t.Fatalf("list row hit should span rendered description rows, handled=%v clicked=%v", handled, rowClicked)
	}
	wheelTarget, ok := findHitTargetForTest(a, "list:wheel")
	if !ok {
		t.Fatal("missing list wheel target")
	}
	if _, handled := a.activateWheelHitAt(wheelTarget.rect.x, wheelTarget.rect.y, tea.MouseWheelDown); !handled || !wheeled {
		t.Fatalf("list wheel hit should activate, handled=%v wheeled=%v", handled, wheeled)
	}
}

func TestModalWheelRegionRegistersRelativeToContent(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.beginHitFrame()
	wheeled := false
	modal := a.renderDefaultModalSurface(48, "Title\n\nscrollable box")

	a.registerModalWheelRegion(modal, "box:wheel", 2, 4, 16, 3, func(*App, tea.MouseButton) tea.Cmd {
		wheeled = true
		return nil
	})

	target, ok := findHitTargetForTest(a, "box:wheel")
	if !ok {
		t.Fatal("missing modal wheel region target")
	}
	rect := overlayMouseRect(modal, a.width, a.height)
	if target.rect.x != rect.x+3+4 || target.rect.y != rect.y+2+2 || target.rect.w != 16 || target.rect.h != 3 {
		t.Fatalf("wheel rect = %+v, want render-relative region", target.rect)
	}
	if _, handled := a.activateWheelHitAt(target.rect.x, target.rect.y, tea.MouseWheelDown); !handled || !wheeled {
		t.Fatalf("modal wheel region should activate, handled=%v wheeled=%v", handled, wheeled)
	}
}

func TestModalCellHitsRegisterRelativeToBody(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.beginHitFrame()
	clicked := false
	modal := a.renderDefaultModalSurface(48, "Title\n\ncontrol  ◀ value ▶")

	a.registerModalCellHits(modal, 2, []modalCellHit{{
		id:    "cell:inc",
		row:   1,
		col:   17,
		width: 3,
		action: func(*App) tea.Cmd {
			clicked = true
			return nil
		},
	}})

	target, ok := findHitTargetForTest(a, "cell:inc")
	if !ok {
		t.Fatal("missing modal cell hit target")
	}
	if _, handled := a.activateHitAt(target.rect.x, target.rect.y); !handled || !clicked {
		t.Fatalf("modal cell hit should activate, handled=%v clicked=%v", handled, clicked)
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
	if got := modalRangeHint(windowed.window, "Up/Down scroll"); got != "Up/Down scroll" {
		t.Fatalf("range hint = %q, want base hint only", got)
	}
}

func TestScrollableModalFrameRegistersBodyWheelAndPersistsWindow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.beginHitFrame()
	wheeled := false
	closed := false
	hintStyle := a.Theme.HintLabel

	rendered := a.renderScrollableModalFrame(scrollableModalFrameOptions{
		frame: modalFrameOptions{
			width: 60,
			title: "Scrollable",
			buttons: []menuButton{{
				id:    "scrollable:close",
				label: "close",
				action: func(*App) tea.Cmd {
					closed = true
					return nil
				},
			}},
			tabs: []menuTab{{
				id:     "scrollable-tab",
				label:  "Tab",
				active: true,
				action: func(*App) tea.Cmd { return nil },
			}},
		},
		content:     strings.Join([]string{"zero", "one", "two", "three"}, "\n"),
		pageSize:    2,
		scroll:      1,
		wheelID:     "shared-scroll",
		footerHint:  "Up/Down scroll",
		footerStyle: &hintStyle,
		wheelAction: func(*App, tea.MouseButton) tea.Cmd {
			wheeled = true
			return nil
		},
	})

	plain := ansi.Strip(rendered.modal)
	if !strings.Contains(plain, "one") || !strings.Contains(plain, "two") || strings.Contains(plain, "zero") {
		t.Fatalf("modal should render selected body window:\n%s", plain)
	}
	if strings.Contains(plain, "2-3/4") {
		t.Fatalf("modal footer should not include numeric range text:\n%s", plain)
	}
	if !strings.Contains(plain, "Up/Down scroll") {
		t.Fatalf("modal footer should keep the base hint:\n%s", plain)
	}
	if !strings.Contains(plain, "┃") {
		t.Fatalf("scrollable modal body should render a side scroll indicator:\n%s", plain)
	}
	if rendered.window.scroll != 1 || rendered.window.start != 1 || rendered.window.end != 3 {
		t.Fatalf("window = %+v, want rows 1-3", rendered.window)
	}
	target, ok := findHitTargetForTest(a, "shared-scroll:body:wheel")
	if !ok {
		t.Fatal("missing shared scroll body wheel target")
	}
	if _, handled := a.activateWheelHitAt(target.rect.x, target.rect.y, tea.MouseWheelDown); !handled || !wheeled {
		t.Fatalf("shared scroll wheel target not activated, handled=%v wheeled=%v", handled, wheeled)
	}
	if _, ok := findHitTargetForTest(a, "button:scrollable:close"); !ok {
		t.Fatal("scrollable modal frame should register header buttons after wheel surface targets")
	}
	closeTarget, _ := findHitTargetForTest(a, "button:scrollable:close")
	if _, handled := a.activateHitAt(closeTarget.rect.x, closeTarget.rect.y); !handled || !closed {
		t.Fatalf("scrollable modal close button should remain clickable above surface target, handled=%v closed=%v", handled, closed)
	}
	if _, ok := findHitTargetForTest(a, "tab:scrollable-tab"); !ok {
		t.Fatal("scrollable modal frame should register tab targets after wheel surface targets")
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

func TestDoctorWheelUsesBodyRegionOnly(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 18
	a.stage = StageReady
	a.doctorOpen = true
	a.doctor = &doctorState{
		tab: doctorTabCapabilities,
		caps: gact.Capabilities{Capabilities: gact.CapabilityFlags{
			Workspaces: true,
			Sessions:   true,
			Subagents:  true,
			MCP:        true,
			Files:      true,
		}},
	}

	_ = a.View()
	body, ok := findHitTargetForTest(a, "doctor:body:wheel")
	if !ok {
		t.Fatal("missing doctor body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      body.rect.x,
		Y:      body.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.doctor == nil || a.doctor.scroll != 1 {
		t.Fatalf("wheel over doctor body should scroll doctor, got %+v", a.doctor)
	}

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "doctor:surface:wheel")
	if !ok {
		t.Fatal("missing doctor surface wheel blocker")
	}
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      surface.rect.x + 1,
		Y:      surface.rect.y + 1,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.doctor == nil || a.doctor.scroll != 1 {
		t.Fatalf("wheel on doctor chrome should not scroll doctor, got %+v", a.doctor)
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

func TestFooterActionsUseVisibleSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 140
	a.height = 36
	a.stage = StageReady
	a.focus = FocusInput

	_ = a.View()
	settingsTarget, ok := findHitTargetForTest(a, "footer:settings")
	if !ok {
		t.Fatal("missing visible footer settings hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      settingsTarget.rect.x,
		Y:      settingsTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if !a.settingsOpen || a.settings == nil {
		t.Fatalf("footer settings click should open settings, open=%v settings=%+v", a.settingsOpen, a.settings)
	}
	if cmd == nil {
		t.Fatal("footer settings click should dispatch settings load command")
	}

	a.settingsOpen = false
	a.settings = nil
	_ = a.View()
	helpTarget, ok := findHitTargetForTest(a, "footer:help")
	if !ok {
		t.Fatal("missing visible footer help hit target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      helpTarget.rect.x,
		Y:      helpTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("footer help click should not dispatch a command")
	}
	if !a.helpOpen || a.helpTab != 0 || a.helpScroll != 0 {
		t.Fatalf("footer help click should open help from first tab, open=%v tab=%d scroll=%d", a.helpOpen, a.helpTab, a.helpScroll)
	}

	a.helpOpen = false
	_ = a.View()
	commandTarget, ok := findHitTargetForTest(a, "footer:command")
	if !ok {
		t.Fatal("missing visible footer command hit target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      commandTarget.rect.x,
		Y:      commandTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("footer command click should not dispatch a command")
	}
	if !a.paletteOpen || a.paletteFilter != "" || a.paletteSel != 0 {
		t.Fatalf("footer command click should open command palette, open=%v filter=%q sel=%d", a.paletteOpen, a.paletteFilter, a.paletteSel)
	}

	a.paletteOpen = false
	_ = a.View()
	quitTarget, ok := findHitTargetForTest(a, "footer:quit")
	if !ok {
		t.Fatal("missing visible footer quit hit target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      quitTarget.rect.x,
		Y:      quitTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("footer quit click should not immediately dispatch a command")
	}
	if !a.quitConfirmOpen || a.quitConfirmSelected != 0 {
		t.Fatalf("footer quit click should open quit confirmation, open=%v selected=%d", a.quitConfirmOpen, a.quitConfirmSelected)
	}
}

func TestHeaderSettingsAndHelpUseVisibleSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusInput

	_ = a.View()
	helpTarget, ok := findHitTargetForTest(a, "header:help")
	if !ok {
		t.Fatal("missing visible header help hit target")
	}
	if helpTarget.rect.y != 0 {
		t.Fatalf("header help target y=%d, want top chrome row", helpTarget.rect.y)
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      helpTarget.rect.x,
		Y:      helpTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("header help click should not dispatch a command")
	}
	if !a.helpOpen || a.helpTab != 0 || a.helpScroll != 0 {
		t.Fatalf("header help click should open help from first tab, open=%v tab=%d scroll=%d", a.helpOpen, a.helpTab, a.helpScroll)
	}

	a.helpOpen = false
	_ = a.View()
	settingsTarget, ok := findHitTargetForTest(a, "header:settings")
	if !ok {
		t.Fatal("missing visible header settings hit target")
	}
	if settingsTarget.rect.y != 0 {
		t.Fatalf("header settings target y=%d, want top chrome row", settingsTarget.rect.y)
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      settingsTarget.rect.x,
		Y:      settingsTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if !a.settingsOpen || a.settings == nil {
		t.Fatalf("header settings click should open settings, open=%v settings=%+v", a.settingsOpen, a.settings)
	}
	if cmd == nil {
		t.Fatal("header settings click should dispatch settings load command")
	}
}

func TestHeaderActionsUseDiscoverableLabels(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 30

	header := ansi.Strip(a.renderHeader())

	for _, want := range []string{"help", "settings"} {
		if !strings.Contains(header, want) {
			t.Fatalf("header action %q should be visible in top chrome: %q", want, header)
		}
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

func TestSettingsTUIArrowControlsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3, tuiRow: 0}
	a.Theme.CollapseThreshold = 4

	_ = a.View()
	inc, ok := findHitTargetForTest(a, "settings:tui:collapse-threshold:inc")
	if !ok {
		t.Fatal("missing semantic TUI increment target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      inc.rect.x,
		Y:      inc.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.Theme.CollapseThreshold != 5 {
		t.Fatalf("increment click should raise collapse threshold, got %d", a.Theme.CollapseThreshold)
	}
	if a.settings == nil || a.settings.tuiRow != 0 || !a.settingsOpen {
		t.Fatalf("increment click should keep settings open and row selected, settings=%+v open=%v", a.settings, a.settingsOpen)
	}

	_ = a.View()
	dec, ok := findHitTargetForTest(a, "settings:tui:collapse-threshold:dec")
	if !ok {
		t.Fatal("missing semantic TUI decrement target")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      dec.rect.x,
		Y:      dec.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.Theme.CollapseThreshold != 4 {
		t.Fatalf("decrement click should lower collapse threshold, got %d", a.Theme.CollapseThreshold)
	}
}

func TestSettingsTUIEveryEditableRowHasMouseSelectionAndControls(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 140
	a.height = 42
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3, tuiRow: 0}
	a.Theme.CostWarnTokens = 50_000
	a.Theme.CostDangerTokens = 100_000
	a.Theme.PasteCompressThreshold = 3
	a.MouseEnabled = true

	cases := []struct {
		rowID  string
		incID  string
		want   int
		assert func(*testing.T, *App)
	}{
		{rowID: "settings:tui:cost-warn", incID: "settings:tui:cost-warn:inc", want: 1, assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.CostWarnTokens != 50_000+costStep {
				t.Fatalf("cost warn inc = %d, want %d", app.Theme.CostWarnTokens, 50_000+costStep)
			}
		}},
		{rowID: "settings:tui:cost-danger", incID: "settings:tui:cost-danger:inc", want: 2, assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.CostDangerTokens != 100_000+costStep {
				t.Fatalf("cost danger inc = %d, want %d", app.Theme.CostDangerTokens, 100_000+costStep)
			}
		}},
		{rowID: "settings:tui:paste-compress", incID: "settings:tui:paste-compress:inc", want: 3, assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.PasteCompressThreshold != 4 {
				t.Fatalf("paste compress inc = %d, want 4", app.Theme.PasteCompressThreshold)
			}
		}},
		{rowID: "settings:tui:intro", incID: "settings:tui:intro:inc", want: 4, assert: func(t *testing.T, app *App) {
			t.Helper()
			if !app.IntroDisabled {
				t.Fatal("intro inc should toggle IntroDisabled on")
			}
		}},
		{rowID: "settings:tui:mouse", incID: "settings:tui:mouse:inc", want: 5, assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.MouseEnabled {
				t.Fatal("mouse inc should toggle MouseEnabled off")
			}
		}},
	}
	for _, tc := range cases {
		a.MouseEnabled = true
		_ = a.View()
		row, ok := findHitTargetForTest(a, tc.rowID)
		if !ok {
			t.Fatalf("missing row target %s", tc.rowID)
		}
		model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
			X:      row.rect.x,
			Y:      row.rect.y + row.rect.h - 1,
			Button: tea.MouseLeft,
		}))
		a = model.(*App)
		if a.settings == nil || a.settings.tuiRow != tc.want {
			t.Fatalf("%s click selected row %v, want %d", tc.rowID, a.settings, tc.want)
		}

		_ = a.View()
		inc, ok := findHitTargetForTest(a, tc.incID)
		if !ok {
			t.Fatalf("missing inc target %s", tc.incID)
		}
		model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{
			X:      inc.rect.x,
			Y:      inc.rect.y,
			Button: tea.MouseLeft,
		}))
		a = model.(*App)
		if a.settings == nil || a.settings.tuiRow != tc.want || !a.settingsOpen {
			t.Fatalf("%s click should keep row selected/open, settings=%+v open=%v", tc.incID, a.settings, a.settingsOpen)
		}
		tc.assert(t, a)
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

func TestSettingsMouseWheelMovesSelectionOnlyOverBody(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 4, languageSel: 0}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "settings:body:wheel")
	if !ok {
		t.Fatal("missing semantic settings body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.settings == nil || a.settings.languageSel != 1 {
		t.Fatalf("wheel over settings body should move language selection, settings=%+v", a.settings)
	}

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "settings:surface:wheel")
	if !ok {
		t.Fatal("missing settings surface wheel blocker")
	}
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      surface.rect.x + 1,
		Y:      surface.rect.y + 1,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.settings == nil || a.settings.languageSel != 1 {
		t.Fatalf("wheel on settings chrome should not move language selection, settings=%+v", a.settings)
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
	_ = a.View()
	target, ok := findHitTargetForTest(a, "help:body:wheel")
	if !ok {
		t.Fatal("missing semantic help body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelUp,
	}))
	a = model.(*App)
	if a.helpScroll >= before {
		t.Fatalf("wheel up should reduce help scroll, before=%d after=%d", before, a.helpScroll)
	}

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "help:surface:wheel")
	if !ok {
		t.Fatal("missing help surface wheel blocker")
	}
	before = a.helpScroll
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      surface.rect.x + 1,
		Y:      surface.rect.y + 1,
		Button: tea.MouseWheelUp,
	}))
	a = model.(*App)
	if a.helpScroll != before {
		t.Fatalf("wheel on help chrome should not scroll help, before=%d after=%d", before, a.helpScroll)
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

func TestMetricsWheelUsesBodyRegionOnly(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 18
	a.stage = StageReady
	a.metricsOpen = true
	a.metrics = &metricsState{data: gact.Metrics{
		UptimeS: 42,
		Sessions: gact.MetricsSessions{
			Total:    10,
			Active:   3,
			ByStatus: map[string]int{"idle": 6, "running": 4},
		},
		Messages: gact.MetricsMessages{
			Total:  200,
			ByRole: map[string]int{"assistant": 100, "user": 100},
		},
		Tokens: gact.MetricsTokens{InputTotal: 1000, OutputTotal: 2000},
		Cost:   gact.MetricsCost{TotalUSD: 1.23, ByProvider: map[string]float64{"argonne": 1.23}},
		Latencies: map[string]gact.MetricsLatencyStat{
			"/v1/a": {P50Ms: 1, P95Ms: 2, MaxMs: 3, Count: 4},
			"/v1/b": {P50Ms: 2, P95Ms: 3, MaxMs: 4, Count: 5},
		},
	}}

	_ = a.View()
	body, ok := findHitTargetForTest(a, "metrics:body:wheel")
	if !ok {
		t.Fatal("missing metrics body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      body.rect.x,
		Y:      body.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.metrics == nil || a.metrics.scroll != 1 {
		t.Fatalf("wheel over metrics body should scroll metrics, got %+v", a.metrics)
	}

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "metrics:surface:wheel")
	if !ok {
		t.Fatal("missing metrics surface wheel blocker")
	}
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      surface.rect.x + 1,
		Y:      surface.rect.y + 1,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.metrics == nil || a.metrics.scroll != 1 {
		t.Fatalf("wheel on metrics chrome should not scroll metrics, got %+v", a.metrics)
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

func TestCatalogMouseWheelMovesSelectionOnlyOverList(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{
			{id: "one", title: "One"},
			{id: "two", title: "Two"},
			{id: "three", title: "Three"},
		},
	}

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "catalog:surface:wheel")
	if !ok {
		t.Fatal("missing catalog surface wheel blocker")
	}
	target, ok := findHitTargetForTest(a, "catalog:list:wheel")
	if !ok {
		t.Fatal("missing semantic catalog list wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.catalogBrowser.sel != 1 {
		t.Fatalf("wheel over list should move catalog selection, got %d", a.catalogBrowser.sel)
	}

	_ = a.View()
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      surface.rect.x + surface.rect.w - 2,
		Y:      surface.rect.y + 2,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.catalogBrowser.sel != 1 {
		t.Fatalf("wheel outside list should not move catalog selection, got %d", a.catalogBrowser.sel)
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

func TestFilePickerUsesSharedScrollAffordanceForLongLists(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.filePickerOpen = true
	a.filePicker = &filePickerState{
		loaded: true,
		sel:    12,
	}
	for i := 0; i < 18; i++ {
		n := itoa2(i)
		if i < 10 {
			n = "0" + n
		}
		a.filePicker.entries = append(a.filePicker.entries, gact.FileEntry{
			Path: "file_" + n + ".txt",
		})
	}

	out := stripANSI(a.viewFilePicker())
	if !strings.Contains(out, "file_12.txt") {
		t.Fatalf("selected file should remain visible in bounded picker:\n%s", out)
	}
	if strings.Contains(out, "file_0.txt") {
		t.Fatalf("bounded file picker should not render every file:\n%s", out)
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("bounded file picker should show shared side scroll rail:\n%s", out)
	}

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "file-picker:item:12"); !ok {
		t.Fatal("missing semantic target for selected file inside scrolled picker")
	}
	if _, ok := findHitTargetForTest(a, "file-picker:item:0"); ok {
		t.Fatal("offscreen file picker row should not register a stale hit target")
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

func TestFilePickerMouseWheelMovesSelectionOnlyOverList(t *testing.T) {
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
			{Path: "gamma.txt"},
		},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "file-picker:list:wheel")
	if !ok {
		t.Fatal("missing semantic file picker list wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.filePicker.sel != 1 {
		t.Fatalf("wheel over list should move file picker selection, got %d", a.filePicker.sel)
	}

	_ = a.View()
	rect := overlayMouseRect(a.viewFilePicker(), a.width, a.height)
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      rect.x + rect.w - 2,
		Y:      rect.y + 2,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.filePicker.sel != 1 {
		t.Fatalf("wheel outside list should not move file picker selection, got %d", a.filePicker.sel)
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
	out := ansi.Strip(a.viewPalette())
	if strings.Contains(out, "showing ") {
		t.Fatalf("palette should use shared scroll affordance instead of textual ranges:\n%s", out)
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("palette should render shared side scroll affordance for long command lists:\n%s", out)
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
}

func TestPaletteMouseWheelMovesSelectionOnlyOverList(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.paletteOpen = true
	a.commands = []gact.Command{
		{ID: "/alpha", Title: "Alpha", Source: "builtin"},
		{ID: "/beta", Title: "Beta", Source: "builtin"},
		{ID: "/gamma", Title: "Gamma", Source: "builtin"},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "palette:list:wheel")
	if !ok {
		t.Fatal("missing semantic palette list wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.paletteSel != 1 {
		t.Fatalf("wheel over palette list should move selection, got %d", a.paletteSel)
	}

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "palette:surface:wheel")
	if !ok {
		t.Fatal("missing palette surface wheel blocker")
	}
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      surface.rect.x + 1,
		Y:      surface.rect.y + 1,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.paletteSel != 1 {
		t.Fatalf("wheel on palette chrome should not move selection, got %d", a.paletteSel)
	}
}

func TestPaletteSearchMouseWheelMovesSelectionOnlyOverList(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.paletteOpen = true
	a.paletteFilter = "?needle"
	a.searchMatches = []client.SearchMatch{
		{MessageID: "msg_alpha", Snippet: "alpha needle"},
		{MessageID: "msg_beta", Snippet: "beta needle"},
		{MessageID: "msg_gamma", Snippet: "gamma needle"},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "palette:search:list:wheel")
	if !ok {
		t.Fatal("missing semantic palette search list wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.paletteSel != 1 {
		t.Fatalf("wheel over palette search list should move selection, got %d", a.paletteSel)
	}

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "palette:surface:wheel")
	if !ok {
		t.Fatal("missing palette search surface wheel blocker")
	}
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      surface.rect.x + 1,
		Y:      surface.rect.y + 1,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.paletteSel != 1 {
		t.Fatalf("wheel on palette search chrome should not move selection, got %d", a.paletteSel)
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

func TestPaletteSearchWindowUsesSharedScrollAffordance(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.paletteOpen = true
	a.paletteFilter = "?needle"
	a.paletteSel = 10
	for i := 0; i < 14; i++ {
		a.searchMatches = append(a.searchMatches, client.SearchMatch{
			MessageID: "msg_" + strconv.Itoa(i),
			Snippet:   "needle hit " + strconv.Itoa(i),
		})
	}

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "palette:search:10"); !ok {
		t.Fatal("selected offscreen palette search result should be rendered with a semantic target")
	}
	if _, ok := findHitTargetForTest(a, "palette:search:0"); ok {
		t.Fatal("palette search window should not keep the first row target when selection moves down-list")
	}
	out := ansi.Strip(a.viewPalette())
	if strings.Contains(out, "showing ") {
		t.Fatalf("palette search should use shared scroll affordance instead of textual ranges:\n%s", out)
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("palette search should render shared side scroll affordance for long result lists:\n%s", out)
	}
}

func TestMainModalsShareTopCornersAndWidth(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 150
	a.height = 45
	a.settings = &settingsState{tab: 3}
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{{id: "one", title: "One", desc: "first tool"}},
	}
	a.quitConfirmOpen = true

	rects := map[string]mouseRect{
		"help":     overlayMouseRect(a.viewHelp(), a.width, a.height),
		"settings": overlayMouseRect(a.viewSettings(), a.width, a.height),
		"catalog":  overlayMouseRect(a.viewCatalogBrowser(), a.width, a.height),
		"quit":     overlayMouseRect(a.viewQuitConfirm(), a.width, a.height),
	}
	want := rects["help"]
	for name, rect := range rects {
		if rect.x != want.x || rect.y != want.y || rect.w != want.w {
			t.Fatalf("%s rect = %+v, want same top corners and width as help %+v", name, rect, want)
		}
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

func TestConversationDetailHintClickOpensDetail(t *testing.T) {
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
			ID:     "p1",
			Type:   gact.PartTypeToolResult,
			CallID: "c1",
			Content: []gact.Part{{
				Type: gact.PartTypeText,
				Text: "summary line",
			}},
			Metadata: map[string]any{
				"raw_result": map[string]any{"rows": []string{"alpha", "beta"}},
			},
		}},
	}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:detail:0:0")
	if !ok {
		t.Fatal("missing conversation detail hint hit target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("clicking detail hint should open detail on first click")
	}
	if a.focus != FocusBody || a.bodySelMsgIdx != 0 || a.bodySelPartIdx != 0 {
		t.Fatalf("body cursor = focus %v msg %d part %d, want body 0:0", a.focus, a.bodySelMsgIdx, a.bodySelPartIdx)
	}
	if a.detailView.partID != "p1" {
		t.Fatalf("detail partID = %q, want p1", a.detailView.partID)
	}
}

func TestSidebarSessionsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.sessions = []gact.Session{
		{ID: "sess_1", Title: "first", Status: gact.StatusIdle},
		{ID: "sess_2", Title: "second", Status: gact.StatusIdle},
	}
	a.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:session:sess_2")
	if !ok {
		t.Fatal("missing semantic sidebar session target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.focus != FocusSidebar {
		t.Fatalf("focus = %v, want sidebar", a.focus)
	}
	if a.sidebarSectionFocus != sidebarSectionSessions || a.sidebarSectionCursor {
		t.Fatalf("session hit should focus session rows, section=%v cursor=%v", a.sidebarSectionFocus, a.sidebarSectionCursor)
	}
	if a.selected != 1 {
		t.Fatalf("selected = %d, want second session", a.selected)
	}
	if cmd == nil {
		t.Fatal("sidebar session click should return selectSession command")
	}
}

func TestSidebarSessionsHeaderUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:sessions:header")
	if !ok {
		t.Fatal("missing semantic sessions header target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("sessions header click should not dispatch a command")
	}
	if !a.sidebarSessionsCollapsed {
		t.Fatal("sessions header semantic hit should collapse sessions")
	}
	if a.sidebarSectionFocus != sidebarSectionSessions || !a.sidebarSectionCursor {
		t.Fatalf("sessions header should focus section cursor, section=%v cursor=%v", a.sidebarSectionFocus, a.sidebarSectionCursor)
	}
}

func TestSidebarExpandedChildSessionsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sessions = []gact.Session{
		{ID: "parent", Title: "parent", Status: gact.StatusIdle},
		{ID: "child-a", Title: "csv_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle},
		{ID: "child-b", Title: "analysis_validator subagent", ParentSessionID: "parent", Status: gact.StatusIdle},
		{ID: "after", Title: "after", Status: gact.StatusIdle},
	}
	a.selected = 0
	a.showChildSessions = true

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:session:child-b")
	if !ok {
		t.Fatal("missing semantic child session target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.selected != 2 {
		t.Fatalf("clicking child target selected %d, want child-b index 2", a.selected)
	}
	if cmd == nil {
		t.Fatal("child session click should return selectSession command")
	}
}

func TestSidebarSelectedParentSemanticHitTogglesChildren(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sessions = []gact.Session{
		{ID: "parent", Title: "parent", Status: gact.StatusIdle},
		{ID: "child", Title: "child", ParentSessionID: "parent", Status: gact.StatusIdle},
	}
	a.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:session:parent")
	if !ok {
		t.Fatal("missing semantic parent session target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("clicking selected parent should toggle children without dispatching select command")
	}
	if !a.showChildSessions {
		t.Fatal("selected parent semantic hit should expand child sessions")
	}
}

func TestInputCommandChipUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.MouseEnabled = true
	a.focus = FocusBody
	a.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "input:command")
	if !ok {
		t.Fatal("missing semantic input command hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("input command chip click should not dispatch a command")
	}
	if !a.paletteOpen || a.paletteFilter != "" || a.paletteSel != 0 {
		t.Fatalf("input command chip should open palette, open=%v filter=%q sel=%d", a.paletteOpen, a.paletteFilter, a.paletteSel)
	}
	if a.focus != FocusInput {
		t.Fatalf("focus = %v, want input", a.focus)
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
	sidebar := ansi.Strip(a.renderSidebar(42, 24))
	if !strings.Contains(sidebar, "read") || !strings.Contains(sidebar, "2.0 KiB") {
		t.Fatalf("context row should expose readable mode and size:\n%s", sidebar)
	}
	if strings.Contains(sidebar, " R ") {
		t.Fatalf("context row should not use cryptic single-letter mode badges:\n%s", sidebar)
	}
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
	if !strings.Contains(out, "▌docs/first.md read") {
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
	if !strings.Contains(out, "CONTEXT") || !strings.Contains(out, "▌visual_loop/README.md read") {
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

func TestQuitConfirmButtonsAlignWithSharedHeader(t *testing.T) {
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
	if wantY := rect.y + 2; target.rect.y != wantY {
		t.Fatalf("quit no button y = %d, want shared frame header row %d", target.rect.y, wantY)
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
	if strings.Contains(out, "↑ 4") || strings.Contains(out, "↓ 4") {
		t.Fatalf("bounded MCP remove window should not render textual overflow count rows:\n%s", out)
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("bounded MCP remove window should show shared side scroll rail:\n%s", out)
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

	_ = a.View()
	target, ok := findHitTargetForTest(a, "mcp-remove:list:wheel")
	if !ok {
		t.Fatal("missing semantic MCP remove list wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.mcpRemoveSel != 1 {
		t.Fatalf("wheel down should move MCP remove selection, got %d", a.mcpRemoveSel)
	}
	_ = a.View()
	target, ok = findHitTargetForTest(a, "mcp-remove:list:wheel")
	if !ok {
		t.Fatal("missing semantic MCP remove list wheel target after redraw")
	}
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelUp,
	}))
	a = model.(*App)
	if a.mcpRemoveSel != 0 {
		t.Fatalf("wheel up should move MCP remove selection, got %d", a.mcpRemoveSel)
	}
}

func TestMcpRemoveMouseWheelOutsideListDoesNotMoveSelection(t *testing.T) {
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

	_ = a.View()
	view := a.viewMcpRemove()
	rect := overlayMouseRect(view, a.width, a.height)
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      rect.x + rect.w - 2,
		Y:      rect.y + 2,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)

	if a.mcpRemoveSel != 0 {
		t.Fatalf("wheel outside list should not move MCP remove selection, got %d", a.mcpRemoveSel)
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

func TestMcpRemoveButtonsAlignWithSharedHeader(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemoveOpen = true
	a.mcpRemoveOptions = []gact.McpServer{{ID: "srv_one", Name: "one", Transport: "stdio"}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:mcp-remove:cancel")
	if !ok {
		t.Fatal("missing semantic MCP remove cancel button target")
	}
	rect := overlayMouseRect(a.viewMcpRemove(), a.width, a.height)
	if wantY := rect.y + 2; target.rect.y != wantY {
		t.Fatalf("MCP remove cancel button y = %d, want shared frame header row %d", target.rect.y, wantY)
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

func TestMcpInstallButtonsAlignWithSharedHeader(t *testing.T) {
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
	rect := overlayMouseRect(a.viewMcpInstall(), a.width, a.height)
	if wantY := rect.y + 2; target.rect.y != wantY {
		t.Fatalf("MCP install button y = %d, want shared frame header row %d", target.rect.y, wantY)
	}
}

func TestMcpInstallEditorClickPlacesCursor(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpInstallOpen = true
	a.mcpInstallInput = "files stdio mcp-files /tmp"
	a.mcpInstallCursor = len([]rune(a.mcpInstallInput))

	_ = a.View()
	target, ok := findHitTargetForTest(a, "text-entry:mcp-install:cursor:5")
	if !ok {
		t.Fatal("missing MCP install editor cursor target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("cursor click should not dispatch a command")
	}
	if a.mcpInstallCursor != 5 {
		t.Fatalf("MCP install cursor = %d, want 5", a.mcpInstallCursor)
	}
	if !a.mcpInstallOpen {
		t.Fatal("cursor click should keep MCP install open")
	}
}

func TestMcpInstallLineEditorSupportsMiddleInsert(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.mcpInstallOpen = true
	a.mcpInstallInput = "ab"
	a.mcpInstallCursor = 1

	_, cmd := a.handleMcpInstallKey(tea.KeyPressMsg{Text: "Z"})
	if cmd != nil {
		t.Fatal("typing should not dispatch a command")
	}
	if a.mcpInstallInput != "aZb" || a.mcpInstallCursor != 2 {
		t.Fatalf("middle insert input=%q cursor=%d, want aZb cursor 2", a.mcpInstallInput, a.mcpInstallCursor)
	}
	_, _ = a.handleMcpInstallKey(keyMsg("left"))
	_, _ = a.handleMcpInstallKey(keyMsg("backspace"))
	if a.mcpInstallInput != "Zb" || a.mcpInstallCursor != 0 {
		t.Fatalf("middle backspace input=%q cursor=%d, want Zb cursor 0", a.mcpInstallInput, a.mcpInstallCursor)
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
