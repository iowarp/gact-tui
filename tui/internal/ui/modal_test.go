package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestModalWidthsUseSingleSharedPolicy(t *testing.T) {
	a := New("http://unused")

	a.width = 180
	if got := a.wideModalWidth(); got != a.modalWidth() {
		t.Fatalf("wide modal width at 180 = %d, want shared width %d", got, a.modalWidth())
	}
	a.width = 120
	if got := a.detailModalWidth(); got != a.modalWidth() {
		t.Fatalf("detail modal width at 120 = %d, want shared width %d", got, a.modalWidth())
	}
	a.width = 92
	if got := a.wideModalWidth(); got != a.modalWidth() {
		t.Fatalf("wide modal should fall back to standard width on narrow screens, got %d want %d", got, a.modalWidth())
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

func TestLMConfigUsesSharedModalBodyContentWidth(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	w := a.lmConfigModalWidth()
	if got := maxInt(20, modalBodyContentWidth(w)); got != modalScrollableBodyWidth(w) {
		t.Fatalf("lm config content width = %d, want shared modal body width %d", got, modalScrollableBodyWidth(w))
	}
}

func TestOverlayTopIsStableAcrossModalHeights(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 40

	short := a.renderModalFrame(modalFrameOptions{width: a.modalWidth(), title: "Short", body: "one"})
	tall := a.renderModalFrame(modalFrameOptions{width: a.modalWidth(), title: "Tall", body: strings.Repeat("row\n", 12)})

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
		return mouseRect{x: (screenW - a.modalWidth()) / 2, y: 3, w: a.modalWidth()}
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
				a.settingsOpen = true
				a.settings = &settingsState{tab: 3}
				return a
			},
			view: func(a *App) string { return a.viewSettings() },
		},
		{
			name: "help",
			app:  newBase,
			view: func(a *App) string {
				a.helpOpen = true
				return a.viewHelp()
			},
		},
		{
			name: "doctor",
			app: func() *App {
				a := newBase()
				a.doctorOpen = true
				a.doctor = &doctorState{health: gact.HealthResponse{Healthy: true, OverallStatus: "ready"}}
				return a
			},
			view: func(a *App) string { return a.viewDoctor() },
		},
		{
			name: "metrics",
			app: func() *App {
				a := newBase()
				a.metricsOpen = true
				a.metrics = &metricsState{data: gact.Metrics{UptimeS: 12}}
				return a
			},
			view: func(a *App) string { return a.viewMetrics() },
		},
		{
			name: "provider",
			app: func() *App {
				a := newLMConfigTestApp()
				a.width = screenW
				a.height = screenH
				return a
			},
			view: func(a *App) string { return a.viewLMConfig() },
		},
		{
			name: "catalog",
			app: func() *App {
				a := newBase()
				a.catalogBrowser = &catalogBrowserState{
					kind:  catalogKindTools,
					title: "Tools",
					items: []catalogItem{{id: "read", title: "ReadFile", desc: "read files"}},
				}
				return a
			},
			view: func(a *App) string { return a.viewCatalogBrowser() },
		},
		{
			name: "detail",
			app: func() *App {
				a := newBase()
				a.detailView = &bulkyPartRef{title: "Detail", fullText: "one\ntwo"}
				a.detailViewOpen = true
				return a
			},
			view: func(a *App) string { return a.viewDetailView() },
		},
		{
			name: "quit",
			app: func() *App {
				a := newBase()
				a.quitConfirmOpen = true
				return a
			},
			view: func(a *App) string { return a.viewQuitConfirm() },
		},
		{
			name: "palette",
			app: func() *App {
				a := newBase()
				a.paletteOpen = true
				return a
			},
			view: func(a *App) string { return a.viewPalette() },
		},
		{
			name: "workspace",
			app: func() *App {
				a := newBase()
				a.workspaceSwitchOpen = true
				a.workspaces = []gact.Workspace{{ID: "default", Name: "default"}}
				return a
			},
			view: func(a *App) string { return a.viewWorkspaceSwitch() },
		},
		{
			name: "mcp-install",
			app: func() *App {
				a := newBase()
				a.mcpInstallOpen = true
				return a
			},
			view: func(a *App) string { return a.viewMcpInstall() },
		},
		{
			name: "mcp-remove",
			app: func() *App {
				a := newBase()
				a.mcpRemoveOpen = true
				a.mcpRemoveOptions = []gact.McpServer{{ID: "srv", Name: "server", Transport: "stdio"}}
				return a
			},
			view: func(a *App) string { return a.viewMcpRemove() },
		},
		{
			name: "rename",
			app: func() *App {
				a := newBase()
				a.renameOpen = true
				a.renameDraft = "demo"
				a.renameCursor = len([]rune(a.renameDraft))
				return a
			},
			view: func(a *App) string { return a.viewRename() },
		},
		{
			name: "context-add",
			app: func() *App {
				a := newBase()
				a.contextAddOpen = true
				a.contextAddDraft = "README.md"
				a.contextAddCursor = len([]rune(a.contextAddDraft))
				return a
			},
			view: func(a *App) string { return a.viewContextAdd() },
		},
		{
			name: "compose",
			app: func() *App {
				a := newBase()
				a.input.SetValue("hello")
				a.openCompose()
				return a
			},
			view: func(a *App) string { return a.viewCompose() },
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
		if rect.x != want.x || rect.y != want.y || rect.w != want.w {
			t.Fatalf("%s overlay rect = %+v, want x=%d y=%d w=%d", tc.name, rect, want.x, want.y, want.w)
		}
	}
}

func TestLMConfigAndComposeUseSharedWidth(t *testing.T) {
	a := New("http://unused")
	a.width = 160
	a.height = 40

	if got := a.lmConfigModalWidth(); got != a.modalWidth() {
		t.Fatalf("lm config width = %d, want shared width %d", got, a.modalWidth())
	}

	a.stage = StageReady
	a.input.SetValue("hello")
	a.openCompose()
	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:compose:commit")
	if !ok {
		t.Fatal("missing compose commit button hit target")
	}
	view := a.viewCompose()
	rect := overlayMouseRect(view, a.width, a.height)
	if rect.w != a.modalWidth() {
		t.Fatalf("compose modal width = %d, want shared width %d", rect.w, a.modalWidth())
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
