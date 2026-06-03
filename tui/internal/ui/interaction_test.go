package ui

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
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

func TestCtrlIPaneCycleMatchesTab(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.stage = StageReady
	a.focus = FocusInput
	a.SetSidebarLayout([]string{"sessions"}, []string{"files"})

	model, _ := a.Update(tea.KeyPressMsg{Code: 'i', Mod: tea.ModCtrl})
	a = model.(*App)
	if a.focus != FocusSidebar {
		t.Fatalf("focus after ctrl+i = %v, want sidebar", a.focus)
	}

	model, _ = a.Update(tea.KeyPressMsg{Code: 'i', Mod: tea.ModCtrl})
	a = model.(*App)
	if a.focus != FocusBody {
		t.Fatalf("focus after second ctrl+i = %v, want body", a.focus)
	}

	model, _ = a.Update(tea.KeyPressMsg{Code: 'i', Mod: tea.ModCtrl})
	a = model.(*App)
	if a.focus != FocusRightSidebar {
		t.Fatalf("focus after third ctrl+i = %v, want right sidebar", a.focus)
	}
}

func TestOverlayHitActivationIgnoresBaseTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	baseHits := 0
	overlayHits := 0
	a.hits = &uiHitRegistry{}
	a.hits.add(uiHitTarget{id: "base", rect: mouseRect{x: 0, y: 0, w: 10, h: 10}, action: func(*App) tea.Cmd {
		baseHits++
		return nil
	}})
	a.baseHitTargetCount = len(a.hits.targets)

	if _, handled := a.activateOverlayHitAt(1, 1, tea.MouseLeft); handled {
		t.Fatal("overlay activation should ignore base-only targets")
	}
	if baseHits != 0 {
		t.Fatalf("base target fired through overlay activation: %d", baseHits)
	}

	a.hits.add(uiHitTarget{id: "overlay", rect: mouseRect{x: 0, y: 0, w: 10, h: 10}, action: func(*App) tea.Cmd {
		overlayHits++
		return nil
	}})
	if _, handled := a.activateOverlayHitAt(1, 1, tea.MouseLeft); !handled {
		t.Fatal("overlay activation should handle overlay targets")
	}
	if baseHits != 0 || overlayHits != 1 {
		t.Fatalf("baseHits=%d overlayHits=%d, want 0/1", baseHits, overlayHits)
	}
}

func TestOverlayWheelActivationIgnoresBaseTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	baseWheels := 0
	overlayWheels := 0
	a.hits = &uiHitRegistry{}
	a.hits.add(uiHitTarget{id: "base", rect: mouseRect{x: 0, y: 0, w: 10, h: 10}, wheelAction: func(*App, tea.MouseButton) tea.Cmd {
		baseWheels++
		return nil
	}})
	a.baseHitTargetCount = len(a.hits.targets)

	if _, handled := a.activateOverlayWheelHitAt(1, 1, tea.MouseWheelDown); handled {
		t.Fatal("overlay wheel activation should ignore base-only targets")
	}
	if baseWheels != 0 {
		t.Fatalf("base wheel target fired through overlay activation: %d", baseWheels)
	}

	a.hits.add(uiHitTarget{id: "overlay", rect: mouseRect{x: 0, y: 0, w: 10, h: 10}, wheelAction: func(*App, tea.MouseButton) tea.Cmd {
		overlayWheels++
		return nil
	}})
	if _, handled := a.activateOverlayWheelHitAt(1, 1, tea.MouseWheelDown); !handled {
		t.Fatal("overlay wheel activation should handle overlay targets")
	}
	if baseWheels != 0 || overlayWheels != 1 {
		t.Fatalf("baseWheels=%d overlayWheels=%d, want 0/1", baseWheels, overlayWheels)
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
	if _, handled := a.activateHitAt(closeTarget.rect.x, closeTarget.rect.y, tea.MouseLeft); !handled || !closed {
		t.Fatalf("layered close button should remain clickable above surface target, handled=%v closed=%v", handled, closed)
	}
	tabTarget, ok := findHitTargetForTest(a, "tab:layered-tab")
	if !ok {
		t.Fatal("layered frame should register tabs above the surface")
	}
	if _, handled := a.activateHitAt(tabTarget.rect.x, tabTarget.rect.y, tea.MouseLeft); !handled || !tabbed {
		t.Fatalf("layered tab should remain clickable above surface target, handled=%v tabbed=%v", handled, tabbed)
	}
	rect := overlayMouseRect(rendered.modal, a.width, a.height)
	if _, handled := a.activateHitAt(rect.x+1, rect.y+1, tea.MouseLeft); !handled {
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
	if modalButtonSpacing < 3 {
		t.Fatalf("modal button spacing = %d, want at least 3 cells between adjacent action chips", modalButtonSpacing)
	}
	buttons := []menuButton{
		{id: "sample:close", label: "close", action: func(*App) tea.Cmd { return nil }},
		{id: "sample:save", label: "save", action: func(*App) tea.Cmd { return nil }},
	}

	renderedRow, hits := a.renderModalButtonsWithHits(buttons, -1)
	row := ansi.Strip(renderedRow)
	if !strings.Contains(row, "close") || !strings.Contains(row, "save") || strings.Contains(row, "closesave") {
		t.Fatalf("button row should visibly separate adjacent buttons: %q", row)
	}
	if len(hits) != 2 {
		t.Fatalf("button hits = %d, want 2", len(hits))
	}
	if hits[0].id != "button:sample:close" || hits[0].col != 0 || hits[0].width != lipgloss.Width("close")+4 {
		t.Fatalf("unexpected close hit geometry: %+v", hits[0])
	}
	if hits[1].id != "button:sample:save" || hits[1].col != hits[0].width+modalButtonSpacing || hits[1].width != lipgloss.Width("save")+4 {
		t.Fatalf("unexpected save hit geometry: %+v after %+v", hits[1], hits[0])
	}

	a.beginHitFrame()
	modal := a.renderDefaultModalSurface(48, renderedRow)
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
		{
			name: "agent write",
			view: func() string {
				a.openAgentWrite(agentWriteModeCreate, "", "data-agent")
				return a.viewAgentWrite()
			},
			buttonID:  "button:agent-write:save",
			wantTitle: "Create user agent",
		},
		{
			name: "agent blueprint manage",
			view: func() string {
				a.openAgentBlueprintManage(agentBlueprintManageValidate)
				return a.viewAgentBlueprintManage()
			},
			buttonID:  "button:agent-blueprint-manage:validate",
			wantTitle: "Validate agent blueprint",
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
	if _, handled := a.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled {
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

func TestSingleLineTextEntryModalsAcceptPaste(t *testing.T) {
	cases := []struct {
		name    string
		setup   func(*App)
		assert  func(*testing.T, *App)
		content string
	}{
		{
			name: "rename",
			setup: func(a *App) {
				a.renameOpen = true
				a.renameDraft = "old "
				a.renameCursor = len([]rune(a.renameDraft))
			},
			assert: func(t *testing.T, a *App) {
				t.Helper()
				if a.renameDraft != "old new title" || a.renameCursor != len([]rune(a.renameDraft)) {
					t.Fatalf("rename paste draft=%q cursor=%d", a.renameDraft, a.renameCursor)
				}
			},
			content: "new\r\ntitle",
		},
		{
			name: "context add",
			setup: func(a *App) {
				a.contextAddOpen = true
			},
			assert: func(t *testing.T, a *App) {
				t.Helper()
				if a.contextAddDraft != "docs/readme.md" || a.contextAddCursor != len([]rune(a.contextAddDraft)) {
					t.Fatalf("context paste draft=%q cursor=%d", a.contextAddDraft, a.contextAddCursor)
				}
			},
			content: "docs/\r\nreadme.md",
		},
		{
			name: "prompt edit",
			setup: func(a *App) {
				a.openPromptEdit("planner", "builtin", "Planner", "")
			},
			assert: func(t *testing.T, a *App) {
				t.Helper()
				if a.promptEditDraft != "use concise evidence" || a.promptEditCursor != len([]rune(a.promptEditDraft)) {
					t.Fatalf("prompt paste draft=%q cursor=%d", a.promptEditDraft, a.promptEditCursor)
				}
			},
			content: "use concise\r\nevidence",
		},
		{
			name: "mcp install",
			setup: func(a *App) {
				a.openMcpInstallModal()
			},
			assert: func(t *testing.T, a *App) {
				t.Helper()
				if a.mcpInstallInput != "files stdio mcp-files /tmp" || a.mcpInstallCursor != len([]rune(a.mcpInstallInput)) {
					t.Fatalf("mcp install paste input=%q cursor=%d", a.mcpInstallInput, a.mcpInstallCursor)
				}
			},
			content: "files stdio\r\nmcp-files /tmp",
		},
		{
			name: "workspace create name",
			setup: func(a *App) {
				a.workspaceSwitchOpen = true
				a.workspaceCreateOpen = true
				a.workspaceCreateField = 0
			},
			assert: func(t *testing.T, a *App) {
				t.Helper()
				if a.workspaceCreateName != "benchmark workspace" || a.workspaceCreateNameCur != len([]rune(a.workspaceCreateName)) {
					t.Fatalf("workspace name paste=%q cursor=%d", a.workspaceCreateName, a.workspaceCreateNameCur)
				}
			},
			content: "benchmark\r\nworkspace",
		},
		{
			name: "workspace create root",
			setup: func(a *App) {
				a.workspaceSwitchOpen = true
				a.workspaceCreateOpen = true
				a.workspaceCreateField = 1
			},
			assert: func(t *testing.T, a *App) {
				t.Helper()
				if a.workspaceCreateRoot != "/tmp/benchmark root" || a.workspaceCreateRootCur != len([]rune(a.workspaceCreateRoot)) {
					t.Fatalf("workspace root paste=%q cursor=%d", a.workspaceCreateRoot, a.workspaceCreateRootCur)
				}
			},
			content: "/tmp/benchmark\r\nroot",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			a := newReadyApp(nil, nil)
			tc.setup(a)

			_, _ = a.Update(tea.PasteMsg{Content: tc.content})

			tc.assert(t, a)
		})
	}
}

func TestTextEntryModalRegistersStatusHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.beginHitFrame()
	clicked := false
	rendered := a.renderTextEntryModal(textEntryModalOptions{
		width:  a.modalWidth(),
		title:  "Entry",
		editor: a.renderCursorEditor("path", 4),
		status: []string{"mode:  read  edit"},
		statusHits: []modalCellHit{{
			id:    "sample:status:edit",
			col:   len("mode:  read"),
			width: len("  edit"),
			action: func(*App) tea.Cmd {
				clicked = true
				return nil
			},
		}},
	})

	target, ok := findHitTargetForTest(a, "sample:status:edit")
	if !ok {
		t.Fatal("missing shared text-entry status target")
	}
	if _, handled := a.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("status target activation handled=%v clicked=%v", handled, clicked)
	}
	cursorTarget, ok := findHitTargetForTest(a, "text-entry:sample:cursor:0")
	if ok && target.rect.y == cursorTarget.rect.y {
		t.Fatalf("status target should not share editor row: status=%+v cursor=%+v", target.rect, cursorTarget.rect)
	}
	rect := overlayMouseRect(rendered.modal, a.width, a.height)
	if target.rect.y <= rect.y+2 {
		t.Fatalf("status target y=%d should be below modal header/body start %d", target.rect.y, rect.y+2)
	}
}

func TestTextEntryModalRegistersNamedSurfaceWheelBlocker(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.beginHitFrame()
	rendered := a.renderTextEntryModal(textEntryModalOptions{
		width:     a.modalWidth(),
		title:     "Entry",
		surfaceID: "entry",
		editor:    a.renderCursorEditor("path", 4),
	})

	target, ok := findHitTargetForTest(a, "entry:surface:wheel")
	if !ok {
		t.Fatal("missing shared text-entry surface wheel target")
	}
	rect := overlayMouseRect(rendered.modal, a.width, a.height)
	if target.rect != rect {
		t.Fatalf("surface wheel rect = %+v, want overlay rect %+v", target.rect, rect)
	}
	if _, handled := a.activateOverlayWheelHitAt(target.rect.x, target.rect.y, tea.MouseWheelDown); !handled {
		t.Fatal("text-entry surface wheel target should activate through overlay wheel dispatch")
	}
}

func TestTextEntryModalRegistersIntroListHits(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.beginHitFrame()
	clicked := false
	list := modalListRender{
		rows: []string{"  stdio  files stdio mcp-files /tmp"},
		hits: []modalListHit{{
			id:     "entry:example:stdio",
			row:    0,
			height: 1,
			action: func(*App) tea.Cmd {
				clicked = true
				return nil
			},
		}},
	}
	rendered := a.renderTextEntryModal(textEntryModalOptions{
		width:      a.modalWidth(),
		title:      "Entry",
		intro:      []string{strings.Join(list.rows, "\n")},
		introList:  list,
		introListW: 40,
		editor:     a.renderCursorEditor("path", 4),
	})

	target, ok := findHitTargetForTest(a, "entry:example:stdio")
	if !ok {
		t.Fatal("missing shared text-entry intro list target")
	}
	rect := overlayMouseRect(rendered.modal, a.width, a.height)
	if target.rect.y != rect.y+2+rendered.bodyRow {
		t.Fatalf("intro list target y = %d, want first body row %d", target.rect.y, rect.y+2+rendered.bodyRow)
	}
	if _, handled := a.activateHitAt(target.rect.x+target.rect.w-1, target.rect.y, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("intro list target activation handled=%v clicked=%v", handled, clicked)
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
	if _, handled := a.activateHitAt(rowTarget.rect.x, rowTarget.rect.y+1, tea.MouseLeft); !handled || !rowClicked {
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
	if _, handled := a.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("modal cell hit should activate, handled=%v clicked=%v", handled, clicked)
	}
}

func TestModalCellHitsSupportColumnOffsets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.beginHitFrame()
	modal := a.renderDefaultModalSurface(40, "abc")
	a.registerModalCellHitsAt(modal, 1, 7, []modalCellHit{{
		id:     "cell:offset",
		row:    2,
		col:    3,
		width:  4,
		height: 1,
		action: func(*App) tea.Cmd { return nil },
	}})

	target, ok := findHitTargetForTest(a, "cell:offset")
	if !ok {
		t.Fatal("missing offset cell hit")
	}
	rect := overlayMouseRect(modal, a.width, a.height)
	wantX := rect.x + 3 + 7 + 3
	wantY := rect.y + 2 + 1 + 2
	if target.rect.x != wantX || target.rect.y != wantY {
		t.Fatalf("offset target rect = %+v, want x=%d y=%d", target.rect, wantX, wantY)
	}
}

func TestModalInlineOptionsRenderActiveChipAndHits(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	clicked := ""
	row, hits := a.renderModalInlineOptions("mode: ", []modalInlineOption{{
		id:    "mode:read",
		label: "read",
		action: func(*App) tea.Cmd {
			clicked = "read"
			return nil
		},
	}, {
		id:     "mode:edit",
		label:  "edit",
		active: true,
		action: func(*App) tea.Cmd {
			clicked = "edit"
			return nil
		},
	}})

	plain := ansi.Strip(row)
	if !strings.Contains(plain, "mode:  read  edit ") {
		t.Fatalf("inline options row = %q", plain)
	}
	if len(hits) != 2 {
		t.Fatalf("hit count = %d, want 2", len(hits))
	}
	if hits[1].id != "mode:edit" || hits[1].col <= hits[0].col || hits[1].width != lipgloss.Width(" edit ") {
		t.Fatalf("unexpected edit hit geometry: %+v after %+v", hits[1], hits[0])
	}
	if hits[1].action == nil {
		t.Fatal("missing edit action")
	}
	_ = hits[1].action(a)
	if clicked != "edit" {
		t.Fatalf("clicked = %q, want edit", clicked)
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
	row, hits := a.renderModalButtonsWithHits(buttons, 0)
	if !strings.Contains(ansi.Strip(row), "apply") || !strings.Contains(ansi.Strip(row), "cancel") {
		t.Fatalf("button row did not render labels: %q", ansi.Strip(row))
	}
	if len(hits) != 2 {
		t.Fatalf("button hits = %d, want 2", len(hits))
	}
	if hits[0].id != "button:primary" || hits[0].col != 0 || hits[0].width != lipgloss.Width("apply")+4 {
		t.Fatalf("unexpected primary hit geometry: %+v", hits[0])
	}
	if hits[1].id != "button:cancel" || hits[1].col != hits[0].width+modalButtonSpacing || hits[1].width != lipgloss.Width("cancel")+4 {
		t.Fatalf("unexpected cancel hit geometry: %+v after %+v", hits[1], hits[0])
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

func TestCenteredModalButtonsUseSharedGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	buttons := []menuButton{
		{id: "save", label: "Save and connect", action: func(*App) tea.Cmd { return nil }},
	}
	row, startCol := a.renderCenteredModalButtons(40, buttons, -1)
	if !strings.Contains(ansi.Strip(row), "Save and connect") {
		t.Fatalf("centered button row did not render label: %q", ansi.Strip(row))
	}
	buttonW := lipgloss.Width(a.renderModalButtons(buttons, -1))
	if startCol != (40-buttonW)/2 {
		t.Fatalf("centered button col = %d, want %d", startCol, (40-buttonW)/2)
	}
	modal := a.renderDefaultModalSurface(50, row)
	a.beginHitFrame()
	a.registerModalButtons(modal, 0, startCol, buttons)
	target, ok := findHitTargetForTest(a, "button:save")
	if !ok {
		t.Fatal("missing centered button hit")
	}
	rect := overlayMouseRect(modal, a.width, a.height)
	if target.rect.x != rect.x+3+startCol {
		t.Fatalf("centered button hit x = %d, want %d", target.rect.x, rect.x+3+startCol)
	}
}

func TestDisabledModalButtonsDoNotRegisterHits(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	buttons := []menuButton{
		{id: "disabled", label: "apply", disabled: true, action: func(*App) tea.Cmd { return nil }},
	}
	row, hits := a.renderModalButtonsWithHits(buttons, -1)
	if !strings.Contains(ansi.Strip(row), "apply") {
		t.Fatalf("disabled button should still render its label: %q", ansi.Strip(row))
	}
	if len(hits) != 0 {
		t.Fatalf("disabled button hits = %d, want none", len(hits))
	}
}

func TestSideScrollIndicatorSharedRailRendering(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	lines := []string{"alpha", "beta", "gamma", "delta"}
	got, ok := a.renderSideScrollIndicator(lines, 8, scrollWindow{start: 3, end: 7, total: 12})
	if !ok {
		t.Fatal("expected shared side rail to render for overflowed content")
	}
	plain := ansi.Strip(strings.Join(got, "\n"))
	if !strings.Contains(plain, "│") || !strings.Contains(plain, "┃") {
		t.Fatalf("shared side rail should render track and thumb:\n%s", plain)
	}
	if strings.Contains(strings.Join(lines, "\n"), "┃") {
		t.Fatal("shared side rail should not mutate the input lines")
	}

	unchanged, ok := a.renderSideScrollIndicator(lines, 8, scrollWindow{start: 0, end: 4, total: 4})
	if ok {
		t.Fatal("non-overflowing content should not render a rail")
	}
	if strings.Join(unchanged, "\n") != strings.Join(lines, "\n") {
		t.Fatalf("non-overflowing lines changed: %#v", unchanged)
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
	row, hits := a.renderModalTabsWithHits(tabs, 1, 0)
	if !strings.Contains(ansi.Strip(row), "One") || !strings.Contains(ansi.Strip(row), "Two") {
		t.Fatalf("tab row did not render labels: %q", ansi.Strip(row))
	}
	if len(hits) != 2 {
		t.Fatalf("tab hits = %d, want 2", len(hits))
	}
	if hits[0].id != "tab:one" || hits[0].col != 0 || hits[0].width != lipgloss.Width("One")+2 {
		t.Fatalf("unexpected first tab hit: %+v", hits[0])
	}
	if hits[1].id != "tab:two" || hits[1].col != hits[0].width || hits[1].width != lipgloss.Width("Two")+2 {
		t.Fatalf("unexpected second tab hit: %+v after %+v", hits[1], hits[0])
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
	railScroll := -1
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
		scrollTo: func(_ *App, scroll int) tea.Cmd {
			railScroll = scroll
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
	railTarget, ok := findHitTargetForTest(a, "shared-scroll:rail:1")
	if !ok {
		t.Fatal("missing shared scroll rail target")
	}
	if _, handled := a.activateHitAt(railTarget.rect.x, railTarget.rect.y, tea.MouseLeft); !handled {
		t.Fatal("shared scroll rail target did not handle click")
	}
	if railScroll != 2 {
		t.Fatalf("rail click scroll = %d, want bottom offset 2", railScroll)
	}
	if _, ok := findHitTargetForTest(a, "button:scrollable:close"); !ok {
		t.Fatal("scrollable modal frame should register header buttons after wheel surface targets")
	}
	closeTarget, _ := findHitTargetForTest(a, "button:scrollable:close")
	if _, handled := a.activateHitAt(closeTarget.rect.x, closeTarget.rect.y, tea.MouseLeft); !handled || !closed {
		t.Fatalf("scrollable modal close button should remain clickable above surface target, handled=%v closed=%v", handled, closed)
	}
	if _, ok := findHitTargetForTest(a, "tab:scrollable-tab"); !ok {
		t.Fatal("scrollable modal frame should register tab targets after wheel surface targets")
	}
}

func TestSelectableListModalRegistersSemanticRailTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.beginHitFrame()
	railSelection := -1
	items := make([]modalListItem, 0, 8)
	for i := 0; i < 8; i++ {
		items = append(items, modalListItem{
			id:       "list:item:" + itoa2(i),
			title:    "Item " + itoa2(i),
			selected: i == 2,
			action:   func(*App) tea.Cmd { return nil },
		})
	}
	win := selectedItemWindow(len(items), 2, 4)
	visibleItems := items[win.start:win.end]
	list := a.renderModalList(visibleItems, modalListOptions{width: 48, rowBudget: 4})

	a.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width: 60,
			title: "List",
		},
		rows:      list.rows,
		list:      list,
		listStart: 0,
		listWidth: 48,
		bodyRows:  4,
		window:    win,
		wheelID:   "selectable:list:wheel",
		railAction: func(_ *App, index int) tea.Cmd {
			railSelection = index
			return nil
		},
	})

	target, ok := findHitTargetForTest(a, "selectable:list:wheel:rail:3")
	if !ok {
		t.Fatal("missing selectable list rail target")
	}
	if _, handled := a.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled {
		t.Fatal("selectable list rail target did not handle click")
	}
	if railSelection != 7 {
		t.Fatalf("rail selection = %d, want final item index 7", railSelection)
	}
}

func TestSelectableListModalRoutesRowsThroughSharedListRegionWithoutWheel(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.beginHitFrame()
	clicked := false
	list := modalListRender{
		rows: []string{"  Alpha"},
		hits: []modalListHit{{
			id:     "list:item:alpha",
			row:    0,
			height: 1,
			action: func(*App) tea.Cmd {
				clicked = true
				return nil
			},
		}},
	}

	a.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width: 60,
			title: "List",
		},
		rows:      list.rows,
		list:      list,
		listStart: 0,
		listWidth: 48,
		bodyRows:  1,
	})

	target, ok := findHitTargetForTest(a, "list:item:alpha")
	if !ok {
		t.Fatal("missing selectable list row target")
	}
	if _, ok := findHitTargetForTest(a, "selectable:list:wheel"); ok {
		t.Fatal("selectable list without wheel id should not register a wheel target")
	}
	if _, handled := a.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("row target should handle click through shared list region, handled=%v clicked=%v", handled, clicked)
	}
}

func TestModalIndexRailHitsMapVisibleRowsToIndexes(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.beginHitFrame()
	selected := -1
	modal := a.renderDefaultModalSurface(40, strings.Join([]string{
		"one",
		"two",
		"three",
		"four",
	}, "\n"))

	a.registerModalIndexRailHits(modal, "index-rail", 0, 6, 4, 10, func(_ *App, index int) tea.Cmd {
		selected = index
		return nil
	})

	target, ok := findHitTargetForTest(a, "index-rail:rail:3")
	if !ok {
		t.Fatal("missing modal index rail target")
	}
	if _, handled := a.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled {
		t.Fatal("modal index rail target did not handle click")
	}
	if selected != 9 {
		t.Fatalf("selected index = %d, want final index 9", selected)
	}
}

func TestModalIndexedListRailHitsMapRowsToIndexes(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.beginHitFrame()
	selected := -1
	modal := a.renderDefaultModalSurface(40, strings.Join([]string{
		"one",
		"two",
		"three",
		"four",
	}, "\n"))

	a.registerModalIndexedListRailHits(modal, "indexed-rail", 0, 6, 4, []int{2, 4, 8, 16, 32}, func(_ *App, index int) tea.Cmd {
		selected = index
		return nil
	})

	target, ok := findHitTargetForTest(a, "indexed-rail:rail:3")
	if !ok {
		t.Fatal("missing indexed modal rail target")
	}
	if _, handled := a.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled {
		t.Fatal("indexed modal rail target did not handle click")
	}
	if selected != 32 {
		t.Fatalf("selected index = %d, want final item value 32", selected)
	}
}

func TestWindowedModalListHitsClipToVisibleScrollWindow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.beginHitFrame()
	clicked := ""
	modal := a.renderDefaultModalSurface(48, strings.Join([]string{
		"row 0",
		"row 1",
		"row 2",
		"row 3",
		"row 4",
	}, "\n"))
	rendered := scrollableModalFrameRender{
		modalFrameRender: modalFrameRender{modal: modal, bodyRow: 1},
		window:           scrollWindow{start: 2, end: 5, scroll: 2, total: 6},
	}
	list := modalListRender{hits: []modalListHit{{
		id:     "list:above",
		row:    0,
		height: 1,
		action: func(*App) tea.Cmd {
			clicked = "above"
			return nil
		},
	}, {
		id:     "list:spanning",
		row:    1,
		height: 3,
		action: func(*App) tea.Cmd {
			clicked = "spanning"
			return nil
		},
	}, {
		id:     "list:visible",
		row:    4,
		height: 1,
		action: func(*App) tea.Cmd {
			clicked = "visible"
			return nil
		},
	}}}

	a.registerWindowedModalListHits(rendered, 0, 20, list)
	if _, ok := findHitTargetForTest(a, "list:above"); ok {
		t.Fatal("offscreen list hit should not register")
	}
	spanning, ok := findHitTargetForTest(a, "list:spanning")
	if !ok {
		t.Fatal("partially visible list hit should register")
	}
	if spanning.rect.h != 2 {
		t.Fatalf("spanning hit height = %d, want clipped height 2", spanning.rect.h)
	}
	visible, ok := findHitTargetForTest(a, "list:visible")
	if !ok {
		t.Fatal("fully visible list hit should register")
	}
	if visible.rect.y <= spanning.rect.y {
		t.Fatalf("visible hit should be below spanning hit: spanning=%+v visible=%+v", spanning.rect, visible.rect)
	}
	if _, handled := a.activateHitAt(spanning.rect.x, spanning.rect.y, tea.MouseLeft); !handled || clicked != "spanning" {
		t.Fatalf("spanning hit activation handled=%v clicked=%q", handled, clicked)
	}
}

func TestClipModalListToWindowKeepsRowsAndHitsAligned(t *testing.T) {
	list := modalListRender{
		rows: []string{"row 0", "row 1", "row 2", "row 3"},
		hits: []modalListHit{{
			id:     "row:one",
			row:    1,
			height: 2,
			action: func(*App) tea.Cmd { return nil },
		}, {
			id:     "row:three",
			row:    3,
			height: 1,
			action: func(*App) tea.Cmd { return nil },
		}},
		renderedItems: 2,
	}

	clipped := clipModalListToWindow(list, scrollWindow{start: 2, end: 4, scroll: 2, total: 4})

	if got := strings.Join(clipped.rows, "|"); got != "row 2|row 3" {
		t.Fatalf("clipped rows = %q, want visible rows 2 and 3", got)
	}
	if clipped.renderedItems != 2 {
		t.Fatalf("renderedItems = %d, want preserved 2", clipped.renderedItems)
	}
	if len(clipped.hits) != 2 {
		t.Fatalf("clipped hits = %d, want 2", len(clipped.hits))
	}
	if clipped.hits[0].id != "row:one" || clipped.hits[0].row != 0 || clipped.hits[0].height != 1 {
		t.Fatalf("partially visible hit not clipped into window coordinates: %+v", clipped.hits[0])
	}
	if clipped.hits[1].id != "row:three" || clipped.hits[1].row != 1 || clipped.hits[1].height != 1 {
		t.Fatalf("visible hit not shifted into window coordinates: %+v", clipped.hits[1])
	}
}

func TestOffsetModalListHitsPreserveActionsAndHeights(t *testing.T) {
	called := false
	action := func(*App) tea.Cmd {
		called = true
		return nil
	}
	hits := offsetModalListHits(modalListRender{hits: []modalListHit{{
		id:     "row:a",
		row:    2,
		height: 3,
		action: action,
	}}}, 5)

	if len(hits) != 1 {
		t.Fatalf("offset hits = %d, want 1", len(hits))
	}
	if hits[0].id != "row:a" || hits[0].row != 7 || hits[0].height != 3 {
		t.Fatalf("offset hit = %+v, want id row:a row 7 height 3", hits[0])
	}
	hits[0].action(nil)
	if !called {
		t.Fatal("offset hit should preserve original action")
	}
}

func TestWindowedIndexModalListBuildsVisibleRowsAroundCursor(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	indexes := []int{10, 20, 30, 40, 50}
	list, win := a.renderWindowedIndexModalList(
		indexes,
		3,
		3,
		6,
		modalListOptions{width: 24, rowBudget: 3},
		func(index int) modalListItem {
			return modalListItem{
				id:     "idx:" + itoa2(index),
				title:  "item " + itoa2(index),
				action: func(*App) tea.Cmd { return nil },
			}
		})

	if len(list.rows) != 3 {
		t.Fatalf("visible row count = %d, want 3", len(list.rows))
	}
	if len(list.hits) != 3 {
		t.Fatalf("hit count = %d, want 3", len(list.hits))
	}
	gotIDs := []string{list.hits[0].id, list.hits[1].id, list.hits[2].id}
	wantIDs := []string{"idx:30", "idx:40", "idx:50"}
	if strings.Join(gotIDs, ",") != strings.Join(wantIDs, ",") {
		t.Fatalf("hit ids = %#v, want %#v", gotIDs, wantIDs)
	}
	if win.start != 2 || win.end != 5 || win.total != 5 {
		t.Fatalf("window = %+v, want start=2 end=5 total=5", win)
	}
	for i, hit := range list.hits {
		if hit.row != i || hit.height != 1 {
			t.Fatalf("hit %d row/height = %d/%d, want %d/1", i, hit.row, hit.height, i)
		}
	}
}

func TestHelpCommandsUseSharedListRowsAndStageCommandOnClick(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 40
	a.stage = StageReady
	a.helpOpen = true
	a.helpTab = helpTabIndex("Commands")
	a.focus = FocusBody

	_ = a.View()
	target, ok := findHitTargetForTest(a, "help:command:tools")
	if !ok {
		t.Fatal("missing Help Commands row hit target for /tools")
	}
	if target.rect.h != 1 {
		t.Fatalf("help command row target height = %d, want dense one-line row", target.rect.h)
	}
	if target.rect.w >= modalScrollableBodyWidth(a.modalWidth()) {
		t.Fatalf("help command column target width = %d, want narrower than full body width %d", target.rect.w, modalScrollableBodyWidth(a.modalWidth()))
	}
	out := ansi.Strip(a.viewHelp())
	if !strings.Contains(out, "/tools") || !strings.Contains(out, "browse tool catalog") {
		t.Fatalf("help command row should render command and useful description inline:\n%s", out)
	}
	clearTarget, ok := findHitTargetForTest(a, "help:command:clear")
	if !ok {
		t.Fatal("missing first-column Help Commands hit target for /clear")
	}
	themeTarget, ok := findHitTargetForTest(a, "help:command:theme")
	if !ok {
		t.Fatal("missing second-column Help Commands hit target for /theme")
	}
	if themeTarget.rect.y != clearTarget.rect.y {
		t.Fatalf("second-column command target y = %d, want same row as first-column /clear at %d", themeTarget.rect.y, clearTarget.rect.y)
	}
	if themeTarget.rect.x <= clearTarget.rect.x {
		t.Fatalf("second-column command target x = %d, want to the right of first column at %d", themeTarget.rect.x, clearTarget.rect.x)
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
	if a.helpOpen {
		t.Fatal("clicking a Help command row should close Help")
	}
	if a.focus != FocusInput {
		t.Fatalf("focus = %v, want input after staging command", a.focus)
	}
	if got := a.input.Value(); got != "/tools" {
		t.Fatalf("input value = %q, want /tools", got)
	}
	if !strings.Contains(a.transientHint, "command staged: /tools") {
		t.Fatalf("hint = %q, want staged command confirmation", a.transientHint)
	}
}

func TestModalListColumnsPreserveColumnHitGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	list := a.renderModalList([]modalListItem{
		{id: "one", title: "one", meta: "first", action: func(*App) tea.Cmd { return nil }},
		{id: "two", title: "two", meta: "second", action: func(*App) tea.Cmd { return nil }},
		{id: "three", title: "three", meta: "third", action: func(*App) tea.Cmd { return nil }},
		{id: "four", title: "four", meta: "fourth", action: func(*App) tea.Cmd { return nil }},
	}, modalListOptions{width: 80, columns: 2, minColumnWidth: 24})
	if len(list.rows) != 2 {
		t.Fatalf("column list rows = %d, want 2", len(list.rows))
	}
	if len(list.hits) != 4 {
		t.Fatalf("column list hits = %d, want 4", len(list.hits))
	}
	if list.hits[0].id != "one" || list.hits[1].id != "three" {
		t.Fatalf("column-major first row hit ids = %q/%q, want one/three", list.hits[0].id, list.hits[1].id)
	}
	if list.hits[0].row != list.hits[1].row {
		t.Fatalf("first-row column hits should share row, got %d and %d", list.hits[0].row, list.hits[1].row)
	}
	if list.hits[1].col <= list.hits[0].col || list.hits[1].width != list.hits[0].width {
		t.Fatalf("second column hit geometry = %+v, first = %+v", list.hits[1], list.hits[0])
	}
	clipped := clipModalListToWindow(list, scrollWindow{start: 0, end: 1, total: len(list.rows)})
	if len(clipped.hits) != 2 {
		t.Fatalf("clipped first row hits = %d, want both columns", len(clipped.hits))
	}
	if clipped.hits[1].col != list.hits[1].col || clipped.hits[1].width != list.hits[1].width {
		t.Fatalf("clipped column geometry = %+v, want col/width from %+v", clipped.hits[1], list.hits[1])
	}
}

func TestHelpGlobalRowsUseSharedModalListRendering(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 40
	a.stage = StageReady
	a.helpOpen = true
	a.helpTab = 0

	out := ansi.Strip(a.viewHelp())
	if !strings.Contains(out, "Ctrl+N  create a new session") || !strings.Contains(out, "Ctrl+S  open model") {
		t.Fatalf("global help rows should render key and description through shared list rows:\n%s", out)
	}
	if strings.Contains(out, "▌ Ctrl+N") {
		t.Fatalf("non-command help rows should not render selected-list markers:\n%s", out)
	}
}

func TestScrollableModalRowHitsClipToVisibleWindow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.beginHitFrame()
	clicked := false
	rendered := a.renderModalFrameWithLayout(modalFrameOptions{
		width: 40,
		title: "Rows",
		body: strings.Join([]string{
			"row 0",
			"row 1",
			"row 2",
			"row 3",
		}, "\n"),
	})

	a.registerScrollableModalRowHits(rendered, scrollWindow{start: 2, end: 4, total: 4}, []modalRowHit{{
		id:     "rows:middle",
		start:  1,
		height: 3,
		action: func(*App) tea.Cmd {
			clicked = true
			return nil
		},
	}})

	target, ok := findHitTargetForTest(a, "rows:middle")
	if !ok {
		t.Fatal("missing scrollable modal row target")
	}
	if target.rect.h != 2 {
		t.Fatalf("row target height = %d, want visible clipped height 2", target.rect.h)
	}
	if _, handled := a.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("clipped row target should handle click, handled=%v clicked=%v", handled, clicked)
	}
}

func TestScrollableModalRowDetailFooterInsertsBeforeRefreshAndClose(t *testing.T) {
	hits := []modalRowHit{{id: "row", start: 0, height: 1, action: func(*App) tea.Cmd { return nil }}}
	got := scrollableModalRowDetailFooter("Tab view  Up/Down scroll  r refresh  Esc close", hits)
	want := "Tab view  Up/Down scroll  click row details  r refresh  Esc close"
	if got != want {
		t.Fatalf("footer hint = %q, want %q", got, want)
	}
	if got := scrollableModalRowDetailFooter("Up/Down scroll  r refresh  Esc close", nil); got != "Up/Down scroll  r refresh  Esc close" {
		t.Fatalf("footer without row hits changed to %q", got)
	}
}

func TestModalKeyHintUsesStableSpacingAndSkipsEmptyParts(t *testing.T) {
	got := modalKeyHint(" Enter save ", "", "Esc cancel", "Left/Right move")
	want := "Enter save  Esc cancel  Left/Right move"
	if got != want {
		t.Fatalf("modalKeyHint = %q, want %q", got, want)
	}
}

func TestSettingsTUIStepperHitAreasSpanRenderedControl(t *testing.T) {
	row := renderSettingsTUIStepperRow(ThemeForMode(ModeDark), 80, false, "cost warn tokens", "100k", "")
	decCol, decWidth := row.decrementHit()
	incCol, incWidth := row.incrementHit()

	if decCol != row.controlStart {
		t.Fatalf("decrement hit starts at %d, want control start %d", decCol, row.controlStart)
	}
	if decWidth <= 3 {
		t.Fatalf("decrement hit width = %d, want wider than glyph-only", decWidth)
	}
	if incWidth <= 3 {
		t.Fatalf("increment hit width = %d, want wider than glyph-only", incWidth)
	}
	if decCol+decWidth != incCol {
		t.Fatalf("stepper hit halves should be contiguous, dec end=%d inc start=%d", decCol+decWidth, incCol)
	}
	if incCol+incWidth != row.controlEnd {
		t.Fatalf("increment hit ends at %d, want control end %d", incCol+incWidth, row.controlEnd)
	}
}

func TestSplitStepperControlHitSplitsRenderedControl(t *testing.T) {
	decCol, decWidth := splitStepperControlHit(10, 20, false)
	incCol, incWidth := splitStepperControlHit(10, 20, true)
	if decCol != 10 || decWidth != 5 {
		t.Fatalf("decrement half = col %d width %d, want col 10 width 5", decCol, decWidth)
	}
	if incCol != 15 || incWidth != 5 {
		t.Fatalf("increment half = col %d width %d, want col 15 width 5", incCol, incWidth)
	}
}

func TestModalStepperControlHitsUseSharedGeometry(t *testing.T) {
	hits := modalStepperControlHits("stepper", 3, 4, 40, 10, 20,
		func(*App) tea.Cmd { return nil },
		func(*App) tea.Cmd { return nil },
		func(*App) tea.Cmd { return nil },
	)
	if len(hits) != 3 {
		t.Fatalf("stepper hits = %d, want 3", len(hits))
	}
	if hits[0].id != "stepper" || hits[0].row != 3 || hits[0].col != 4 || hits[0].width != 40 {
		t.Fatalf("unexpected row hit: %+v", hits[0])
	}
	if hits[1].id != "stepper:dec" || hits[1].row != 3 || hits[1].col != 14 || hits[1].width != 5 {
		t.Fatalf("unexpected decrement hit: %+v", hits[1])
	}
	if hits[2].id != "stepper:inc" || hits[2].row != 3 || hits[2].col != 19 || hits[2].width != 5 {
		t.Fatalf("unexpected increment hit: %+v", hits[2])
	}
}

func TestScreenTextareaCursorHitsUseTextGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.beginHitFrame()
	gotLine := -1
	gotCol := -1

	a.registerScreenTextareaCursorHits("screen-text", 5, 7, "ab\ncd", func(_ *App, line int, col int) {
		gotLine = line
		gotCol = col
	})

	target, ok := findHitTargetForTest(a, "screen-text:cursor:1:2")
	if !ok {
		t.Fatal("missing screen textarea cursor target")
	}
	if target.rect.x != 7 || target.rect.y != 8 {
		t.Fatalf("cursor target rect = %+v, want x=7 y=8", target.rect)
	}
	if _, handled := a.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled {
		t.Fatal("screen textarea cursor target did not handle click")
	}
	if gotLine != 1 || gotCol != 2 {
		t.Fatalf("cursor action got line=%d col=%d, want 1,2", gotLine, gotCol)
	}
}

func TestScreenTextareaRegionRegistersCursorHits(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.beginHitFrame()
	gotLine := -1
	gotCol := -1

	a.registerScreenTextareaRegion("input", 5, 7, "ab\ncd", func(_ *App, line int, col int) {
		gotLine = line
		gotCol = col
	})

	target, ok := findHitTargetForTest(a, "input:cursor:1:2")
	if !ok {
		t.Fatal("missing screen textarea region cursor target")
	}
	if target.rect.x != 7 || target.rect.y != 8 {
		t.Fatalf("cursor target rect = %+v, want x=7 y=8", target.rect)
	}
	if _, handled := a.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled {
		t.Fatal("screen textarea region cursor target did not handle click")
	}
	if gotLine != 1 || gotCol != 2 {
		t.Fatalf("cursor action got line=%d col=%d, want 1,2", gotLine, gotCol)
	}
}

func TestModalTextareaRegionRegistersCursorAndWheelHits(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.beginHitFrame()
	gotLine := -1
	gotCol := -1
	wheeled := false

	modal := a.renderDefaultModalSurface(50, "alpha\nbravo")
	a.registerModalTextareaRegion(modal, 2, 3, 20, 4, "compose", "ab\ncd", func(_ *App, line int, col int) {
		gotLine = line
		gotCol = col
	}, func(*App, tea.MouseButton) tea.Cmd {
		wheeled = true
		return nil
	})

	cursorTarget, ok := findHitTargetForTest(a, "textarea:compose:cursor:1:2")
	if !ok {
		t.Fatal("missing modal textarea cursor target")
	}
	if _, handled := a.activateHitAt(cursorTarget.rect.x, cursorTarget.rect.y, tea.MouseLeft); !handled {
		t.Fatal("modal textarea cursor target did not handle click")
	}
	if gotLine != 1 || gotCol != 2 {
		t.Fatalf("cursor action got line=%d col=%d, want 1,2", gotLine, gotCol)
	}
	wheelTarget, ok := findHitTargetForTest(a, "textarea:compose:wheel")
	if !ok {
		t.Fatal("missing modal textarea wheel target")
	}
	if wheelTarget.rect.w != 20 || wheelTarget.rect.h != 4 {
		t.Fatalf("wheel rect = %+v, want width=20 height=4", wheelTarget.rect)
	}
	if _, handled := a.activateWheelHitAt(wheelTarget.rect.x, wheelTarget.rect.y, tea.MouseWheelDown); !handled || !wheeled {
		t.Fatalf("modal textarea wheel target not handled, handled=%v wheeled=%v", handled, wheeled)
	}
}

func TestScreenTextSpanHitUsesTextGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.beginHitFrame()
	clicked := false

	a.registerScreenTextSpanHit("span:placeholder", 4, 6, "xx[paste]", 2, "[paste]", func(*App) tea.Cmd {
		clicked = true
		return nil
	})

	target, ok := findHitTargetForTest(a, "span:placeholder")
	if !ok {
		t.Fatal("missing screen text span target")
	}
	if target.rect.x != 6 || target.rect.y != 6 || target.rect.w != len("[paste]") {
		t.Fatalf("span target rect = %+v, want x=6 y=6 w=%d", target.rect, len("[paste]"))
	}
	if _, handled := a.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("screen text span target should handle click, handled=%v clicked=%v", handled, clicked)
	}
}

func TestClippedScreenTextSpanHitUsesVisibleTextGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.beginHitFrame()
	clicked := false

	a.registerClippedScreenTextSpanHit("span:clip", 10, 4, "....workspace", 4, "workspace", 17, func(*App) tea.Cmd {
		clicked = true
		return nil
	})

	target, ok := findHitTargetForTest(a, "span:clip")
	if !ok {
		t.Fatal("missing clipped screen text span target")
	}
	want := mouseRect{x: 14, y: 4, w: 3, h: 1}
	if target.rect != want {
		t.Fatalf("clipped span target rect = %+v, want %+v", target.rect, want)
	}
	if _, handled := a.activateHitAt(16, 4, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("clipped screen text span should handle visible click, handled=%v clicked=%v", handled, clicked)
	}
}

func TestScreenSurfaceHitUsesViewportGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 90
	a.height = 28
	a.beginHitFrame()
	clicked := false

	a.registerScreenSurfaceHit("surface:all", func(*App) tea.Cmd {
		clicked = true
		return nil
	})

	target, ok := findHitTargetForTest(a, "surface:all")
	if !ok {
		t.Fatal("missing screen surface target")
	}
	want := mouseRect{x: 0, y: 0, w: 90, h: 28}
	if target.rect != want {
		t.Fatalf("surface rect = %+v, want %+v", target.rect, want)
	}
	if _, handled := a.activateHitAt(89, 27, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("screen surface should handle viewport edge click, handled=%v clicked=%v", handled, clicked)
	}
}

func TestFocusSurfaceHitSetsFocusAndRunsHook(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.focus = FocusInput
	a.beginHitFrame()
	hooked := false

	a.registerFocusSurfaceHit("focus:body", mouseRect{x: 3, y: 4, w: 20, h: 5}, FocusBody, func(*App) {
		hooked = true
	})

	if _, handled := a.activateHitAt(10, 6, tea.MouseLeft); !handled {
		t.Fatal("focus surface should handle click inside rect")
	}
	if a.focus != FocusBody {
		t.Fatalf("focus = %v, want body", a.focus)
	}
	if !hooked {
		t.Fatal("focus surface should run after hook")
	}
}

func TestBasePaneFocusSurfaceRectsUseSharedGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36

	if got, want := a.sidebarFocusSurfaceRect(30, 32), (mouseRect{x: 0, y: 1, w: 28, h: 32}); got != want {
		t.Fatalf("sidebar focus rect = %+v, want %+v", got, want)
	}
	if got, want := a.conversationFocusSurfaceRect(28, 88), (mouseRect{x: 30, y: 1, w: 86, h: 28}); got != want {
		t.Fatalf("conversation focus rect = %+v, want %+v", got, want)
	}
	if got, want := a.inputFocusSurfaceRect(28, 1, 3, 88), (mouseRect{x: 30, y: 29, w: 86, h: 4}); got != want {
		t.Fatalf("input focus rect = %+v, want %+v", got, want)
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

func TestDoctorHealthRowsOpenSharedDetail(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 36
	a.stage = StageReady
	a.doctorOpen = true
	a.doctor = &doctorState{
		tab: doctorTabHealth,
		health: gact.HealthResponse{
			Healthy:       true,
			UptimeS:       125,
			OverallStatus: "degraded",
			Integrations: []gact.Integration{{
				Name:   "lm",
				Status: "ready",
				Detail: "argonne/gpt-oss-120b configured",
			}},
		},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "doctor:integration:lm")
	if !ok {
		t.Fatal("missing semantic doctor integration row target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("doctor integration detail click should not dispatch a command")
	}
	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("doctor integration row click should open shared detail view")
	}
	for _, want := range []string{"Integration", "name: lm", "status: ready", "argonne/gpt-oss-120b", "Backend", "overall_status: degraded"} {
		if !strings.Contains(a.detailView.fullText, want) {
			t.Fatalf("doctor integration detail missing %q:\n%s", want, a.detailView.fullText)
		}
	}
}

func TestDoctorCapabilityRowsOpenSharedDetail(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 36
	a.stage = StageReady
	a.doctorOpen = true
	a.doctor = &doctorState{
		tab: doctorTabCapabilities,
		caps: gact.Capabilities{
			ContractVersion: "0.2",
			Backend:         gact.BackendInfo{Name: "clio", Version: "dev", Vendor: "iowarp"},
			Capabilities: gact.CapabilityFlags{
				Workspaces: true,
			},
		},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "doctor:capability:workspaces")
	if !ok {
		t.Fatal("missing semantic doctor capability row target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("doctor capability detail click should not dispatch a command")
	}
	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("doctor capability row click should open shared detail view")
	}
	for _, want := range []string{"Capability", "name: workspaces", "status: supported", "bucket: v0.1 core", "Backend", "contract_version: 0.2", "name: clio"} {
		if !strings.Contains(a.detailView.fullText, want) {
			t.Fatalf("doctor capability detail missing %q:\n%s", want, a.detailView.fullText)
		}
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
	paneTarget, ok := findHitTargetForTest(a, "footer:pane")
	if !ok {
		t.Fatal("missing visible footer pane hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      paneTarget.rect.x,
		Y:      paneTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("footer pane click should not dispatch a command")
	}
	if a.focus != FocusSidebar {
		t.Fatalf("footer pane click should cycle focus to sidebar, got %v", a.focus)
	}

	a.focus = FocusInput
	_ = a.View()
	focusTarget, ok := findHitTargetForTest(a, "footer:focus")
	if !ok {
		t.Fatal("missing visible footer focus hit target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      focusTarget.rect.x,
		Y:      focusTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("footer focus click should not dispatch a command")
	}
	if a.focus != FocusSidebar {
		t.Fatalf("footer focus click should cycle focus to sidebar, got %v", a.focus)
	}

	a.focus = FocusInput
	_ = a.View()
	settingsTarget, ok := findHitTargetForTest(a, "footer:settings")
	if !ok {
		t.Fatal("missing visible footer settings hit target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
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

	a.settingsOpen = false
	a.settings = nil
	_ = a.View()
	quitTarget, ok := findLastHitTargetWithPrefixForTest(a, "header:quit")
	if !ok {
		t.Fatal("missing visible header quit hit target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      quitTarget.rect.x,
		Y:      quitTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("header quit click should not immediately dispatch a command")
	}
	if !a.quitConfirmOpen || a.quitConfirmSelected != 0 {
		t.Fatalf("header quit click should open quit confirmation, open=%v selected=%d", a.quitConfirmOpen, a.quitConfirmSelected)
	}
}

func TestHeaderActionsUseDiscoverableLabels(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 30

	header := ansi.Strip(a.renderHeader())

	for _, want := range []string{"x", "help", "settings"} {
		if !strings.Contains(header, want) {
			t.Fatalf("header action %q should be visible in top chrome: %q", want, header)
		}
	}
}

func TestHeaderActionsAlignToTerminalRightEdge(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 150
	a.height = 36
	a.MouseEnabled = true
	a.SetSidebarLayout([]string{"sessions"}, []string{"files"})

	view := a.View()
	quitTarget, ok := findLastHitTargetWithPrefixForTest(a, "header:quit")
	if !ok {
		t.Fatal("missing visible header quit hit target")
	}
	lines := strings.Split(ansi.Strip(view.Content), "\n")
	if len(lines) < 2 {
		t.Fatalf("rendered view is missing main row: %q", view.Content)
	}
	headerW := lipgloss.Width(lines[0])
	if headerW != a.width {
		t.Fatalf("header width = %d, want terminal width %d\nheader=%q", headerW, a.width, lines[0])
	}
	visibleRowEdge := lipgloss.Width(strings.TrimRight(lines[1], " "))
	if got := quitTarget.rect.x + quitTarget.rect.w; got != a.width {
		t.Fatalf("quit action right edge = %d, want terminal edge %d", got, a.width)
	} else if got < visibleRowEdge {
		t.Fatalf("quit action right edge = %d should not sit left of pane edge %d", got, visibleRowEdge)
	}
}

func TestHeaderChipsUseVisibleSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 220
	a.height = 30
	a.stage = StageReady
	a.focus = FocusInput
	a.BackendLabel = "local backend"
	a.workspaces = []gact.Workspace{
		{ID: "ws_a", Name: "alpha"},
		{ID: "ws_b", Name: "bravo"},
	}
	a.wsID = "ws_b"
	a.sessions = []gact.Session{{
		ID:           "sess_1",
		Title:        "demo header target",
		Status:       gact.StatusRunning,
		MessageCount: 0,
		Model:        gact.ModelRef{ProviderID: "openai", ModelID: "gpt-4.1"},
		Agent:        gact.AgentRef{ID: "analysis", Mode: "subagent"},
		RoutingMode:  "auto",
	}}
	a.selected = 0
	a.currentStatus = gact.StatusRunning
	a.caps.Capabilities.IntegrationHealth = true

	_ = a.View()
	if header := ansi.Strip(a.renderHeader()); !strings.Contains(header, "workspace: bravo") {
		t.Fatalf("header should label the current workspace, got %q", header)
	}
	for _, id := range []string{
		"header:chip:backend",
		"header:chip:workspace",
		"header:chip:session",
		"header:chip:model",
		"header:chip:agent",
		"header:chip:routing",
		"header:chip:status",
	} {
		target, ok := findHitTargetForTest(a, id)
		if !ok {
			t.Fatalf("missing semantic header chip target %q", id)
		}
		if target.rect.y != 0 {
			t.Fatalf("%s target y=%d, want top chrome row", id, target.rect.y)
		}
	}

	backendTarget, _ := findHitTargetForTest(a, "header:chip:backend")
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      backendTarget.rect.x,
		Y:      backendTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if !a.metricsOpen || a.metrics == nil || !a.metrics.loading {
		t.Fatalf("backend header click should open metrics, open=%v metrics=%+v", a.metricsOpen, a.metrics)
	}
	if cmd == nil {
		t.Fatal("backend header click should dispatch metrics load command")
	}

	a.metricsOpen = false
	a.metrics = nil
	_ = a.View()
	workspaceTarget, _ := findHitTargetForTest(a, "header:chip:workspace")
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      workspaceTarget.rect.x,
		Y:      workspaceTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("workspace header click should not dispatch a command")
	}
	if !a.workspaceSwitchOpen || a.workspaceSwitchSel != 1 {
		t.Fatalf("workspace header click should open switcher on current workspace, open=%v sel=%d", a.workspaceSwitchOpen, a.workspaceSwitchSel)
	}

	a.workspaceSwitchOpen = false
	_ = a.View()
	sessionTarget, _ := findHitTargetForTest(a, "header:chip:session")
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      sessionTarget.rect.x,
		Y:      sessionTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("session header click should not dispatch a command")
	}
	if a.focus != FocusSidebar || a.sidebarSectionFocus != sidebarSectionSessions || a.sidebarSectionCursor {
		t.Fatalf("session header click should focus selected session, focus=%v section=%v cursor=%v", a.focus, a.sidebarSectionFocus, a.sidebarSectionCursor)
	}

	a.focus = FocusInput
	_ = a.View()
	modelTarget, _ := findHitTargetForTest(a, "header:chip:model")
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      modelTarget.rect.x,
		Y:      modelTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if !a.settingsOpen || a.settings == nil || a.settings.tab != 0 {
		t.Fatalf("model header click should open model settings, open=%v settings=%+v", a.settingsOpen, a.settings)
	}
	if cmd == nil {
		t.Fatal("model header click should dispatch settings load command")
	}

	a.settingsOpen = false
	a.settings = nil
	_ = a.View()
	agentTarget, _ := findHitTargetForTest(a, "header:chip:agent")
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      agentTarget.rect.x,
		Y:      agentTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if !a.settingsOpen || a.settings == nil || a.settings.tab != 1 {
		t.Fatalf("agent header click should open agent settings, open=%v settings=%+v", a.settingsOpen, a.settings)
	}
	if cmd == nil {
		t.Fatal("agent header click should dispatch settings load command")
	}

	a.settingsOpen = false
	a.settings = nil
	_ = a.View()
	routingTarget, _ := findHitTargetForTest(a, "header:chip:routing")
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      routingTarget.rect.x,
		Y:      routingTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if !a.settingsOpen || a.settings == nil || a.settings.tab != 0 {
		t.Fatalf("routing header click should open model settings, open=%v settings=%+v", a.settingsOpen, a.settings)
	}
	if cmd == nil {
		t.Fatal("routing header click should dispatch settings load command")
	}

	a.settingsOpen = false
	a.settings = nil
	_ = a.View()
	statusTarget, _ := findHitTargetForTest(a, "header:chip:status")
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      statusTarget.rect.x,
		Y:      statusTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if !a.doctorOpen || a.doctor == nil || !a.doctor.loading {
		t.Fatalf("status header click should open doctor when supported, open=%v doctor=%+v", a.doctorOpen, a.doctor)
	}
	if cmd == nil {
		t.Fatal("status header click should dispatch doctor fetch command")
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
	if target.rect.h != 1 {
		t.Fatalf("TUI row target height = %d, want dense one-line row", target.rect.h)
	}
	out := ansi.Strip(a.viewSettings())
	if !strings.Contains(out, "cost danger tokens") || !strings.Contains(out, "150K") {
		t.Fatalf("TUI row should render label and value inline:\n%s", out)
	}
	if strings.Contains(out, "footer turns red near") {
		t.Fatalf("unselected TUI rows should keep descriptions out of the dense list:\n%s", out)
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

func TestSettingsTUISelectedRowUsesDetailSpace(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3, tuiRow: 0}

	_ = a.View()
	out := ansi.Strip(a.viewSettings())
	if !strings.Contains(out, "tool_result bodies longer than N lines collapse to a preview") {
		t.Fatalf("selected TUI row should render its full explanation in the body:\n%s", out)
	}
	if strings.Contains(out, "tool_result bodies longer than N lines collapse ...") {
		t.Fatalf("selected TUI row explanation should not be clipped with an ellipsis:\n%s", out)
	}
	target, ok := findHitTargetForTest(a, "settings:tui:collapse-threshold")
	if !ok {
		t.Fatal("missing selected TUI row semantic target")
	}
	if target.rect.h < 2 {
		t.Fatalf("selected TUI row target height = %d, want detail row included", target.rect.h)
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

func TestSettingsTUIStepperArrowsWorkBeyondFirstRow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 40
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3, tuiRow: 0}
	a.Theme.CostWarnTokens = 50_000
	a.Theme.CostDangerTokens = 100_000
	a.Theme.PasteCompressThreshold = 3
	a.MouseEnabled = true

	for _, tc := range []struct {
		id     string
		assert func(*testing.T, *App)
	}{
		{id: "cost-warn", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.CostWarnTokens != 50_000+costStep {
				t.Fatalf("cost warn right arrow = %d, want %d", app.Theme.CostWarnTokens, 50_000+costStep)
			}
		}},
		{id: "cost-danger", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.CostDangerTokens != 100_000+costStep {
				t.Fatalf("cost danger right arrow = %d, want %d", app.Theme.CostDangerTokens, 100_000+costStep)
			}
		}},
		{id: "paste-compress", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.PasteCompressThreshold != 4 {
				t.Fatalf("paste compress right arrow = %d, want 4", app.Theme.PasteCompressThreshold)
			}
		}},
	} {
		_ = a.View()
		target, ok := findHitTargetForTest(a, "settings:tui:"+tc.id+":inc")
		if !ok {
			t.Fatalf("missing right-arrow target for %s", tc.id)
		}
		model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
			X:      target.rect.x + target.rect.w/2,
			Y:      target.rect.y,
			Button: tea.MouseLeft,
		}))
		a = model.(*App)
		tc.assert(t, a)
		if !a.settingsOpen {
			t.Fatalf("%s right-arrow click closed settings", tc.id)
		}
	}
}

func TestSettingsTUIStepperLeftHitAreasWorkBeyondFirstRow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 40
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3, tuiRow: 0}
	a.Theme.CostWarnTokens = 50_000
	a.Theme.CostDangerTokens = 100_000
	a.Theme.PasteCompressThreshold = 3
	a.MouseEnabled = true

	for _, tc := range []struct {
		id     string
		assert func(*testing.T, *App)
	}{
		{id: "cost-warn", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.CostWarnTokens != 50_000-costStep {
				t.Fatalf("cost warn left hit = %d, want %d", app.Theme.CostWarnTokens, 50_000-costStep)
			}
		}},
		{id: "cost-danger", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.CostDangerTokens != 100_000-costStep {
				t.Fatalf("cost danger left hit = %d, want %d", app.Theme.CostDangerTokens, 100_000-costStep)
			}
		}},
		{id: "paste-compress", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.PasteCompressThreshold != 2 {
				t.Fatalf("paste compress left hit = %d, want 2", app.Theme.PasteCompressThreshold)
			}
		}},
	} {
		_ = a.View()
		target, ok := findHitTargetForTest(a, "settings:tui:"+tc.id+":dec")
		if !ok {
			t.Fatalf("missing left-arrow target for %s", tc.id)
		}
		model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
			X:      target.rect.x + target.rect.w/2,
			Y:      target.rect.y,
			Button: tea.MouseLeft,
		}))
		a = model.(*App)
		tc.assert(t, a)
		if !a.settingsOpen {
			t.Fatalf("%s left-hit click closed settings", tc.id)
		}
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
			X:      inc.rect.x + inc.rect.w/2,
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

func TestSettingsTUILayoutEditorMouseOpensModal(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 140
	a.height = 42
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3, tuiRow: 6}
	a.MouseEnabled = true

	_ = a.View()
	target, ok := findHitTargetForTest(a, "settings:tui:layout-editor:open")
	if !ok {
		t.Fatal("missing sidebar layout editor open target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x + target.rect.w/2,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if !a.sidebarLayoutOpen {
		t.Fatal("layout editor mouse target should open the sidebar layout modal")
	}
	if a.settings == nil || a.settings.tuiRow != 6 {
		t.Fatalf("layout editor click should keep TUI row selected, settings=%+v", a.settings)
	}
}

func TestSettingsTUIVisibleArrowGlyphsAreClickableForEveryRow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 42
	a.stage = StageReady
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3, tuiRow: 0}
	a.Theme.CostWarnTokens = 50_000
	a.Theme.CostDangerTokens = 100_000
	a.Theme.PasteCompressThreshold = 3
	a.MouseEnabled = true

	cases := []struct {
		label  string
		assert func(*testing.T, *App)
	}{
		{label: "cost warn tokens", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.CostWarnTokens != 50_000+costStep {
				t.Fatalf("cost warn visible right arrow = %d, want %d", app.Theme.CostWarnTokens, 50_000+costStep)
			}
		}},
		{label: "cost danger tokens", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.CostDangerTokens != 100_000+costStep {
				t.Fatalf("cost danger visible right arrow = %d, want %d", app.Theme.CostDangerTokens, 100_000+costStep)
			}
		}},
		{label: "paste compress", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.Theme.PasteCompressThreshold != 4 {
				t.Fatalf("paste visible right arrow = %d, want 4", app.Theme.PasteCompressThreshold)
			}
		}},
		{label: "intro splash skip", assert: func(t *testing.T, app *App) {
			t.Helper()
			if !app.IntroDisabled {
				t.Fatal("intro visible right arrow should toggle IntroDisabled on")
			}
		}},
		{label: "mouse controls", assert: func(t *testing.T, app *App) {
			t.Helper()
			if app.MouseEnabled {
				t.Fatal("mouse visible right arrow should toggle MouseEnabled off")
			}
		}},
	}

	for _, tc := range cases {
		a.MouseEnabled = true
		_ = a.View()
		view := a.viewSettings()
		x, y := visibleSettingsArrowGlyphForTest(t, view, a.width, a.height, tc.label, "▶")
		model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
			X:      x,
			Y:      y,
			Button: tea.MouseLeft,
		}))
		a = model.(*App)
		if !a.settingsOpen {
			t.Fatalf("%s visible right arrow closed settings", tc.label)
		}
		tc.assert(t, a)

		_ = a.View()
		view = a.viewSettings()
		x, y = visibleSettingsArrowGlyphForTest(t, view, a.width, a.height, tc.label, "◀")
		model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{
			X:      x,
			Y:      y,
			Button: tea.MouseLeft,
		}))
		a = model.(*App)
		if !a.settingsOpen {
			t.Fatalf("%s visible left arrow closed settings", tc.label)
		}
	}
}

func visibleSettingsArrowGlyphForTest(t *testing.T, view string, width int, height int, label string, glyph string) (int, int) {
	t.Helper()
	rect := overlayMouseRect(view, width, height)
	for lineIdx, raw := range strings.Split(view, "\n") {
		line := ansi.Strip(raw)
		if !strings.Contains(line, label) || !strings.Contains(line, glyph) {
			continue
		}
		glyphIdx := strings.Index(line, glyph)
		if glyphIdx < 0 {
			continue
		}
		return rect.x + lipgloss.Width(line[:glyphIdx]), rect.y + lineIdx
	}
	t.Fatalf("missing visible %q glyph for settings row %q:\n%s", glyph, label, ansi.Strip(view))
	return 0, 0
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

func TestSettingsAgentRailUsesSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 30
	a.stage = StageReady
	a.settingsOpen = true
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
	a.settings = &settingsState{tab: 1, agentSel: 0, agentList: agents}

	_ = a.View()
	target, ok := findLastHitTargetWithPrefixForTest(a, "settings:agent:list:rail:")
	if !ok {
		t.Fatal("missing semantic settings agent rail target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("agent rail click should not dispatch command")
	}
	if a.settings == nil || a.settings.agentSel != len(agents)-1 {
		t.Fatalf("agent rail click should jump selection near list end, settings=%+v", a.settings)
	}
	if !a.settingsOpen || a.detailViewOpen {
		t.Fatalf("agent rail click should keep settings open without opening detail, settingsOpen=%v detail=%v", a.settingsOpen, a.detailViewOpen)
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
	if target.rect.h != 1 {
		t.Fatalf("language target height = %d, want dense one-line row", target.rect.h)
	}
	out := ansi.Strip(a.viewSettings())
	if !strings.Contains(out, options[2].Locale) {
		t.Fatalf("language row should render locale inline:\n%s", out)
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

func TestMetricsCostRowsOpenSharedDetail(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 36
	a.stage = StageReady
	a.metricsOpen = true
	a.metrics = &metricsState{data: gact.Metrics{
		Cost: gact.MetricsCost{
			TotalUSD:   2.50,
			ByProvider: map[string]float64{"argonne": 1.25},
		},
	}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "metrics:cost:argonne")
	if !ok {
		t.Fatal("missing semantic metrics provider cost target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("metrics cost detail click should not dispatch a command")
	}
	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("metrics provider cost row should open shared detail")
	}
	for _, want := range []string{"Provider cost", "provider: argonne", "cost_usd: $1.2500", "share: 50.0%", "total_cost_usd: $2.5000"} {
		if !strings.Contains(a.detailView.fullText, want) {
			t.Fatalf("metrics provider detail missing %q:\n%s", want, a.detailView.fullText)
		}
	}
}

func TestMetricsLatencyRowsOpenSharedDetail(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 36
	a.stage = StageReady
	a.metricsOpen = true
	a.metrics = &metricsState{data: gact.Metrics{
		Latencies: map[string]gact.MetricsLatencyStat{
			"GET /v1/sessions": {Count: 7, P50Ms: 1.2, P95Ms: 5.6, MaxMs: 9.1},
		},
	}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "metrics:latency:GET /v1/sessions")
	if !ok {
		t.Fatal("missing semantic metrics latency route target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("metrics latency detail click should not dispatch a command")
	}
	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("metrics latency row should open shared detail")
	}
	for _, want := range []string{"Route latency", "route: GET /v1/sessions", "count: 7", "p50_ms: 1.2", "p95_ms: 5.6", "max_ms: 9.1"} {
		if !strings.Contains(a.detailView.fullText, want) {
			t.Fatalf("metrics latency detail missing %q:\n%s", want, a.detailView.fullText)
		}
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

func TestCatalogShortListsUseCompactSharedBodyHeight(t *testing.T) {
	short := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	short.width = 150
	short.height = 44
	short.stage = StageReady
	short.catalogBrowserOpen = true
	short.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{
			{id: "one", title: "One", desc: "first tool"},
			{id: "two", title: "Two", desc: "second tool"},
		},
	}
	shortRect := overlayMouseRect(short.viewCatalogBrowser(), short.width, short.height)
	if shortRect.y != 3 {
		t.Fatalf("short catalog top = %d, want shared top row 3", shortRect.y)
	}

	long := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	long.width = short.width
	long.height = short.height
	long.stage = StageReady
	long.catalogBrowserOpen = true
	long.catalogBrowser = &catalogBrowserState{kind: catalogKindTools, title: "Tools"}
	for i := 0; i < catalogBrowserBodyRows+4; i++ {
		long.catalogBrowser.items = append(long.catalogBrowser.items, catalogItem{
			id:    "tool-" + strconv.Itoa(i),
			title: "Tool " + strconv.Itoa(i),
			desc:  "tool metadata",
		})
	}
	longRect := overlayMouseRect(long.viewCatalogBrowser(), long.width, long.height)
	if shortRect.w != longRect.w {
		t.Fatalf("short catalog width = %d, long catalog width = %d; shared modal width should be stable", shortRect.w, longRect.w)
	}
	if shortRect.h >= longRect.h {
		t.Fatalf("short catalog height = %d, want less than overflowing long catalog height %d", shortRect.h, longRect.h)
	}
	if longRect.y != shortRect.y {
		t.Fatalf("long catalog top = %d, want same top as compact catalog %d", longRect.y, shortRect.y)
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

func TestAgentBlueprintCatalogMouseWheelWorksAcrossBody(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalogBrowserOpen = true
	items := make([]catalogItem, 0, 18)
	for i := 0; i < 18; i++ {
		items = append(items, catalogItem{
			id:    "blueprint-" + itoa2(i),
			title: "Blueprint " + itoa2(i),
			desc:  "workspace markdown agent blueprint",
		})
	}
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentBlueprints,
		title: "Agent Blueprints",
		items: items,
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "catalog:list:wheel:body:wheel")
	if !ok {
		t.Fatal("missing full-body blueprint catalog wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x + target.rect.w - 2,
		Y:      target.rect.y + target.rect.h - 1,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.catalogBrowser.sel != 1 {
		t.Fatalf("wheel over blueprint catalog body should move selection, got %d", a.catalogBrowser.sel)
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

func TestPaletteCommandRowsUseDenseInlineMetadata(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	for i := 0; i < 16; i++ {
		a.commands = append(a.commands, gact.Command{
			ID:          "/cmd" + strconv.Itoa(i),
			Description: "Run command " + strconv.Itoa(i),
			Source:      "builtin",
		})
	}
	a.paletteOpen = true

	out := ansi.Strip(a.viewPalette())
	if !strings.Contains(out, "/cmd15") {
		t.Fatalf("dense palette should show 16 command rows in the shared body budget:\n%s", out)
	}
	if !strings.Contains(out, "/cmd0  Run command 0") {
		t.Fatalf("palette command metadata should render on the title row:\n%s", out)
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

func TestLoadCommandsCmdUsesActiveSessionScope(t *testing.T) {
	var gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/commands" {
			http.NotFound(w, r)
			return
		}
		gotQuery = r.URL.RawQuery
		writeJSONForTest(t, w, map[string]any{"commands": []gact.Command{{
			ID: "/validate-dataset", Title: "Validate Dataset", CommandSource: "agent_blueprint", AgentBlueprintID: "qc-agent",
		}}})
	}))
	defer srv.Close()

	msg := loadCommandsCmd(client.New(srv.URL), client.RuntimeScope{WorkspaceID: "ws1", SessionID: "s1"})()
	loaded, ok := msg.(commandsLoadedMsg)
	if !ok {
		t.Fatalf("msg = %T, want commandsLoadedMsg", msg)
	}
	if loaded.err != nil {
		t.Fatalf("load commands err = %v", loaded.err)
	}
	if loaded.sessionID != "s1" || loaded.workspaceID != "ws1" {
		t.Fatalf("scope = %q/%q, want s1/ws1", loaded.sessionID, loaded.workspaceID)
	}
	if len(loaded.commands) != 1 || loaded.commands[0].AgentBlueprintID != "qc-agent" {
		t.Fatalf("commands = %#v", loaded.commands)
	}
	for _, want := range []string{"workspace_id=ws1", "session_id=s1"} {
		if !strings.Contains(gotQuery, want) {
			t.Fatalf("command query missing %q: %s", want, gotQuery)
		}
	}
}

func TestCommandsLoadedMsgIgnoresStaleSessionAndAppliesCurrent(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1", Title: "one"}, {ID: "s2", Title: "two"}}, nil)
	a.selected = 0
	a.wsID = "ws1"
	a.commands = []gact.Command{{ID: "/old", Title: "Old"}}

	_, _ = a.Update(commandsLoadedMsg{
		sessionID: "s2", workspaceID: "ws1",
		commands: []gact.Command{{ID: "/wrong", Title: "Wrong"}},
	})
	if len(a.commands) != 1 || a.commands[0].ID != "/old" {
		t.Fatalf("stale command response should not replace palette: %#v", a.commands)
	}

	_, _ = a.Update(commandsLoadedMsg{
		sessionID: "s1", workspaceID: "ws1",
		commands: []gact.Command{{ID: "/validate-dataset", Title: "Validate Dataset", CommandSource: "agent_blueprint"}},
	})
	if len(a.commands) != 1 || a.commands[0].ID != "/validate-dataset" {
		t.Fatalf("current command response not applied: %#v", a.commands)
	}
}

func TestPaletteFilterEditsAtCursor(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.stage = StageReady
	a.paletteOpen = true
	a.paletteFilter = "/tme"
	a.paletteCursor = 2
	a.paletteCursorSet = true
	a.paletteSel = 3
	a.searching = true
	a.searchMatches = []client.SearchMatch{{MessageID: "m1", Snippet: "stale"}}

	a.handlePaletteKey(textKeyMsg("he"))

	if a.paletteFilter != "/theme" {
		t.Fatalf("paletteFilter = %q, want /theme", a.paletteFilter)
	}
	if a.paletteCursor != len("/the") {
		t.Fatalf("paletteCursor = %d, want %d", a.paletteCursor, len("/the"))
	}
	if a.paletteSel != 0 || a.searching || len(a.searchMatches) != 0 {
		t.Fatalf("filter edit should reset selection/search state, sel=%d searching=%v matches=%d", a.paletteSel, a.searching, len(a.searchMatches))
	}
}

func TestPaletteFilterClickPlacesCursor(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.paletteOpen = true
	a.paletteFilter = "/theme"
	a.paletteCursor = len(a.paletteFilter)
	a.paletteCursorSet = true

	_ = a.View()
	target, ok := findHitTargetForTest(a, "text-entry:palette-filter:cursor:2")
	if !ok {
		t.Fatal("missing palette filter cursor target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("palette filter cursor click should not dispatch")
	}
	if a.paletteCursor != 2 {
		t.Fatalf("paletteCursor = %d, want 2", a.paletteCursor)
	}
	if !a.paletteOpen {
		t.Fatal("palette filter cursor click should keep palette open")
	}
}

func TestPaletteSearchQueryClickPlacesCursorAfterHiddenQuestionMark(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.paletteOpen = true
	a.paletteFilter = "?needle"
	a.paletteCursor = len(a.paletteFilter)
	a.paletteCursorSet = true

	_ = a.View()
	target, ok := findHitTargetForTest(a, "text-entry:palette-search-query:cursor:2")
	if !ok {
		t.Fatal("missing palette search query cursor target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("palette search query cursor click should not dispatch")
	}
	if a.paletteCursor != 3 {
		t.Fatalf("paletteCursor = %d, want 3 (cursor 2 after hidden ? prefix)", a.paletteCursor)
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

func TestConversationContentRectUsesSharedPaneGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36

	rect := a.conversationContentRect(2, 3, 20, 4, 80, true)
	sidebarW, _, _ := a.mainPaneGeometry()
	if rect.x != sidebarW+5 || rect.y != 7 || rect.w != 20 || rect.h != 4 {
		t.Fatalf("conversation content rect = %+v, want x=%d y=7 w=20 h=4", rect, sidebarW+5)
	}

	clamped := a.conversationContentRect(0, 100, 20, 0, 12, false)
	if clamped.x != sidebarW+9 || clamped.y != 4 || clamped.w != 1 || clamped.h != 1 {
		t.Fatalf("clamped conversation content rect = %+v, want x=%d y=4 w=1 h=1", clamped, sidebarW+9)
	}
}

func TestConversationPartRightClickOpensSemanticActionMenu(t *testing.T) {
	mu, copied, _ := withClipboardSpy(t)
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 160
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.selected = 0
	a.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "first"}}},
		{ID: "m2", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p2", Type: gact.PartTypeText, Text: "second block"}}},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:part:1:0")
	if !ok {
		t.Fatal("missing conversation hit target for assistant block")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseRight,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("right-clicking conversation block should not dispatch a command")
	}
	if !a.conversationActionsOpen || a.focus != FocusBody || a.bodySelMsgIdx != 1 || a.bodySelPartIdx != 0 {
		t.Fatalf("right-click should select block and open actions, open=%v focus=%v msg=%d part=%d", a.conversationActionsOpen, a.focus, a.bodySelMsgIdx, a.bodySelPartIdx)
	}

	_ = a.View()
	copyTarget, ok := findHitTargetForTest(a, "conversation-actions:copy-block")
	if !ok {
		t.Fatal("missing conversation copy-block action target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      copyTarget.rect.x,
		Y:      copyTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("copy-block action should not dispatch a backend command")
	}
	mu.Lock()
	gotCopy := *copied
	mu.Unlock()
	if gotCopy != "second block" {
		t.Fatalf("copy-block wrote %q", gotCopy)
	}
	if a.conversationActionsOpen || !strings.Contains(a.transientHint, "copied") {
		t.Fatalf("copy-block should close menu and surface hint, open=%v hint=%q", a.conversationActionsOpen, a.transientHint)
	}
}

func TestConversationActionMenuCopiesFullConversation(t *testing.T) {
	mu, copied, _ := withClipboardSpy(t)
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 160
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.selected = 0
	a.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "first prompt"}}},
		{ID: "m2", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p2", Type: gact.PartTypeText, Text: "second answer"}}},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:part:1:0")
	if !ok {
		t.Fatal("missing conversation hit target for assistant block")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseRight,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("right-clicking conversation block should not dispatch a command")
	}

	_ = a.View()
	copyTarget, ok := findHitTargetForTest(a, "conversation-actions:copy-conversation")
	if !ok {
		t.Fatal("missing conversation copy-conversation action target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      copyTarget.rect.x,
		Y:      copyTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("copy-conversation action should not dispatch a backend command")
	}
	mu.Lock()
	gotCopy := *copied
	mu.Unlock()
	want := "## user:\nfirst prompt\n\n## assistant:\nsecond answer"
	if gotCopy != want {
		t.Fatalf("copy-conversation wrote %q, want %q", gotCopy, want)
	}
	if a.conversationActionsOpen || !strings.Contains(a.transientHint, "copied full conversation") {
		t.Fatalf("copy-conversation should close menu and surface hint, open=%v hint=%q", a.conversationActionsOpen, a.transientHint)
	}
}

func TestConversationActionMenuRewindDispatchesSelectedMessage(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/sessions/s1/rewind" {
			http.NotFound(w, r)
			return
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode rewind request: %v", err)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"deleted_messages": []string{"m2"}})
	}))
	defer srv.Close()

	a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
	a.c = client.New(srv.URL)
	a.width = 120
	a.height = 32
	a.stage = StageReady
	a.focus = FocusBody
	a.sessions = []gact.Session{{ID: "s1", Title: "demo"}}
	a.selected = 0
	a.messages = []gact.Message{
		{ID: "m1", SessionID: "s1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "question"}}},
		{ID: "m2", SessionID: "s1", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p2", Type: gact.PartTypeText, Text: "answer"}}},
	}

	_ = a.openConversationActionsForPart(0, 0)
	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation-actions:rewind-to-message")
	if !ok {
		t.Fatal("missing semantic rewind action target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("rewind action should dispatch backend command")
	}
	msg := cmd()
	done, ok := msg.(sessionRewindDoneMsg)
	if !ok {
		t.Fatalf("cmd msg = %T, want sessionRewindDoneMsg", msg)
	}
	if done.err != nil || len(done.deleted) != 1 || done.deleted[0] != "m2" {
		t.Fatalf("rewind done = %#v", done)
	}
	if got["to_message_id"] != "m1" || got["include_target"] != false {
		t.Fatalf("rewind request = %#v", got)
	}
	if a.conversationActionsOpen {
		t.Fatal("rewind action should close the action menu")
	}
}

func TestSessionRewindDoneSuccessReloadsMessages(t *testing.T) {
	reloadedNewestFirst := []gact.Message{{
		ID:        "m1",
		SessionID: "s1",
		Role:      gact.RoleUser,
		Parts:     []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "checkpoint"}},
	}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/v1/sessions/s1/messages" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(client.ListMessagesResponse{Messages: reloadedNewestFirst})
	}))
	defer srv.Close()

	a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
	a.c = client.New(srv.URL)
	a.stage = StageReady
	a.sessions = []gact.Session{{ID: "s1", Title: "demo"}}
	a.selected = 0
	a.messages = []gact.Message{
		{ID: "m1", SessionID: "s1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "checkpoint"}}},
		{ID: "m2", SessionID: "s1", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p2", Type: gact.PartTypeText, Text: "deleted"}}},
	}

	model, cmd := a.Update(sessionRewindDoneMsg{sessionID: "s1", deleted: []string{"m2"}})
	a = model.(*App)
	if !strings.Contains(a.transientHint, "rewound 1 message(s)") {
		t.Fatalf("hint = %q, want rewind count", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("successful rewind should dispatch a reload batch")
	}
	msg := cmd()
	batch, ok := msg.(tea.BatchMsg)
	if !ok {
		t.Fatalf("cmd msg = %T, want tea.BatchMsg", msg)
	}
	var loaded messagesLoadedMsg
	for i := len(batch) - 1; i >= 0; i-- {
		c := batch[i]
		if c == nil {
			continue
		}
		if m, ok := c().(messagesLoadedMsg); ok {
			loaded = m
			break
		}
	}
	if loaded.sessionID != "s1" || len(loaded.messages) != 1 || loaded.messages[0].ID != "m1" {
		t.Fatalf("reload msg = %#v", loaded)
	}
	model, _ = a.Update(loaded)
	a = model.(*App)
	if len(a.messages) != 1 || a.messages[0].ID != "m1" {
		t.Fatalf("messages after reload = %#v", a.messages)
	}
}

func TestSessionRewindDoneFailureSurfacesErrorWithoutReload(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.stage = StageReady

	model, cmd := a.Update(sessionRewindDoneMsg{sessionID: "s1", err: errors.New("message not found")})
	a = model.(*App)
	if !strings.Contains(a.transientHint, "rewind failed: message not found") {
		t.Fatalf("hint = %q, want underlying rewind error", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("failure should still schedule hint expiry")
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

func TestConversationDetailCopyIncludesRawResult(t *testing.T) {
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
			ID:       "p1",
			Type:     gact.PartTypeToolResult,
			ToolName: "inspect_dataset",
			CallID:   "c1",
			Content: []gact.Part{{
				Type: gact.PartTypeText,
				Text: "summary line",
			}},
			Metadata: map[string]any{
				"raw_result": map[string]any{
					"rows": []string{"alpha", "beta"},
					"ok":   true,
				},
			},
		}},
	}}
	mu, copied, _ := withClipboardSpy(t)

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:detail:0:0")
	if !ok {
		t.Fatal("missing conversation detail hint hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("detail hint click should not dispatch a command")
	}
	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("detail hint click should open detail")
	}
	for _, want := range []string{"tool: inspect_dataset", "content: summary line", "raw_result:", "alpha", "beta"} {
		if !strings.Contains(a.detailView.fullText, want) {
			t.Fatalf("detail text missing %q:\n%s", want, a.detailView.fullText)
		}
	}

	_ = a.View()
	copyTarget, ok := findHitTargetForTest(a, "button:detail:copy")
	if !ok {
		t.Fatal("missing detail copy target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      copyTarget.rect.x,
		Y:      copyTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("detail copy click should not dispatch a command")
	}
	if !a.detailViewOpen {
		t.Fatal("detail copy should leave detail open")
	}
	mu.Lock()
	gotCopy := *copied
	mu.Unlock()
	for _, want := range []string{"tool: inspect_dataset", "content: summary line", "raw_result:", "\"rows\": [", "\"alpha\"", "\"beta\""} {
		if !strings.Contains(gotCopy, want) {
			t.Fatalf("copied detail missing %q:\n%s", want, gotCopy)
		}
	}
	if !strings.Contains(a.transientHint, "copied detail") {
		t.Fatalf("hint = %q, want copy confirmation", a.transientHint)
	}
}

func TestConversationDiffActionsUseSemanticHitTargets(t *testing.T) {
	var gotEndpoint string
	var gotPaths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotEndpoint = r.URL.Path
		var body struct {
			Paths []string `json:"paths"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode diff action body: %v", err)
		}
		gotPaths = body.Paths
		switch {
		case strings.HasSuffix(r.URL.Path, "/diffs/apply"):
			_, _ = w.Write([]byte(`{"applied":["src/main.go"]}`))
		case strings.HasSuffix(r.URL.Path, "/diffs/reject"):
			_, _ = w.Write([]byte(`{"rejected":["src/main.go"]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	newDiffApp := func() *App {
		before := "package main\nfunc main() {}\n"
		after := "package main\nfunc main() { println(\"hi\") }\n"
		a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
		a.width = 120
		a.height = 36
		a.stage = StageReady
		a.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
		a.selected = 0
		a.messages = []gact.Message{{
			ID:   "m1",
			Role: gact.RoleAssistant,
			Parts: []gact.Part{{
				ID:     "diff_1",
				Type:   gact.PartTypeFileDiff,
				Path:   "src/main.go",
				Before: &before,
				After:  &after,
			}},
		}}
		return a
	}

	a := newDiffApp()
	_ = a.View()
	applyTarget, ok := findHitTargetForTest(a, "conversation:diff:apply:src/main.go")
	if !ok {
		t.Fatal("missing semantic diff apply target")
	}
	if _, ok := findHitTargetForTest(a, "conversation:diff:reject:src/main.go"); !ok {
		t.Fatal("missing semantic diff reject target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      applyTarget.rect.x,
		Y:      applyTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("diff apply click should dispatch a command")
	}
	if a.focus != FocusBody || a.bodySelMsgIdx != 0 || a.bodySelPartIdx != 0 {
		t.Fatalf("diff apply click should focus selected diff, focus=%v msg=%d part=%d", a.focus, a.bodySelMsgIdx, a.bodySelPartIdx)
	}
	msg := cmd()
	if _, ok := msg.(diffsAppliedMsg); !ok {
		t.Fatalf("diff apply cmd returned %T, want diffsAppliedMsg", msg)
	}
	if gotEndpoint != "/v1/sessions/sess_1/diffs/apply" {
		t.Fatalf("apply endpoint = %q", gotEndpoint)
	}
	if len(gotPaths) != 1 || gotPaths[0] != "src/main.go" {
		t.Fatalf("apply paths = %#v, want src/main.go", gotPaths)
	}

	a = newDiffApp()
	_ = a.View()
	rejectTarget, ok := findHitTargetForTest(a, "conversation:diff:reject:src/main.go")
	if !ok {
		t.Fatal("missing semantic diff reject target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rejectTarget.rect.x,
		Y:      rejectTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("diff reject click should dispatch a command")
	}
	msg = cmd()
	if _, ok := msg.(diffsRejectedMsg); !ok {
		t.Fatalf("diff reject cmd returned %T, want diffsRejectedMsg", msg)
	}
	if gotEndpoint != "/v1/sessions/sess_1/diffs/reject" {
		t.Fatalf("reject endpoint = %q", gotEndpoint)
	}
	if len(gotPaths) != 1 || gotPaths[0] != "src/main.go" {
		t.Fatalf("reject paths = %#v, want src/main.go", gotPaths)
	}
}

func TestConversationFooterActionsUseSemanticHitTargets(t *testing.T) {
	mu, copied, _ := withClipboardSpy(t)
	var posted string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/sess_1/messages" {
			var body struct {
				Parts []gact.Part `json:"parts"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode retry body: %v", err)
			}
			if len(body.Parts) > 0 {
				posted = body.Parts[0].Text
			}
			_, _ = w.Write([]byte(`{"message_id":"msg_ack"}`))
			return
		}
		if r.Method == http.MethodDelete && r.URL.Path == "/v1/sessions/sess_1/messages/msg_assistant" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	newBodyApp := func() *App {
		a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
		a.width = 220
		a.height = 36
		a.stage = StageReady
		a.MouseEnabled = true
		a.focus = FocusBody
		a.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
		a.selected = 0
		a.messages = []gact.Message{
			{
				ID:        "msg_user",
				SessionID: "sess_1",
				Role:      gact.RoleUser,
				Parts:     []gact.Part{{ID: "user_text", Type: gact.PartTypeText, Text: "rerun this"}},
			},
			{
				ID:        "msg_assistant",
				SessionID: "sess_1",
				Role:      gact.RoleAssistant,
				Parts:     []gact.Part{{ID: "assistant_text", Type: gact.PartTypeText, Text: "copy this"}},
			},
		}
		a.bodySelMsgIdx = 1
		a.bodySelPartIdx = 0
		return a
	}

	a := newBodyApp()
	_ = a.View()
	copyTarget, ok := findHitTargetForTest(a, "footer:conversation:copy")
	if !ok {
		t.Fatal("missing semantic footer copy target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{X: copyTarget.rect.x, Y: copyTarget.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("footer copy should not dispatch a command")
	}
	mu.Lock()
	if *copied != "copy this" {
		t.Fatalf("footer copy clipboard = %q, want assistant text", *copied)
	}
	mu.Unlock()
	if !strings.Contains(a.transientHint, "copied") {
		t.Fatalf("copy hint = %q, want copied", a.transientHint)
	}

	a = newBodyApp()
	a.bodySelMsgIdx = 0
	_ = a.View()
	retryTarget, ok := findHitTargetForTest(a, "footer:conversation:retry")
	if !ok {
		t.Fatal("missing semantic footer retry target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{X: retryTarget.rect.x, Y: retryTarget.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("footer retry should dispatch postMessage command")
	}
	_ = cmd()
	if posted != "rerun this" {
		t.Fatalf("footer retry posted = %q, want selected user text", posted)
	}

	a = newBodyApp()
	_ = a.View()
	deleteTarget, ok := findHitTargetForTest(a, "footer:conversation:delete")
	if !ok {
		t.Fatal("missing semantic footer delete target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{X: deleteTarget.rect.x, Y: deleteTarget.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if len(a.messages) != 1 || a.messages[0].ID != "msg_user" {
		t.Fatalf("footer delete should remove selected message, remaining=%+v", a.messages)
	}
	if cmd == nil {
		t.Fatal("footer delete should dispatch delete command")
	}
}

func TestConversationFooterCopyUsesSelectedSemanticBlock(t *testing.T) {
	mu, copied, _ := withClipboardSpy(t)
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 220
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.focus = FocusBody
	a.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.selected = 0
	a.messages = []gact.Message{
		{
			ID:        "msg_assistant",
			SessionID: "sess_1",
			Role:      gact.RoleAssistant,
			Parts: []gact.Part{{
				ID:       "call_1",
				Type:     gact.PartTypeToolCall,
				CallID:   "call_read",
				ToolName: "ReadFile",
				Input:    map[string]any{"path": "main.go"},
			}},
		},
		{
			ID:        "msg_tool",
			SessionID: "sess_1",
			Role:      gact.RoleTool,
			Parts: []gact.Part{{
				ID:     "result_1",
				Type:   gact.PartTypeToolResult,
				CallID: "call_read",
				Content: []gact.Part{{
					Type: gact.PartTypeText,
					Text: "package main\n\nfunc main() {}",
				}},
			}},
		},
	}
	a.bodySelMsgIdx = 0
	a.bodySelPartIdx = 0

	_ = a.View()
	copyTarget, ok := findHitTargetForTest(a, "footer:conversation:copy")
	if !ok {
		t.Fatal("missing semantic footer copy target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      copyTarget.rect.x,
		Y:      copyTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("footer block copy should not dispatch a command")
	}
	mu.Lock()
	gotCopy := *copied
	mu.Unlock()
	if gotCopy != "package main\n\nfunc main() {}" {
		t.Fatalf("footer block copy clipboard = %q", gotCopy)
	}
	if !strings.Contains(a.transientHint, "copied") {
		t.Fatalf("copy hint = %q, want copied", a.transientHint)
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

func TestSidebarContentHitHelperUsesSharedRowGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.beginHitFrame()
	clicked := false

	a.registerSidebarContentHit("sidebar:test:row", 3, 24, 2, func(*App) tea.Cmd {
		clicked = true
		return nil
	})

	target, ok := findHitTargetForTest(a, "sidebar:test:row")
	if !ok {
		t.Fatal("missing sidebar content row target")
	}
	if target.rect.x != 2 || target.rect.y != 5 || target.rect.w != 20 || target.rect.h != 2 {
		t.Fatalf("sidebar content rect = %+v, want x=2 y=5 w=20 h=2", target.rect)
	}
	if _, handled := a.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("sidebar content row target should handle click, handled=%v clicked=%v", handled, clicked)
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

func TestSidebarCountsUseSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusBody
	a.wsID = "ws_default"
	archivedAt := time.Now()
	a.sessions = []gact.Session{
		{ID: "sess_1", Title: "first", Status: gact.StatusIdle},
		{ID: "sess_2", Title: "archived", Status: gact.StatusIdle, ArchivedAt: &archivedAt},
	}
	a.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:counts")
	if !ok {
		t.Fatal("missing semantic sidebar counts target")
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
	if !a.showArchived {
		t.Fatal("counts click should toggle archived view on")
	}
	if !strings.Contains(a.transientHint, "archived") {
		t.Fatalf("hint = %q, want archived toggle hint", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("counts click should dispatch archived-view reload when workspace is known")
	}
}

func TestSidebarFilterUsesSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 180
	a.height = 30
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sessions = []gact.Session{
		{ID: "sess_1", Title: "refactor auth", Status: gact.StatusIdle},
		{ID: "sess_2", Title: "release notes", Status: gact.StatusIdle},
	}
	a.selected = 0

	_ = a.View()
	footerTarget, ok := findHitTargetForTest(a, "footer:sidebar:filter")
	if !ok {
		t.Fatal("missing visible footer sidebar filter target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      footerTarget.rect.x,
		Y:      footerTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("footer filter click should not dispatch a command")
	}
	if a.focus != FocusSidebar || !a.sessionFilterActive {
		t.Fatalf("footer filter click should focus sidebar filter, focus=%v active=%v", a.focus, a.sessionFilterActive)
	}
	a.sessionFilter = "ndp"
	_ = a.View()
	applyTarget, ok := findHitTargetForTest(a, "footer:sidebar:filter:apply")
	if !ok {
		t.Fatal("missing visible footer sidebar filter apply target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      applyTarget.rect.x,
		Y:      applyTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("filter apply click should not dispatch a command")
	}
	if a.sessionFilterActive || a.sessionFilter != "ndp" {
		t.Fatalf("filter apply click should commit filter, active=%v filter=%q", a.sessionFilterActive, a.sessionFilter)
	}

	a.sessionFilter = "auth"
	a.sessionFilterActive = false
	a.filterSnapshot = ""
	_ = a.View()
	filterTarget, ok := findHitTargetForTest(a, "sidebar:filter")
	if !ok {
		t.Fatal("missing semantic sidebar filter row target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      filterTarget.rect.x,
		Y:      filterTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("filter row click should not dispatch a command")
	}
	if a.focus != FocusSidebar || !a.sessionFilterActive {
		t.Fatalf("filter row click should focus sidebar filter, focus=%v active=%v", a.focus, a.sessionFilterActive)
	}
	if a.filterSnapshot != "auth" || a.sessionFilter != "auth" {
		t.Fatalf("filter row click should preserve committed filter for Esc restore, filter=%q snapshot=%q", a.sessionFilter, a.filterSnapshot)
	}
	a.sessionFilter = "authX"
	_ = a.View()
	cancelTarget, ok := findHitTargetForTest(a, "footer:sidebar:filter:cancel")
	if !ok {
		t.Fatal("missing visible footer sidebar filter cancel target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      cancelTarget.rect.x,
		Y:      cancelTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("filter cancel click should not dispatch a command")
	}
	if a.sessionFilterActive || a.sessionFilter != "auth" {
		t.Fatalf("filter cancel click should restore snapshot, active=%v filter=%q", a.sessionFilterActive, a.sessionFilter)
	}
}

func TestSidebarFooterActionsUseSemanticHitTargets(t *testing.T) {
	newApp := func() *App {
		a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
		a.width = 260
		a.height = 34
		a.stage = StageReady
		a.focus = FocusSidebar
		a.wsID = "ws_default"
		a.sessions = []gact.Session{
			{ID: "sess_1", Title: "demo session", Status: gact.StatusIdle},
		}
		a.selected = 0
		return a
	}
	click := func(t *testing.T, a *App, id string) (*App, tea.Cmd) {
		t.Helper()
		_ = a.View()
		target, ok := findHitTargetForTest(a, id)
		if !ok {
			t.Fatalf("missing visible semantic target %q", id)
		}
		model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
			X:      target.rect.x,
			Y:      target.rect.y,
			Button: tea.MouseLeft,
		}))
		return model.(*App), cmd
	}

	a, cmd := click(t, newApp(), "footer:sidebar:rename")
	if cmd != nil {
		t.Fatal("rename footer click should not dispatch a command")
	}
	if !a.renameOpen || a.renameDraft != "demo session" {
		t.Fatalf("rename footer click should open rename prompt, open=%v draft=%q", a.renameOpen, a.renameDraft)
	}

	a, cmd = click(t, newApp(), "footer:sidebar:context")
	if cmd != nil {
		t.Fatal("add-context footer click should not dispatch a command")
	}
	if !a.contextAddOpen {
		t.Fatal("add-context footer click should open context prompt")
	}

	a, cmd = click(t, newApp(), "footer:sidebar:delete")
	if cmd != nil {
		t.Fatal("first delete footer click should only arm deletion")
	}
	if a.pendingDeleteSessionID != "sess_1" {
		t.Fatalf("delete footer click should arm selected session, got %q", a.pendingDeleteSessionID)
	}

	a, cmd = click(t, newApp(), "footer:sidebar:children")
	if cmd != nil {
		t.Fatal("children footer click should not dispatch a command")
	}
	if !a.showChildSessions {
		t.Fatal("children footer click should toggle child session visibility")
	}

	a, cmd = click(t, newApp(), "footer:sidebar:archive")
	if cmd == nil {
		t.Fatal("archive footer click should dispatch archive command")
	}

	mu, copied, _ := withClipboardSpy(t)
	a, cmd = click(t, newApp(), "footer:sidebar:copy-id")
	if cmd != nil {
		t.Fatal("copy-id footer click should not dispatch a command")
	}
	mu.Lock()
	gotCopy := *copied
	mu.Unlock()
	if gotCopy != "sess_1" {
		t.Fatalf("copy-id footer click wrote %q, want sess_1", gotCopy)
	}
}

func TestSidebarSessionRightClickOpensSemanticActionMenu(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 260
	a.height = 34
	a.stage = StageReady
	a.focus = FocusSidebar
	a.MouseEnabled = true
	a.wsID = "ws_default"
	a.sessions = []gact.Session{
		{ID: "sess_1", Title: "alpha", Status: gact.StatusIdle},
		{ID: "sess_2", Title: "beta", Status: gact.StatusIdle},
	}
	a.selected = 0

	_ = a.View()
	rowTarget, ok := findHitTargetForTest(a, "sidebar:session:sess_2")
	if !ok {
		t.Fatal("missing semantic sidebar session row target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rowTarget.rect.x,
		Y:      rowTarget.rect.y,
		Button: tea.MouseRight,
	}))
	a = model.(*App)
	if !a.sessionActionsOpen || a.selected != 1 {
		t.Fatalf("right-click should select row and open actions, open=%v selected=%d", a.sessionActionsOpen, a.selected)
	}
	if cmd == nil {
		t.Fatal("right-clicking a different session should dispatch selection load")
	}

	_ = a.View()
	renameTarget, ok := findHitTargetForTest(a, "session-actions:rename")
	if !ok {
		t.Fatal("missing semantic session action row target")
	}
	if renameTarget.rect.h != 1 {
		t.Fatalf("session action target height = %d, want dense one-line row", renameTarget.rect.h)
	}
	out := ansi.Strip(a.viewSessionActions())
	if !strings.Contains(out, "Rename session  [e]  Edit the visible title.") {
		t.Fatalf("session action menu should render descriptions inline:\n%s", out)
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      renameTarget.rect.x,
		Y:      renameTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("rename action should not dispatch a backend command")
	}
	if a.sessionActionsOpen || !a.renameOpen || a.renameDraft != "beta" {
		t.Fatalf("rename action should close menu and open rename, actionsOpen=%v renameOpen=%v draft=%q", a.sessionActionsOpen, a.renameOpen, a.renameDraft)
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

func TestInputCommandChipHitUsesRenderedTextGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.MouseEnabled = true
	a.focus = FocusBody
	a.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.selected = 0

	view := a.View()
	target, ok := findHitTargetForTest(a, "input:command")
	if !ok {
		t.Fatal("missing semantic input command hit target")
	}
	lines := strings.Split(ansi.Strip(view.Content), "\n")
	if target.rect.y < 0 || target.rect.y >= len(lines) {
		t.Fatalf("input command y=%d outside rendered screen with %d rows", target.rect.y, len(lines))
	}
	if got := renderedCellsForTest(lines[target.rect.y], target.rect.x, target.rect.w); got != a.inputCommandChipPlain() {
		t.Fatalf("input command hit covers %q, want rendered chip %q on line %q", got, a.inputCommandChipPlain(), lines[target.rect.y])
	}
}

func TestInputFocusSurfaceRectUsesMainPaneGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36

	rect := a.inputFocusSurfaceRect(28, 1, 3, 88)
	want := mouseRect{x: 30, y: 29, w: 86, h: 4}
	if rect != want {
		t.Fatalf("input focus rect = %+v, want %+v", rect, want)
	}
}

func TestInputPastePlaceholderUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 30
	a.stage = StageReady
	a.MouseEnabled = true
	a.focus = FocusInput
	a.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.selected = 0
	a.Theme.PasteCompressThreshold = 3

	model, cmd := a.Update(tea.PasteMsg{Content: "alpha\nbeta\ngamma"})
	a = model.(*App)
	if cmd != nil {
		t.Fatal("compressed paste should not dispatch a command")
	}
	if len(a.pastes) != 1 {
		t.Fatalf("pastes = %d, want 1", len(a.pastes))
	}
	if !strings.Contains(a.input.Value(), "[pasted content #1: 3 lines]") {
		t.Fatalf("input missing paste placeholder: %q", a.input.Value())
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "input:paste:0")
	if !ok {
		t.Fatal("missing semantic input paste placeholder target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("paste placeholder click should not dispatch a command")
	}
	if len(a.pastes) != 0 {
		t.Fatalf("pastes = %d, want expanded/cleared", len(a.pastes))
	}
	if got := a.input.Value(); got != "alpha\nbeta\ngamma " {
		t.Fatalf("expanded input = %q", got)
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
	for _, want := range []string{"markdown", "demo", "May 24"} {
		if !strings.Contains(sidebar, want) {
			t.Fatalf("selected context row should expose %q in its metadata line:\n%s", want, sidebar)
		}
	}
	if strings.Contains(sidebar, " R ") {
		t.Fatalf("context row should not use cryptic single-letter mode badges:\n%s", sidebar)
	}
	target, ok := findHitTargetForTest(a, "sidebar:context:file:docs/ARC_MEMORY_LAYER.md")
	if !ok {
		t.Fatal("missing context file hit target")
	}
	if target.rect.h != 2 {
		t.Fatalf("selected context file hit target height = %d, want 2", target.rect.h)
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y + 1,
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
		"status: workspace file attached to selected session as read",
		"source: workspace context file",
		"session_use: referenced by selected CLIO session context as read",
		"size: 2.0 KiB",
		"language: markdown",
		"added_at: 2026-05-25T10:00:00Z",
		"last_modified: 2026-05-24T18:30:00Z",
		"Session",
		"id: sess_1",
		"workspace: ws_default",
		"status: idle",
		"agent: analysis",
		"latest_activity: 2026-05-25T12:00:00Z",
		"messages: 7",
		"Actions",
		"Enter / click: open this context detail and load a content preview when CLIO exposes it",
	} {
		if !strings.Contains(a.detailView.fullText, want) {
			t.Fatalf("context detail missing %q:\n%s", want, a.detailView.fullText)
		}
	}
}

func TestContextRowsDistinguishUploadedAttachments(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sessions = []gact.Session{{
		ID:          "sess_1",
		WorkspaceID: "ws_default",
		Title:       "demo",
		Status:      gact.StatusIdle,
	}}
	a.selected = 0
	a.contextFiles = []gact.ContextFile{{
		Path:     ".clio/attachments/sess_1/report.txt",
		Mode:     "read",
		Size:     32,
		Language: "text",
		Uploaded: true,
	}}

	_ = a.View()
	sidebar := ansi.Strip(a.renderSidebar(54, 24))
	for _, want := range []string{"source: attachment", "demo"} {
		if !strings.Contains(sidebar, want) {
			t.Fatalf("uploaded context row should expose %q:\n%s", want, sidebar)
		}
	}
	target, ok := findHitTargetForTest(a, "sidebar:context:file:.clio/attachments/sess_1/report.txt")
	if !ok {
		t.Fatal("missing uploaded context file hit target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	for _, want := range []string{
		"status: CLIO uploaded attachment attached to selected session as read",
		"source: uploaded attachment (created through attachments_upload, not workspace browsing)",
		"session_use: copied into selected CLIO session context as read",
	} {
		if !strings.Contains(a.detailView.fullText, want) {
			t.Fatalf("uploaded context detail missing %q:\n%s", want, a.detailView.fullText)
		}
	}
}

func TestContextFileDetailLoadsCLIOContentPreview(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/v1/sessions/sess_1/context/files/content" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		if got := r.URL.Query().Get("path"); got != "docs/readme.md" {
			t.Fatalf("query path = %q", got)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"file": gact.ContextFileContent{
				Path:        "docs/readme.md",
				DisplayPath: "docs/readme.md",
				Size:        26,
				MediaType:   "text/markdown; charset=utf-8",
				Encoding:    "base64",
				Data:        base64.StdEncoding.EncodeToString([]byte("# Readme\n\nPreview body.\n")),
			},
		})
	}))
	defer srv.Close()

	a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.caps.Capabilities.XClioFilesContent = true
	a.sessions = []gact.Session{{ID: "sess_1", WorkspaceID: "ws_default", Title: "demo", Status: gact.StatusIdle}}
	a.selected = 0
	a.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read", Size: 26, Language: "markdown"}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:context:file:docs/readme.md")
	if !ok {
		t.Fatal("missing context file hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("context detail should dispatch content preview load")
	}
	if !strings.Contains(a.detailView.fullText, "preview: loading") {
		t.Fatalf("initial detail should show loading preview:\n%s", a.detailView.fullText)
	}

	model, _ = a.Update(cmd())
	a = model.(*App)
	for _, want := range []string{
		"Content",
		"media_type: text/markdown; charset=utf-8",
		"encoding: base64",
		"preview:",
		"# Readme",
		"Preview body.",
	} {
		if !strings.Contains(a.detailView.fullText, want) {
			t.Fatalf("enriched context detail missing %q:\n%s", want, a.detailView.fullText)
		}
	}
}

func TestContextFileDetailProbesContentWhenCapabilityMissing(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/v1/sessions/sess_1/context/files/content" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"file": gact.ContextFileContent{
				Path:      "notes/result.txt",
				Size:      19,
				MediaType: "text/plain; charset=utf-8",
				Encoding:  "base64",
				Data:      base64.StdEncoding.EncodeToString([]byte("preview from CLIO\n")),
			},
		})
	}))
	defer srv.Close()

	a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sessions = []gact.Session{{ID: "sess_1", WorkspaceID: "ws_default", Title: "demo", Status: gact.StatusIdle}}
	a.selected = 0
	a.contextFiles = []gact.ContextFile{{Path: "notes/result.txt", Mode: "read", Size: 19, Language: "text"}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:context:file:notes/result.txt")
	if !ok {
		t.Fatal("missing context file hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("context detail should probe content endpoint even when capability flag is absent")
	}
	if !strings.Contains(a.detailView.fullText, "x_clio_files_content not advertised; probing endpoint") {
		t.Fatalf("initial detail should explain endpoint probe:\n%s", a.detailView.fullText)
	}

	model, _ = a.Update(cmd())
	a = model.(*App)
	if strings.Contains(a.detailView.fullText, "unavailable") {
		t.Fatalf("successful probe should not leave unavailable text:\n%s", a.detailView.fullText)
	}
	for _, want := range []string{"media_type: text/plain; charset=utf-8", "preview from CLIO"} {
		if !strings.Contains(a.detailView.fullText, want) {
			t.Fatalf("probed context detail missing %q:\n%s", want, a.detailView.fullText)
		}
	}
}

func TestContextFileDetailProbeSurfacesBackendError(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.sessions = []gact.Session{{ID: "sess_1"}}
	a.selected = 0
	rows := a.contextFileDetailRowsWithContent(
		gact.ContextFile{Path: "missing.txt", Mode: "read"},
		gact.ContextFileContent{},
		errors.New("context file not found"),
	)
	out := strings.Join(rows, "\n")
	if !strings.Contains(out, "preview_error: context file not found") {
		t.Fatalf("context detail should surface backend error:\n%s", out)
	}
	if strings.Contains(out, "unavailable") {
		t.Fatalf("backend error should not be hidden behind unavailable text:\n%s", out)
	}
}

func TestContextFileDetailSummarizesBinaryContent(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.caps.Capabilities.XClioFilesContent = true
	rows := a.contextFileDetailRowsWithContent(
		gact.ContextFile{Path: "plots/waveform.png", Mode: "read"},
		gact.ContextFileContent{
			Path:      "plots/waveform.png",
			Size:      8,
			MediaType: "image/png",
			Encoding:  "base64",
			Data:      base64.StdEncoding.EncodeToString([]byte("\x89PNG\r\n\x1a\n")),
		},
		nil,
	)
	out := strings.Join(rows, "\n")
	if !strings.Contains(out, "binary content not rendered in terminal detail") {
		t.Fatalf("binary context detail should summarize content:\n%s", out)
	}
	if strings.Contains(out, "iVBOR") {
		t.Fatalf("binary context detail should not dump base64:\n%s", out)
	}
}

func TestContextFileDetailPreviewsCommonApplicationTextTypes(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.caps.Capabilities.XClioFilesContent = true
	for _, tc := range []struct {
		name      string
		mediaType string
		path      string
		body      string
	}{
		{name: "javascript", mediaType: "application/javascript", path: "scripts/run.js", body: "console.log('ok')\n"},
		{name: "shell", mediaType: "application/x-sh", path: "scripts/run.sh", body: "#!/bin/sh\necho ok\n"},
		{name: "python", mediaType: "application/x-python", path: "tools/run.py", body: "print('ok')\n"},
		{name: "vendor json", mediaType: "application/vnd.clio.context+json", path: "trace.json", body: "{\"ok\":true}\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rows := a.contextFileDetailRowsWithContent(
				gact.ContextFile{Path: tc.path, Mode: "read"},
				gact.ContextFileContent{
					Path:      tc.path,
					Size:      int64(len(tc.body)),
					MediaType: tc.mediaType,
					Encoding:  "base64",
					Data:      base64.StdEncoding.EncodeToString([]byte(tc.body)),
				},
				nil,
			)
			out := strings.Join(rows, "\n")
			if !strings.Contains(out, "preview:") {
				t.Fatalf("text application media type should render preview:\n%s", out)
			}
			for _, line := range strings.Split(strings.TrimSpace(tc.body), "\n") {
				if strings.TrimSpace(line) != "" && !strings.Contains(out, line) {
					t.Fatalf("text application media type preview missing %q:\n%s", line, out)
				}
			}
			if strings.Contains(out, "binary content not rendered") {
				t.Fatalf("text application media type should not be summarized as binary:\n%s", out)
			}
		})
	}
}

func TestContextRowRightClickOpensSemanticActionMenu(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 140
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.MouseEnabled = true
	a.sessions = []gact.Session{{ID: "sess_1", WorkspaceID: "ws_default", Title: "demo"}}
	a.selected = 0
	a.contextFiles = []gact.ContextFile{{
		Path:     "docs/ARC_MEMORY_LAYER.md",
		Mode:     "read",
		Size:     2048,
		Language: "markdown",
	}}

	_ = a.View()
	rowTarget, ok := findHitTargetForTest(a, "sidebar:context:file:docs/ARC_MEMORY_LAYER.md")
	if !ok {
		t.Fatal("missing semantic context file row target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rowTarget.rect.x,
		Y:      rowTarget.rect.y,
		Button: tea.MouseRight,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("context action menu open should not dispatch a command")
	}
	if !a.contextActionsOpen || a.contextFileSel != 0 || a.sidebarSectionFocus != sidebarSectionContext || a.sidebarSectionCursor {
		t.Fatalf("right-click should select context row and open actions, open=%v sel=%d section=%v cursor=%v", a.contextActionsOpen, a.contextFileSel, a.sidebarSectionFocus, a.sidebarSectionCursor)
	}

	mu, copied, _ := withClipboardSpy(t)
	_ = a.View()
	copyTarget, ok := findHitTargetForTest(a, "context-actions:copy-path")
	if !ok {
		t.Fatal("missing context copy-path action target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      copyTarget.rect.x,
		Y:      copyTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("copy-path action should not dispatch a backend command")
	}
	mu.Lock()
	gotCopy := *copied
	mu.Unlock()
	if gotCopy != "docs/ARC_MEMORY_LAYER.md" {
		t.Fatalf("copy-path wrote %q", gotCopy)
	}
	if a.contextActionsOpen || !strings.Contains(a.transientHint, "copied docs/ARC_MEMORY_LAYER.md") {
		t.Fatalf("copy-path should close menu and surface hint, open=%v hint=%q", a.contextActionsOpen, a.transientHint)
	}

	_ = a.openContextActionsForIndex(0)
	_ = a.View()
	copyDetailTarget, ok := findHitTargetForTest(a, "context-actions:copy-detail")
	if !ok {
		t.Fatal("missing context copy-detail action target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      copyDetailTarget.rect.x,
		Y:      copyDetailTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("copy-detail action should not dispatch a backend command")
	}
	mu.Lock()
	gotCopy = *copied
	mu.Unlock()
	for _, want := range []string{"path: docs/ARC_MEMORY_LAYER.md", "mode: read", "size: 2.0 KiB (2048 bytes)", "language: markdown"} {
		if !strings.Contains(gotCopy, want) {
			t.Fatalf("copy-detail missing %q:\n%s", want, gotCopy)
		}
	}
	if a.contextActionsOpen || !strings.Contains(a.transientHint, "copied context metadata") {
		t.Fatalf("copy-detail should close menu and surface hint, open=%v hint=%q", a.contextActionsOpen, a.transientHint)
	}

	_ = a.openContextActionsForIndex(0)
	_ = a.View()
	removeTarget, ok := findHitTargetForTest(a, "context-actions:remove")
	if !ok {
		t.Fatal("missing context remove action target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      removeTarget.rect.x,
		Y:      removeTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("remove action should dispatch backend command")
	}
	if a.contextActionsOpen {
		t.Fatal("remove action should close context action menu")
	}
}

func TestContextFileRemovedUpdatesVisibleContextRows(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.sessions = []gact.Session{{ID: "sess_1", Title: "demo"}}
	a.selected = 0
	a.contextFileSel = 1
	a.contextFiles = []gact.ContextFile{
		{Path: "docs/first.md", Mode: "read"},
		{Path: "docs/second.md", Mode: "read"},
	}
	a.detailViewOpen = true
	a.detailView = &bulkyPartRef{messageID: "context", partID: "docs/second.md", fullText: "stale"}

	model, cmd := a.Update(contextFileRemovedMsg{sessionID: "sess_1", path: "docs/second.md"})
	a = model.(*App)
	if cmd != nil {
		t.Fatal("context removal state update should not dispatch a command")
	}
	if len(a.contextFiles) != 1 || a.contextFiles[0].Path != "docs/first.md" {
		t.Fatalf("context files not updated: %#v", a.contextFiles)
	}
	if a.contextFileSel != 0 {
		t.Fatalf("contextFileSel = %d, want 0", a.contextFileSel)
	}
	if a.detailViewOpen || a.detailView != nil {
		t.Fatal("removing the detailed file should close stale detail view")
	}
	if !strings.Contains(a.transientHint, "removed docs/second.md") {
		t.Fatalf("hint = %q", a.transientHint)
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

func renderedCellsForTest(line string, x int, width int) string {
	if x < 0 || width < 1 {
		return ""
	}
	cells := []rune(line)
	if x >= len(cells) {
		return ""
	}
	end := x + width
	if end > len(cells) {
		end = len(cells)
	}
	return string(cells[x:end])
}

func findLastHitTargetWithPrefixForTest(a *App, prefix string) (uiHitTarget, bool) {
	if a.hits == nil {
		return uiHitTarget{}, false
	}
	var got uiHitTarget
	ok := false
	for _, target := range a.hits.targets {
		if strings.HasPrefix(target.id, prefix) {
			got = target
			ok = true
		}
	}
	return got, ok
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

func TestPermissionBannerActionRectUsesPaneContentGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36

	rect, ok := a.permissionBannerActionRect(permissionBannerAction{
		id:    "allow",
		col:   12,
		width: 7,
	}, 90)
	if !ok {
		t.Fatalf("expected visible permission action rect")
	}
	want := mouseRect{x: 45, y: 3, w: 7, h: 1}
	if rect != want {
		t.Fatalf("permission rect mismatch: got %+v want %+v", rect, want)
	}

	rect, ok = a.permissionBannerActionRect(permissionBannerAction{
		id:    "workspace",
		col:   84,
		width: 12,
	}, 90)
	if !ok {
		t.Fatalf("expected clipped permission action rect")
	}
	want = mouseRect{x: 117, y: 3, w: 2, h: 1}
	if rect != want {
		t.Fatalf("clipped permission rect mismatch: got %+v want %+v", rect, want)
	}

	if _, ok := a.permissionBannerActionRect(permissionBannerAction{
		id:    "hidden",
		col:   86,
		width: 5,
	}, 90); ok {
		t.Fatalf("expected hidden permission action outside content width")
	}
}

func TestPermissionBannerActionsStayInsideBodyWithRightSidebar(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 36
	a.stage = StageReady
	a.sessions = []gact.Session{{ID: "sess_perm", Title: "approval", Status: gact.StatusWaitingPermission}}
	a.selected = 0
	a.currentStatus = gact.StatusWaitingPermission
	a.messages = []gact.Message{{
		ID:        "msg_user",
		SessionID: "sess_perm",
		Role:      gact.RoleUser,
		Parts:     []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "remove scratch files"}},
	}}
	a.pendingPermissions = []client.PermissionWire{{
		PermissionRequest: gact.PermissionRequest{
			ID:        "perm_sidebar",
			SessionID: "sess_perm",
			Summary:   "Run shell command: rm -rf /tmp/scratch",
		},
		Status: "pending",
	}}
	a.rightSidebarModuleIDs = []sidebarModuleID{sidebarModuleFiles}
	a.fileTreeEntries = []fileTreeEntry{
		{Path: "src/main.go"},
		{Path: "visual_loop/report.md"},
	}

	_ = a.View()
	right, ok := findHitTargetForTest(a, "right-sidebar:focus")
	if !ok {
		t.Fatal("missing right sidebar focus hit target")
	}
	for _, id := range []string{"permission:allow", "permission:deny", "permission:session", "permission:workspace"} {
		target, ok := findHitTargetForTest(a, id)
		if !ok {
			t.Fatalf("missing semantic permission hit target %q", id)
		}
		if target.rect.x+target.rect.w > right.rect.x {
			t.Fatalf("%s rect overlaps right sidebar: permission=%+v right=%+v", id, target.rect, right.rect)
		}
		if target.rect.y != 3 {
			t.Fatalf("%s row = %d, want banner row 3", id, target.rect.y)
		}
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

func TestQuitConfirmOutsideClickUsesSharedClosePolicy(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.quitConfirmOpen = true
	a.quitConfirmSelected = 0

	_ = a.View()
	rect := overlayMouseRect(a.viewQuitConfirm(), a.width, a.height)
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + rect.w + 1,
		Y:      rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("outside quit-confirm click should dismiss without firing quit/detach")
	}
	if a.quitConfirmOpen {
		t.Fatal("outside quit-confirm click should close the modal")
	}
	if a.quitConfirmSelected != 0 {
		t.Fatalf("outside click should not choose a different option, got %d", a.quitConfirmSelected)
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

func TestMcpRemoveRowsUseDenseInlineMetadata(t *testing.T) {
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
	if target.rect.h != 1 {
		t.Fatalf("MCP remove target height = %d, want dense one-line row", target.rect.h)
	}
	out := ansi.Strip(a.viewMcpRemove())
	if !strings.Contains(out, "two  [http]  srv_two") {
		t.Fatalf("MCP remove row should render server id inline:\n%s", out)
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.mcpRemoveSel != 1 || !a.mcpRemoveSaving || cmd == nil {
		t.Fatalf("dense row click should remove row 1, sel=%d saving=%v cmd=%v", a.mcpRemoveSel, a.mcpRemoveSaving, cmd)
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

func TestMcpInstallExamplesUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpInstallOpen = true
	a.mcpInstallInput = "bad"
	a.mcpInstallCursor = len(a.mcpInstallInput)
	a.mcpInstallErr = "usage"

	_ = a.View()
	target, ok := findHitTargetForTest(a, "mcp-install:example:http")
	if !ok {
		t.Fatal("missing semantic MCP install http example target")
	}
	if target.rect.h != 1 {
		t.Fatalf("example target height = %d, want one list row", target.rect.h)
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x + target.rect.w - 1,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("example click should not dispatch a command")
	}
	want := "weather http https://mcp.example.com"
	if a.mcpInstallInput != want {
		t.Fatalf("example input = %q, want %q", a.mcpInstallInput, want)
	}
	if a.mcpInstallCursor != len([]rune(want)) {
		t.Fatalf("cursor = %d, want end %d", a.mcpInstallCursor, len([]rune(want)))
	}
	if a.mcpInstallErr != "" {
		t.Fatalf("example click should clear stale error, got %q", a.mcpInstallErr)
	}
}

func TestMcpInstallExampleRowsAndHitsShareOrdering(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	list := a.renderMcpInstallExampleList()
	if len(list.rows) != 2 {
		t.Fatalf("example rows = %d, want 2", len(list.rows))
	}
	if len(list.hits) != len(list.rows) {
		t.Fatalf("example hits = %d, want %d", len(list.hits), len(list.rows))
	}
	for i, hit := range list.hits {
		if hit.row != i || hit.height != 1 {
			t.Fatalf("hit %d geometry = row %d height %d, want row %d height 1", i, hit.row, hit.height, i)
		}
	}
	if list.hits[1].id != "mcp-install:example:http" || !strings.Contains(list.rows[1], "weather http") {
		t.Fatalf("second example row/hit mismatch: row=%q hit=%q", list.rows[1], list.hits[1].id)
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
