package ui

import (
	"strconv"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestPaletteSearchQueryClickPlacesCursorAfterHiddenQuestionMark(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "?needle"
	a.cmdPalette.paletteCursor = len(a.cmdPalette.paletteFilter)
	a.cmdPalette.paletteCursorSet = true

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
	if a.cmdPalette.paletteCursor != 3 {
		t.Fatalf("paletteCursor = %d, want 3 (cursor 2 after hidden ? prefix)", a.cmdPalette.paletteCursor)
	}
}

func TestPaletteSearchMouseWheelMovesSelectionOnlyOverList(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "?needle"
	a.cmdPalette.searchMatches = []client.SearchMatch{
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
	if a.cmdPalette.paletteSel != 1 {
		t.Fatalf("wheel over palette search list should move selection, got %d", a.cmdPalette.paletteSel)
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
	if a.cmdPalette.paletteSel != 1 {
		t.Fatalf("wheel on palette search chrome should not move selection, got %d", a.cmdPalette.paletteSel)
	}
}

func TestPaletteSearchCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "?needle"
	a.cmdPalette.searchMatches = []client.SearchMatch{{MessageID: "m1", Snippet: "needle"}}

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
	if a.cmdPalette.paletteOpen || a.cmdPalette.paletteFilter != "" || len(a.cmdPalette.searchMatches) != 0 {
		t.Fatalf("palette search close should reset state, open=%v filter=%q matches=%d", a.cmdPalette.paletteOpen, a.cmdPalette.paletteFilter, len(a.cmdPalette.searchMatches))
	}
}

func TestPaletteSearchRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "?needle"
	a.cmdPalette.searchMatches = []client.SearchMatch{{MessageID: "m2", Snippet: "needle hit"}}
	a.conversation.messages = []gact.Message{
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
	if a.cmdPalette.paletteOpen {
		t.Fatal("search result click should close palette")
	}
	if a.conversation.scrollOffset != 1 {
		t.Fatalf("search result click should jump to m2, scrollOffset=%d", a.conversation.scrollOffset)
	}
}

func TestPaletteSearchWindowUsesSharedScrollAffordance(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "?needle"
	a.cmdPalette.paletteSel = 10
	for i := 0; i < 14; i++ {
		a.cmdPalette.searchMatches = append(a.cmdPalette.searchMatches, client.SearchMatch{
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
	out := ansi.Strip(a.cmdPalette.view())
	if strings.Contains(out, "showing ") {
		t.Fatalf("palette search should use shared scroll affordance instead of textual ranges:\n%s", out)
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("palette search should render shared side scroll affordance for long result lists:\n%s", out)
	}
}
