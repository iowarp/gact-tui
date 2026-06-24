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

func TestPaletteCommandRowsUseSemanticHitTargets(t *testing.T) {
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
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("/theme palette click should not dispatch command")
	}
	if a.cmdPalette.paletteOpen {
		t.Fatal("palette command click should close palette")
	}
	if !a.settings.open || a.settings.tab != 2 {
		t.Fatalf("palette command click should open theme settings, open=%v settings=%+v", a.settings.open, a.settings)
	}
}

func TestPaletteMouseCommandTogglesMouseCapture(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "/mouse"
	a.MouseEnabled = true
	saves := 0
	a.SaveConfig = func() error {
		saves++
		return nil
	}

	out := ansi.Strip(a.cmdPalette.view())
	if !strings.Contains(out, "/mouse") || !strings.Contains(out, "[CLIO copy]") || !strings.Contains(out, "Switch CLIO copy / terminal select") {
		t.Fatalf("/mouse palette row should show command and current state:\n%s", out)
	}

	model, cmd := a.cmdPalette.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("/mouse should return a hint-expiry command")
	}
	if a.MouseEnabled {
		t.Fatal("/mouse should disable mouse capture when it is on")
	}
	if a.cmdPalette.paletteOpen {
		t.Fatal("/mouse should close palette after dispatch")
	}
	if saves != 1 {
		t.Fatalf("SaveConfig calls = %d, want 1", saves)
	}
	if a.transientHint != "mouse mode: terminal select - drag selects text in the terminal" {
		t.Fatalf("hint = %q, want terminal selection confirmation", a.transientHint)
	}

	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "/mouse"
	a.cmdPalette.paletteSel = 0
	model, _ = a.cmdPalette.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = model.(*App)
	if !a.MouseEnabled {
		t.Fatal("second /mouse should re-enable mouse capture")
	}
	if a.transientHint != "mouse mode: CLIO copy - wheel/click enabled; drag copies visible text" {
		t.Fatalf("hint = %q, want CLIO mouse controls confirmation", a.transientHint)
	}
	if saves != 2 {
		t.Fatalf("SaveConfig calls after second toggle = %d, want 2", saves)
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
	a.session.selected = 0
	a.session.wsID = "ws1"
	a.cmdPalette.commands = []gact.Command{{ID: "/old", Title: "Old"}}

	_, _ = a.Update(commandsLoadedMsg{
		sessionID: "s2", workspaceID: "ws1",
		commands: []gact.Command{{ID: "/wrong", Title: "Wrong"}},
	})
	if len(a.cmdPalette.commands) != 1 || a.cmdPalette.commands[0].ID != "/old" {
		t.Fatalf("stale command response should not replace palette: %#v", a.cmdPalette.commands)
	}

	_, _ = a.Update(commandsLoadedMsg{
		sessionID: "s1", workspaceID: "ws1",
		commands: []gact.Command{{ID: "/validate-dataset", Title: "Validate Dataset", CommandSource: "agent_blueprint"}},
	})
	if len(a.cmdPalette.commands) != 1 || a.cmdPalette.commands[0].ID != "/validate-dataset" {
		t.Fatalf("current command response not applied: %#v", a.cmdPalette.commands)
	}
}

func TestPaletteFilterEditsAtCursor(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "/tme"
	a.cmdPalette.paletteCursor = 2
	a.cmdPalette.paletteCursorSet = true
	a.cmdPalette.paletteSel = 3
	a.cmdPalette.searching = true
	a.cmdPalette.searchMatches = []client.SearchMatch{{MessageID: "m1", Snippet: "stale"}}

	a.cmdPalette.handleKey(textKeyMsg("he"))

	if a.cmdPalette.paletteFilter != "/theme" {
		t.Fatalf("paletteFilter = %q, want /theme", a.cmdPalette.paletteFilter)
	}
	if a.cmdPalette.paletteCursor != len("/the") {
		t.Fatalf("paletteCursor = %d, want %d", a.cmdPalette.paletteCursor, len("/the"))
	}
	if a.cmdPalette.paletteSel != 0 || a.cmdPalette.searching || len(a.cmdPalette.searchMatches) != 0 {
		t.Fatalf("filter edit should reset selection/search state, sel=%d searching=%v matches=%d", a.cmdPalette.paletteSel, a.cmdPalette.searching, len(a.cmdPalette.searchMatches))
	}
}

func TestPaletteFilterClickPlacesCursor(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "/theme"
	a.cmdPalette.paletteCursor = len(a.cmdPalette.paletteFilter)
	a.cmdPalette.paletteCursorSet = true

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
	if a.cmdPalette.paletteCursor != 2 {
		t.Fatalf("paletteCursor = %d, want 2", a.cmdPalette.paletteCursor)
	}
	if !a.cmdPalette.paletteOpen {
		t.Fatal("palette filter cursor click should keep palette open")
	}
}

func TestPaletteMouseWheelMovesSelectionOnlyOverList(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.commands = []gact.Command{
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
	if a.cmdPalette.paletteSel != 1 {
		t.Fatalf("wheel over palette list should move selection, got %d", a.cmdPalette.paletteSel)
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
	if a.cmdPalette.paletteSel != 1 {
		t.Fatalf("wheel on palette chrome should not move selection, got %d", a.cmdPalette.paletteSel)
	}
}

func TestPaletteNonRowClickDoesNotChooseByCoordinates(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "/theme"

	_ = a.View()
	rect := overlayMouseRect(a.cmdPalette.view(), a.width, a.height)
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + rect.w - 2,
		Y:      rect.y + 2 + 3,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("non-row click inside palette should not dispatch")
	}
	if !a.cmdPalette.paletteOpen {
		t.Fatal("non-row click inside palette should keep palette open")
	}
	if a.settings.open {
		t.Fatal("non-row click inside palette should not choose /theme")
	}
}

func TestPaletteCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "/theme"
	a.cmdPalette.paletteSel = 1
	a.cmdPalette.searchMatches = []client.SearchMatch{{MessageID: "m1", Snippet: "stale"}}
	a.cmdPalette.searching = true

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
	if a.cmdPalette.paletteOpen || a.cmdPalette.paletteFilter != "" || a.cmdPalette.paletteSel != 0 || len(a.cmdPalette.searchMatches) != 0 || a.cmdPalette.searching {
		t.Fatalf("palette close should reset state, open=%v filter=%q sel=%d matches=%d searching=%v", a.cmdPalette.paletteOpen, a.cmdPalette.paletteFilter, a.cmdPalette.paletteSel, len(a.cmdPalette.searchMatches), a.cmdPalette.searching)
	}
}
