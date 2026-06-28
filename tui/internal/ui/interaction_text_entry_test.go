package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
)

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
				a.rename.open = true
				a.rename.input.SetValue("session title")
				a.rename.input.SetCursor(len(a.rename.input.Value()))
				return a.rename.view()
			},
			buttonID:  "button:rename:save",
			wantTitle: "Rename session",
		},
		{
			name: "context add",
			view: func() string {
				a.contextAdd.open = true
				a.contextAdd.input.SetValue("docs/readme.md")
				a.contextAdd.input.SetCursor(len(a.contextAdd.input.Value()))
				return a.contextAdd.view()
			},
			buttonID:  "button:context-add:save",
			wantTitle: "Add file to context",
		},
		{
			name: "mcp install",
			view: func() string {
				a.mcpInstall.open = true
				a.mcpInstall.input.SetValue("files stdio mcp-files /tmp")
				return a.mcpInstall.view()
			},
			buttonID:  "button:mcp-install:install",
			wantTitle: "Install MCP connection",
		},
		{
			name: "agent write",
			view: func() string {
				a.agentWrite.openModal(agentWriteModeCreate, "", "data-agent")
				return a.agentWrite.view()
			},
			buttonID:  "button:agent-write:save",
			wantTitle: "Create expert",
		},
		{
			name: "agent blueprint manage",
			view: func() string {
				a.agentBlueprintManage.openModal(agentBlueprintManageValidate)
				return a.agentBlueprintManage.view()
			},
			buttonID:  "button:agent-blueprint-manage:validate",
			wantTitle: "Validate agent blueprint",
		},
	}

	for _, tc := range cases {
		a.interaction.beginHitFrame()
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
	a.interaction.beginHitFrame()
	got := -1
	rendered := a.modals.renderTextEntryModal(textEntryModalOptions{
		width:       a.modals.modalWidth(),
		title:       "Entry",
		editor:      a.modals.renderCursorEditor("abcdef", 6),
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
	if _, handled := a.interaction.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled {
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
				a.rename.open = true
				a.rename.input.SetValue("old ")
				a.rename.input.SetCursor(len([]rune(a.rename.input.Value())))
			},
			assert: func(t *testing.T, a *App) {
				t.Helper()
				if a.rename.input.Value() != "old new title" || a.rename.input.Cursor() != len([]rune(a.rename.input.Value())) {
					t.Fatalf("rename paste draft=%q cursor=%d", a.rename.input.Value(), a.rename.input.Cursor())
				}
			},
			content: "new\r\ntitle",
		},
		{
			name: "context add",
			setup: func(a *App) {
				a.contextAdd.open = true
			},
			assert: func(t *testing.T, a *App) {
				t.Helper()
				if a.contextAdd.input.Value() != "docs/readme.md" || a.contextAdd.input.Cursor() != len([]rune(a.contextAdd.input.Value())) {
					t.Fatalf("context paste draft=%q cursor=%d", a.contextAdd.input.Value(), a.contextAdd.input.Cursor())
				}
			},
			content: "docs/\r\nreadme.md",
		},
		{
			name: "prompt edit",
			setup: func(a *App) {
				a.promptEdit.openModal("planner", "builtin", "Planner", "")
			},
			assert: func(t *testing.T, a *App) {
				t.Helper()
				if a.promptEdit.input.Value() != "use concise evidence" || a.promptEdit.input.Cursor() != len([]rune(a.promptEdit.input.Value())) {
					t.Fatalf("prompt paste draft=%q cursor=%d", a.promptEdit.input.Value(), a.promptEdit.input.Cursor())
				}
			},
			content: "use concise\r\nevidence",
		},
		{
			name: "mcp install",
			setup: func(a *App) {
				a.mcpInstall.openModal()
			},
			assert: func(t *testing.T, a *App) {
				t.Helper()
				if a.mcpInstall.input.Value() != "files stdio mcp-files /tmp" || a.mcpInstall.input.Cursor() != len([]rune(a.mcpInstall.input.Value())) {
					t.Fatalf("mcp install paste input=%q cursor=%d", a.mcpInstall.input.Value(), a.mcpInstall.input.Cursor())
				}
			},
			content: "files stdio\r\nmcp-files /tmp",
		},
		{
			name: "workspace create name",
			setup: func(a *App) {
				a.workspace.switchOpen = true
				a.workspace.create.open = true
				a.workspace.create.field = 0
			},
			assert: func(t *testing.T, a *App) {
				t.Helper()
				if a.workspace.create.name != "benchmark workspace" || a.workspace.create.nameCur != len([]rune(a.workspace.create.name)) {
					t.Fatalf("workspace name paste=%q cursor=%d", a.workspace.create.name, a.workspace.create.nameCur)
				}
			},
			content: "benchmark\r\nworkspace",
		},
		{
			name: "workspace create root",
			setup: func(a *App) {
				a.workspace.switchOpen = true
				a.workspace.create.open = true
				a.workspace.create.field = 1
			},
			assert: func(t *testing.T, a *App) {
				t.Helper()
				if a.workspace.create.root != "/tmp/benchmark root" || a.workspace.create.rootCur != len([]rune(a.workspace.create.root)) {
					t.Fatalf("workspace root paste=%q cursor=%d", a.workspace.create.root, a.workspace.create.rootCur)
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
	a.interaction.beginHitFrame()
	clicked := false
	rendered := a.modals.renderTextEntryModal(textEntryModalOptions{
		width:  a.modals.modalWidth(),
		title:  "Entry",
		editor: a.modals.renderCursorEditor("path", 4),
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
	if _, handled := a.interaction.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled || !clicked {
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
	a.interaction.beginHitFrame()
	rendered := a.modals.renderTextEntryModal(textEntryModalOptions{
		width:     a.modals.modalWidth(),
		title:     "Entry",
		surfaceID: "entry",
		editor:    a.modals.renderCursorEditor("path", 4),
	})

	target, ok := findHitTargetForTest(a, "entry:surface:wheel")
	if !ok {
		t.Fatal("missing shared text-entry surface wheel target")
	}
	rect := overlayMouseRect(rendered.modal, a.width, a.height)
	if target.rect != rect {
		t.Fatalf("surface wheel rect = %+v, want overlay rect %+v", target.rect, rect)
	}
	if _, handled := a.interaction.activateOverlayWheelHitAt(target.rect.x, target.rect.y, tea.MouseWheelDown); !handled {
		t.Fatal("text-entry surface wheel target should activate through overlay wheel dispatch")
	}
}

func TestTextEntryModalRegistersIntroListHits(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.interaction.beginHitFrame()
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
	rendered := a.modals.renderTextEntryModal(textEntryModalOptions{
		width:      a.modals.modalWidth(),
		title:      "Entry",
		intro:      []string{strings.Join(list.rows, "\n")},
		introList:  list,
		introListW: 40,
		editor:     a.modals.renderCursorEditor("path", 4),
	})

	target, ok := findHitTargetForTest(a, "entry:example:stdio")
	if !ok {
		t.Fatal("missing shared text-entry intro list target")
	}
	rect := overlayMouseRect(rendered.modal, a.width, a.height)
	if target.rect.y != rect.y+2+rendered.bodyRow {
		t.Fatalf("intro list target y = %d, want first body row %d", target.rect.y, rect.y+2+rendered.bodyRow)
	}
	if _, handled := a.interaction.activateHitAt(target.rect.x+target.rect.w-1, target.rect.y, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("intro list target activation handled=%v clicked=%v", handled, clicked)
	}
}
