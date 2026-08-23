package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestMouseWheelWithOverlayOpenDoesNotLeakToConversation(t *testing.T) {
	a := newLongTextTranscriptApp()
	a.width = 120
	a.height = 34
	a.conversation.scrollOffset = 9
	a.conversation.stickyToBottom = false
	a.help.open = true

	_ = a.View()
	body, ok := findHitTargetForTest(a, "conversation:body:wheel")
	if !ok {
		t.Fatal("missing conversation body wheel target")
	}
	surface, ok := findHitTargetForTest(a, "help:surface:wheel")
	if !ok {
		t.Fatal("missing help surface wheel blocker")
	}
	x, y, ok := pointInsideOutsideRect(body.rect, surface.rect)
	if !ok {
		t.Fatalf("test needs a conversation wheel point outside help overlay, body=%+v surface=%+v", body.rect, surface.rect)
	}

	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      x,
		Y:      y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)

	if a.conversation.scrollOffset != 9 || a.conversation.stickyToBottom {
		t.Fatalf("conversation wheel leaked through open overlay: offset=%d sticky=%v", a.conversation.scrollOffset, a.conversation.stickyToBottom)
	}
}

func TestMouseClickOpenOverlayDoesNotLeakToBaseUI(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusBody
	a.help.open = true
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.session.selected = 0

	_ = a.View()
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: 3, Y: 2, Button: tea.MouseLeft}))
	a = model.(*App)

	if a.focus != FocusBody {
		t.Fatalf("overlay click leaked focus to base UI: focus=%v", a.focus)
	}
	if a.sidebar.sessionsCollapsed {
		t.Fatal("overlay click leaked into sidebar section toggle")
	}
	if a.help.open {
		t.Fatal("outside click should dismiss help overlay")
	}
}

func TestOverlaySharedOutsidePolicySwallowsInsideAndClosesOutside(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 30
	a.stage = StageReady
	a.metrics.open = true
	a.metrics.metricsState = metricsState{data: gact.Metrics{UptimeS: 42}}

	rect := overlayMouseRect(a.metrics.view(), a.width, a.height)
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 3,
		Y:      rect.y + 3,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("inside overlay click should only be swallowed")
	}
	if !a.metrics.open {
		t.Fatal("inside overlay click should keep metrics open")
	}

	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x - 1,
		Y:      rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("outside metrics click should not dispatch a command")
	}
	if a.metrics.open {
		t.Fatal("outside metrics click should close through shared overlay policy")
	}
}

func TestOverlaySharedPolicyClosesInvalidStateBeforeRendering(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.filePicker.open = true
	a.filePicker.filePickerState = filePickerState{loaded: true}

	rect := overlayMouseRect(a.filePicker.view(), a.width, a.height)
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x - 1,
		Y:      rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("invalid file picker close should not dispatch a command")
	}
	if a.filePicker.open {
		t.Fatal("invalid file picker overlay should close without rendering stale state")
	}
}

func TestMouseWheelOpenDetailScrollsDetailNotConversation(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.conversation.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "conversation"}}},
	}
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{title: "detail", fullText: strings.Repeat("line\n", 80)}
	a.conversation.scrollOffset = 7
	a.conversation.stickyToBottom = false

	_ = a.View()
	target, ok := findHitTargetForTest(a, "detail:body:wheel")
	if !ok {
		t.Fatal("missing detail body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)

	if a.detail.scroll != 1 {
		t.Fatalf("detailScroll = %d, want 1", a.detail.scroll)
	}
	if a.conversation.scrollOffset != 7 || a.conversation.stickyToBottom {
		t.Fatalf("conversation wheel leaked through overlay: offset=%d sticky=%v", a.conversation.scrollOffset, a.conversation.stickyToBottom)
	}
}

func TestMouseClickCatalogBrowserUsesRenderedDescRowGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
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
		t.Fatal("missing semantic catalog target")
	}

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("catalog click should open detail view")
	}
	if a.detail.ref.title != "Handoffs" {
		t.Fatalf("clicked rendered second row opened %q, want Handoffs", a.detail.ref.title)
	}
}

func TestMouseClickFilePickerInsertsClickedRow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.filePicker.open = true
	a.filePicker.filePickerState = filePickerState{
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

	if a.filePicker.open {
		t.Fatal("file picker should close after clicked insert")
	}
	if got := a.inputComposer.input.Value(); !strings.Contains(got, "@beta.parquet ") {
		t.Fatalf("input = %q, want clicked beta path inserted", got)
	}
}

func TestMouseCommandButtonOpensPalette(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.stage = StageReady
	a.focus = FocusBody
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "first", Status: gact.StatusIdle}}
	a.session.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "input:command")
	if !ok {
		t.Fatal("missing semantic input command target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if !a.cmdPalette.paletteOpen {
		t.Fatal("clicking input command chip should open palette")
	}
	if a.focus != FocusInput {
		t.Fatalf("focus = %v, want input", a.focus)
	}
}

func pointInsideOutsideRect(inside mouseRect, outside mouseRect) (int, int, bool) {
	for y := inside.y; y < inside.y+inside.h; y++ {
		for x := inside.x; x < inside.x+inside.w; x++ {
			if !outside.contains(x, y) {
				return x, y, true
			}
		}
	}
	return 0, 0, false
}
