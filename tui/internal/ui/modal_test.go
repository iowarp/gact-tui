package ui

import (
	"strings"
	"testing"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestModalWidthsUseSingleSharedPolicy(t *testing.T) {
	a := New("http://unused")

	a.width = 180
	if got := a.modals.wideModalWidth(); got != a.modals.modalWidth() {
		t.Fatalf("wide modal width at 180 = %d, want shared width %d", got, a.modals.modalWidth())
	}
	a.width = 120
	if got := a.modals.detailModalWidth(); got != a.modals.modalWidth() {
		t.Fatalf("detail modal width at 120 = %d, want shared width %d", got, a.modals.modalWidth())
	}
	a.width = 92
	if got := a.modals.wideModalWidth(); got != a.modals.modalWidth() {
		t.Fatalf("wide modal should fall back to standard width on narrow screens, got %d want %d", got, a.modals.modalWidth())
	}
}

func TestModalInnerWidthMatchesSharedFramePadding(t *testing.T) {
	if got := modalInnerWidth(96); got != 92 {
		t.Fatalf("modal inner width = %d, want 92", got)
	}
	if got := modalInnerWidth(3); got != 1 {
		t.Fatalf("tiny modal inner width = %d, want clamped 1", got)
	}
}

func TestModalInsetListWidthMatchesSharedFramePadding(t *testing.T) {
	if got := modalInsetListWidth(96); got != 88 {
		t.Fatalf("modal inset list width = %d, want 88", got)
	}
	if got := modalInsetListWidth(7); got != 3 {
		t.Fatalf("tiny modal inset list width = %d, want inner width 3", got)
	}
}

func TestModalTextAreaWidthMatchesSharedFramePadding(t *testing.T) {
	if got := modalTextAreaWidth(96); got != modalInnerWidth(96) {
		t.Fatalf("modal textarea width = %d, want inner width %d", got, modalInnerWidth(96))
	}
	if got := modalTextAreaWidth(3); got != 1 {
		t.Fatalf("tiny modal textarea width = %d, want clamped 1", got)
	}
}

func TestModalScrollableWidthsMatchSharedFramePadding(t *testing.T) {
	if got := modalBodyContentWidth(96); got != 90 {
		t.Fatalf("modal body content width = %d, want 90", got)
	}
	if got := modalScrollableBodyWidth(96); got != 90 {
		t.Fatalf("modal scrollable body width = %d, want 90", got)
	}
	if got := modalScrollableContentWidth(96); got != 88 {
		t.Fatalf("modal scrollable content width = %d, want 88", got)
	}
	if got := modalScrollableBodyWidth(5); got != 1 {
		t.Fatalf("tiny modal scrollable body width = %d, want clamped 1", got)
	}
	if got := modalScrollableContentWidth(5); got != 1 {
		t.Fatalf("tiny modal scrollable content width = %d, want clamped 1", got)
	}
}

func TestModalCloseButtonGlyphIsCenteredInBox(t *testing.T) {
	a := New("http://unused")
	row, hits := a.modals.renderModalButtonsWithHits([]menuButton{closeMenuButton("test:close", func(app *App) {})}, -1)
	plain := strings.TrimRight(row, " ")
	if len(hits) != 1 {
		t.Fatalf("button hits = %d, want 1", len(hits))
	}
	if hits[0].width != 5 {
		t.Fatalf("close button width = %d, want 5", hits[0].width)
	}
	if got, want := strings.Index(ansi.Strip(plain), "x"), hits[0].width/2; got != want {
		t.Fatalf("close glyph column = %d, want centered at %d in %q", got, want, plain)
	}
}

func TestHeaderQuitGlyphIsCenteredInBox(t *testing.T) {
	a := New("http://unused")
	row := ansi.Strip(a.chrome.renderHeaderActionCell("x"))
	if got, want := lipgloss.Width(row), 5; got != want {
		t.Fatalf("header quit width = %d, want %d in %q", got, want, row)
	}
	if got, want := strings.Index(row, "x"), lipgloss.Width(row)/2; got != want {
		t.Fatalf("header quit glyph column = %d, want centered at %d in %q", got, want, row)
	}
}

func TestLMConfigUsesSharedModalBodyContentWidth(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	w := a.lmConfig.modalWidth()
	if got := maxInt(20, modalBodyContentWidth(w)); got != modalScrollableBodyWidth(w) {
		t.Fatalf("lm config content width = %d, want shared modal body width %d", got, modalScrollableBodyWidth(w))
	}
}

func TestOverlayTopIsStableAcrossModalHeights(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 40

	short := a.modals.renderModalFrame(modalFrameOptions{width: a.modals.modalWidth(), title: "Short", body: "one"})
	tall := a.modals.renderModalFrame(modalFrameOptions{width: a.modals.modalWidth(), title: "Tall", body: strings.Repeat("row\n", 12)})

	shortRect := overlayMouseRect(short, a.width, a.height)
	tallRect := overlayMouseRect(tall, a.width, a.height)
	if shortRect.x != tallRect.x {
		t.Fatalf("modal x positions differ: short=%d tall=%d", shortRect.x, tallRect.x)
	}
	if shortRect.y != tallRect.y {
		t.Fatalf("modal y positions differ: short=%d tall=%d", shortRect.y, tallRect.y)
	}
	if shortRect.y != 3 {
		t.Fatalf("modal top = %d, want fixed top row 3", shortRect.y)
	}
}

func TestProductionModalFamiliesShareOverlayOriginAndWidth(t *testing.T) {
	const (
		screenW = 150
		screenH = 44
	)
	newBase := func() *App {
		a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
		a.width = screenW
		a.height = screenH
		a.stage = StageReady
		return a
	}
	wantRect := func(a *App) mouseRect {
		return mouseRect{x: (screenW - a.modals.modalWidth()) / 2, y: 3, w: a.modals.modalWidth()}
	}

	cases := []struct {
		name string
		app  func() *App
		view func(*App) string
	}{
		{
			name: "settings",
			app: func() *App {
				a := newBase()
				a.settings.open = true
				a.settings.settingsState = settingsState{tab: 3}
				return a
			},
			view: func(a *App) string { return a.settings.view() },
		},
		{
			name: "help",
			app:  newBase,
			view: func(a *App) string {
				a.help.open = true
				return a.help.view()
			},
		},
		{
			name: "doctor",
			app: func() *App {
				a := newBase()
				a.doctor.open = true
				a.doctor.doctorState = doctorState{health: gact.HealthResponse{Healthy: true, OverallStatus: "ready"}}
				return a
			},
			view: func(a *App) string { return a.doctor.view() },
		},
		{
			name: "metrics",
			app: func() *App {
				a := newBase()
				a.metrics.open = true
				a.metrics.metricsState = metricsState{data: gact.Metrics{UptimeS: 12}}
				return a
			},
			view: func(a *App) string { return a.metrics.view() },
		},
		{
			name: "provider",
			app: func() *App {
				a := newLMConfigTestApp()
				a.width = screenW
				a.height = screenH
				return a
			},
			view: func(a *App) string { return a.lmConfig.view() },
		},
		{
			name: "catalog",
			app: func() *App {
				a := newBase()
				a.catalog.current = &catalogBrowserState{
					kind:  catalogKindTools,
					title: "Tools",
					items: []catalogItem{{id: "read", title: "ReadFile", desc: "read files"}},
				}
				return a
			},
			view: func(a *App) string { return a.catalog.view() },
		},
		{
			name: "detail",
			app: func() *App {
				a := newBase()
				a.detail.ref = &bulkyPartRef{title: "Detail", fullText: "one\ntwo"}
				a.detail.visible = true
				return a
			},
			view: func(a *App) string { return a.detail.view() },
		},
		{
			name: "quit",
			app: func() *App {
				a := newBase()
				a.quitConfirm.open = true
				return a
			},
			view: func(a *App) string { return a.quitConfirm.view() },
		},
		{
			name: "connection-error",
			app: func() *App {
				a := newBase()
				a.stage = StageError
				a.stageError = "connection refused"
				return a
			},
			view: func(a *App) string { return a.viewErrorModal() },
		},
		{
			name: "palette",
			app: func() *App {
				a := newBase()
				a.cmdPalette.paletteOpen = true
				return a
			},
			view: func(a *App) string { return a.cmdPalette.view() },
		},
		{
			name: "workspace",
			app: func() *App {
				a := newBase()
				a.workspace.switchOpen = true
				a.session.workspaces = []gact.Workspace{{ID: "default", Name: "default"}}
				return a
			},
			view: func(a *App) string { return a.workspace.view() },
		},
		{
			name: "mcp-install",
			app: func() *App {
				a := newBase()
				a.mcpInstall.open = true
				return a
			},
			view: func(a *App) string { return a.mcpInstall.view() },
		},
		{
			name: "mcp-remove",
			app: func() *App {
				a := newBase()
				a.mcpRemove.open = true
				a.mcpRemove.options = []gact.McpServer{{ID: "srv", Name: "server", Transport: "stdio"}}
				return a
			},
			view: func(a *App) string { return a.mcpRemove.view() },
		},
		{
			name: "rename",
			app: func() *App {
				a := newBase()
				a.rename.open = true
				a.rename.input.SetValue("demo")
				a.rename.input.SetCursor(len([]rune(a.rename.input.Value())))
				return a
			},
			view: func(a *App) string { return a.rename.view() },
		},
		{
			name: "context-add",
			app: func() *App {
				a := newBase()
				a.contextAdd.open = true
				a.contextAdd.input.SetValue("README.md")
				a.contextAdd.input.SetCursor(len([]rune(a.contextAdd.input.Value())))
				return a
			},
			view: func(a *App) string { return a.contextAdd.view() },
		},
		{
			name: "compose",
			app: func() *App {
				a := newBase()
				a.inputComposer.input.SetValue("hello")
				a.inputComposer.openCompose()
				return a
			},
			view: func(a *App) string { return a.inputComposer.viewCompose() },
		},
	}

	for _, tc := range cases {
		a := tc.app()
		view := tc.view(a)
		if view == "" {
			t.Fatalf("%s view is empty", tc.name)
		}
		rect := overlayMouseRect(view, a.width, a.height)
		want := wantRect(a)
		if tc.name == "help" {
			helpW := a.help.modalWidthForTab(helpTabs[a.help.tab].title)
			want = mouseRect{x: (screenW - helpW) / 2, y: 3, w: helpW}
		}
		if rect.x != want.x || rect.y != want.y || rect.w != want.w {
			t.Fatalf("%s overlay rect = %+v, want x=%d y=%d w=%d", tc.name, rect, want.x, want.y, want.w)
		}
	}
}

func TestLMConfigAndComposeUseSharedWidth(t *testing.T) {
	a := New("http://unused")
	a.width = 160
	a.height = 40

	if got := a.lmConfig.modalWidth(); got != a.modals.modalWidth() {
		t.Fatalf("lm config width = %d, want shared width %d", got, a.modals.modalWidth())
	}

	a.stage = StageReady
	a.inputComposer.input.SetValue("hello")
	a.inputComposer.openCompose()
	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:compose:commit")
	if !ok {
		t.Fatal("missing compose commit button hit target")
	}
	view := a.inputComposer.viewCompose()
	rect := overlayMouseRect(view, a.width, a.height)
	if rect.w != a.modals.modalWidth() {
		t.Fatalf("compose modal width = %d, want shared width %d", rect.w, a.modals.modalWidth())
	}
	if target.rect.y != rect.y+2 {
		t.Fatalf("compose commit button y = %d, want header row %d", target.rect.y, rect.y+2)
	}
}

func TestPadModalBodyKeepsShortTabbedViewsStable(t *testing.T) {
	got := padModalBody("one\ntwo", 4)
	if strings.Count(got, "\n")+1 != 4 {
		t.Fatalf("padded body rows = %d, want 4 in %q", strings.Count(got, "\n")+1, got)
	}
	if got := padModalBody("one\ntwo\nthree", 2); got != "one\ntwo\nthree" {
		t.Fatalf("pad should not truncate long bodies, got %q", got)
	}
}
