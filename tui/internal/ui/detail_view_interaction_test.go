package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestDetailViewCopyButtonCopiesFullContent(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{
		title:    "Evidence",
		fullText: "line one\nline two\nraw JSON remains intact",
	}
	mu, copied, _ := withClipboardSpy(t)

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:detail:copy")
	if !ok {
		t.Fatal("missing semantic detail copy target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("detail copy click should not dispatch a command")
	}
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("detail copy click should leave detail open")
	}
	mu.Lock()
	gotCopy := *copied
	mu.Unlock()
	if gotCopy != "line one\nline two\nraw JSON remains intact" {
		t.Fatalf("copied detail = %q", gotCopy)
	}
	if !strings.Contains(a.transientHint, "copied detail") {
		t.Fatalf("hint = %q, want copy confirmation", a.transientHint)
	}
}

func TestDetailViewMouseDragCopiesVisibleSelection(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{
		title:    "Evidence",
		fullText: "alpha detail line\nbravo detail line\ncharlie detail line",
	}
	mu, copied, _ := withClipboardSpy(t)

	_ = a.View()
	if a.clipboard.detailCopy.rect.w <= 0 || a.clipboard.detailCopy.rect.h <= 0 {
		t.Fatalf("detail copy snapshot not registered: %+v", a.clipboard.detailCopy.rect)
	}
	x := a.clipboard.detailCopy.rect.x
	y := a.clipboard.detailCopy.rect.y
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      x,
		Y:      y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	model, _ = a.Update(tea.MouseMotionMsg(tea.Mouse{
		X:      x + 4,
		Y:      y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	model, _ = a.Update(tea.MouseReleaseMsg(tea.Mouse{
		X:      x + 4,
		Y:      y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	mu.Lock()
	gotCopy := *copied
	mu.Unlock()
	if gotCopy != "alpha" {
		t.Fatalf("copied detail selection = %q, want alpha", gotCopy)
	}
	if !a.detail.visible {
		t.Fatal("detail drag copy should leave detail open")
	}
	if !strings.Contains(a.transientHint, "copied detail selection") {
		t.Fatalf("hint = %q, want detail selection confirmation", a.transientHint)
	}
	if !strings.Contains(a.transientHint, `"alpha"`) {
		t.Fatalf("hint = %q, want copied detail preview", a.transientHint)
	}
}

func TestDetailViewFooterAdvertisesDragSelectionWhenMouseEnabled(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{title: "Evidence", fullText: "line one\nline two"}

	out := ansi.Strip(a.View().Content)
	if !strings.Contains(out, "drag CLIO copy") {
		t.Fatalf("detail footer should advertise drag selection when mouse is enabled:\n%s", out)
	}
	if !strings.Contains(out, "Alt+drag terminal select") {
		t.Fatalf("detail footer should keep native terminal selection discoverable:\n%s", out)
	}
}

func TestDetailViewFooterRestoresNativeSelectionWhenMouseDisabled(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = false
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{title: "Evidence", fullText: "line one\nline two"}

	out := ansi.Strip(a.View().Content)
	if strings.Contains(out, "drag CLIO copy") {
		t.Fatalf("detail footer should not advertise in-app drag copy when mouse is disabled:\n%s", out)
	}
	if strings.Contains(out, "Alt+drag terminal select") {
		t.Fatalf("detail footer should not require Alt+drag when terminal selection is restored:\n%s", out)
	}
	if !strings.Contains(out, "y copy") || !strings.Contains(out, "Esc close") {
		t.Fatalf("detail footer should keep keyboard copy and close affordances:\n%s", out)
	}
}

func TestDetailViewYCopiesFullContent(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{title: "Evidence", fullText: "copy by key"}
	mu, copied, _ := withClipboardSpy(t)

	_, cmd := a.detail.handleKey(tea.KeyPressMsg{Code: 'y', Text: "y"})
	if cmd != nil {
		t.Fatal("detail y copy should not dispatch a command")
	}
	if !a.detail.visible {
		t.Fatal("detail y copy should leave detail open")
	}
	mu.Lock()
	gotCopy := *copied
	mu.Unlock()
	if gotCopy != "copy by key" {
		t.Fatalf("copied detail = %q", gotCopy)
	}
}

func TestDetailView_CtrlEOpensWithNewest(t *testing.T) {
	a := New("http://unused")
	a.focus = FocusBody
	a.conversation.messages = []gact.Message{{
		Role: gact.RoleTool, Parts: []gact.Part{{
			Type:    gact.PartTypeToolResult,
			Content: []gact.Part{{Type: gact.PartTypeText, Text: strings.Repeat("x\n", 20)}},
		}},
	}}
	a.handleKey(tea.KeyPressMsg{Code: 'e', Mod: tea.ModCtrl})
	if !a.detail.visible {
		t.Fatal("Ctrl+E should open detail view when a bulky part exists")
	}
	if a.detail.ref == nil {
		t.Fatal("detailView not populated")
	}
}

func TestDetailView_CtrlEWithoutBulkyShowsHint(t *testing.T) {
	a := New("http://unused")
	a.focus = FocusBody
	a.conversation.messages = nil
	a.handleKey(tea.KeyPressMsg{Code: 'e', Mod: tea.ModCtrl})
	if a.detail.visible {
		t.Error("Ctrl+E shouldn't open modal when nothing to expand")
	}
	if !strings.Contains(a.transientHint, "nothing to expand") {
		t.Errorf("hint = %q, want 'nothing to expand'", a.transientHint)
	}
}

func TestDetailView_EscClosesModal(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{title: "x", fullText: "content"}
	a.detail.scroll = 5
	a.handleKey(tea.KeyPressMsg{Code: tea.KeyEsc})
	if a.detail.visible {
		t.Error("Esc should close the detail view")
	}
	if a.detail.scroll != 0 {
		t.Errorf("scroll should reset, got %d", a.detail.scroll)
	}
}

func TestDetailView_ScrollClampsAtZero(t *testing.T) {
	a := New("http://unused")
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{fullText: "one\ntwo\nthree"}
	a.detail.scroll = 0
	a.detail.handleKey(tea.KeyPressMsg{Code: tea.KeyUp})
	if a.detail.scroll != 0 {
		t.Errorf("↑ at scroll 0 should clamp; got %d", a.detail.scroll)
	}
}

func TestDetailView_PgDnAdvancesByPageSize(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{fullText: strings.Repeat("line\n", 100)}

	step := a.detail.pageSize()
	a.detail.handleKey(tea.KeyPressMsg{Code: tea.KeyPgDown})
	if a.detail.scroll != step {
		t.Errorf("pgdown advanced by %d, want %d", a.detail.scroll, step)
	}
}
