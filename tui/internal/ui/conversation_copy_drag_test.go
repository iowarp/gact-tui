package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestVisibleConversationSelectionTextSlicesDisplayCells(t *testing.T) {
	snapshot := conversationCopySnapshot{
		rect: mouseRect{x: 10, y: 4, w: 40, h: 3},
		lines: []string{
			"first selectable line",
			"second selectable line",
			"third selectable line",
		},
	}

	got := visibleConversationSelectionText(snapshot, 16, 4, 15, 5)
	want := "selectable line\nsecond"
	if got != want {
		t.Fatalf("selection text = %q, want %q", got, want)
	}
}

func TestMouseDragCopiesVisibleConversationSelection(t *testing.T) {
	mu, copied, _ := withClipboardSpy(t)
	a := New("http://example.invalid")
	a.MouseEnabled = true
	a.clipboard.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{"hello world", "second line"},
	}

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: 10, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)
	model, _ = a.Update(tea.MouseMotionMsg(tea.Mouse{X: 14, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)
	model, _ = a.Update(tea.MouseReleaseMsg(tea.Mouse{X: 14, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)

	mu.Lock()
	got := *copied
	mu.Unlock()
	if got != "hello" {
		t.Fatalf("copied = %q, want hello", got)
	}
	if !strings.Contains(a.transientHint, "copied visible text") {
		t.Fatalf("hint = %q, want visible text confirmation", a.transientHint)
	}
	if !strings.Contains(a.transientHint, `"hello"`) {
		t.Fatalf("hint = %q, want copied text preview", a.transientHint)
	}
}

func TestMouseDragCopyUpdatesOnMotionWithoutLeftButton(t *testing.T) {
	mu, copied, _ := withClipboardSpy(t)
	a := New("http://example.invalid")
	a.MouseEnabled = true
	a.clipboard.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{"hello world", "second line"},
	}

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: 10, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)
	model, _ = a.Update(tea.MouseMotionMsg(tea.Mouse{X: 14, Y: 4}))
	a = model.(*App)

	if !a.clipboard.copyDrag.moved {
		t.Fatal("active drag should update on motion even when terminal omits MouseLeft")
	}

	model, _ = a.Update(tea.MouseReleaseMsg(tea.Mouse{X: 14, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)

	mu.Lock()
	got := *copied
	mu.Unlock()
	if got != "hello" {
		t.Fatalf("copied = %q, want hello", got)
	}
}

func TestActiveCopyDragStatusPreviewsSelectionBeforeRelease(t *testing.T) {
	a := New("http://example.invalid")
	a.clipboard.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{"hello world", "second line"},
	}
	a.clipboard.copyDrag = conversationCopyDrag{
		active: true,
		moved:  true,
		startX: 10,
		startY: 4,
		endX:   14,
		endY:   4,
	}

	got := a.clipboard.activeDragStatus()
	for _, want := range []string{"copy text", "5 chars", "release to copy", `"hello"`} {
		if !strings.Contains(got, want) {
			t.Fatalf("active drag status missing %q: %q", want, got)
		}
	}
}

func TestFooterShowsActiveCopyDragStatus(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 150
	a.focus = FocusInput
	a.MouseEnabled = true
	a.clipboard.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{"hello world", "second line"},
	}
	a.clipboard.copyDrag = conversationCopyDrag{
		active: true,
		moved:  true,
		startX: 10,
		startY: 4,
		endX:   14,
		endY:   4,
	}

	rendered := stripANSI(a.chrome.renderFooter())
	for _, want := range []string{"drag copy text", "release to copy", `"hello"`} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("footer missing active drag status %q:\n%s", want, rendered)
		}
	}
	if strings.Contains(rendered, "Enter send") {
		t.Fatalf("active drag footer should prioritize selection status over normal input hints:\n%s", rendered)
	}
}

func TestMouseDragCopySuppressesUnderlyingConversationClickTarget(t *testing.T) {
	mu, copied, _ := withClipboardSpy(t)
	a := New("http://example.invalid")
	a.MouseEnabled = true
	a.focus = FocusInput
	a.clipboard.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{"hello world", "second line"},
	}
	a.interaction.hits = &uiHitRegistry{}
	a.interaction.hits.add(uiHitTarget{
		id:   "conversation:body:focus",
		rect: a.clipboard.conversationCopy.rect,
		action: func(app *App) tea.Cmd {
			app.focus = FocusBody
			return nil
		},
	})

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: 10, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)
	model, _ = a.Update(tea.MouseMotionMsg(tea.Mouse{X: 14, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)
	model, _ = a.Update(tea.MouseReleaseMsg(tea.Mouse{X: 14, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)

	mu.Lock()
	got := *copied
	mu.Unlock()
	if got != "hello" {
		t.Fatalf("copied = %q, want hello", got)
	}
	if a.focus != FocusInput {
		t.Fatalf("drag copy should not activate underlying transcript click target; focus = %v", a.focus)
	}
}

func TestMouseClickWithoutDragActivatesConversationTargetOnRelease(t *testing.T) {
	a := New("http://example.invalid")
	a.MouseEnabled = true
	a.focus = FocusInput
	a.clipboard.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{"hello world", "second line"},
	}
	a.interaction.hits = &uiHitRegistry{}
	a.interaction.hits.add(uiHitTarget{
		id:   "conversation:body:focus",
		rect: a.clipboard.conversationCopy.rect,
		action: func(app *App) tea.Cmd {
			app.focus = FocusBody
			return nil
		},
	})

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: 10, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)
	if a.focus != FocusInput {
		t.Fatalf("mouse-down should wait for release before activating target, focus = %v", a.focus)
	}
	model, _ = a.Update(tea.MouseReleaseMsg(tea.Mouse{X: 10, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)
	if a.focus != FocusBody {
		t.Fatalf("click without drag should activate underlying target on release, focus = %v", a.focus)
	}
}

func TestAltMouseDragBypassesInAppCopyAndClickTargets(t *testing.T) {
	mu, copied, _ := withClipboardSpy(t)
	a := New("http://example.invalid")
	a.MouseEnabled = true
	a.focus = FocusInput
	a.clipboard.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{"hello world", "second line"},
	}
	a.interaction.hits = &uiHitRegistry{}
	a.interaction.hits.add(uiHitTarget{
		id:   "conversation:body:focus",
		rect: a.clipboard.conversationCopy.rect,
		action: func(app *App) tea.Cmd {
			app.focus = FocusBody
			return nil
		},
	})

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: 10, Y: 4, Button: tea.MouseLeft, Mod: tea.ModAlt}))
	a = model.(*App)
	model, _ = a.Update(tea.MouseMotionMsg(tea.Mouse{X: 14, Y: 4, Button: tea.MouseLeft, Mod: tea.ModAlt}))
	a = model.(*App)
	model, _ = a.Update(tea.MouseReleaseMsg(tea.Mouse{X: 14, Y: 4, Button: tea.MouseLeft, Mod: tea.ModAlt}))
	a = model.(*App)

	mu.Lock()
	got := *copied
	mu.Unlock()
	if got != "" {
		t.Fatalf("Alt+drag should leave native selection alone, copied %q", got)
	}
	if a.clipboard.copyDrag.active {
		t.Fatal("Alt+drag should not leave an in-app copy drag active")
	}
	if a.focus != FocusInput {
		t.Fatalf("Alt+drag should not activate underlying targets, focus = %v", a.focus)
	}
}

func TestAltMouseReleaseCancelsActiveInAppCopyDrag(t *testing.T) {
	mu, copied, _ := withClipboardSpy(t)
	a := New("http://example.invalid")
	a.MouseEnabled = true
	a.clipboard.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{"hello world", "second line"},
	}

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: 10, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)
	model, _ = a.Update(tea.MouseMotionMsg(tea.Mouse{X: 14, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)
	if !a.clipboard.copyDrag.active || !a.clipboard.copyDrag.moved {
		t.Fatalf("expected active in-app drag before Alt release: %+v", a.clipboard.copyDrag)
	}

	model, _ = a.Update(tea.MouseReleaseMsg(tea.Mouse{X: 14, Y: 4, Button: tea.MouseLeft, Mod: tea.ModAlt}))
	a = model.(*App)

	mu.Lock()
	got := *copied
	mu.Unlock()
	if got != "" {
		t.Fatalf("Alt release should cancel in-app copy, copied %q", got)
	}
	if a.clipboard.copyDrag.active {
		t.Fatal("Alt release should clear active in-app copy drag")
	}
}

func TestMouseClickWithoutDragDoesNotCopyConversationSelection(t *testing.T) {
	mu, copied, _ := withClipboardSpy(t)
	a := New("http://example.invalid")
	a.MouseEnabled = true
	a.clipboard.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{"hello world", "second line"},
	}

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: 10, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)
	model, _ = a.Update(tea.MouseReleaseMsg(tea.Mouse{X: 10, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)

	mu.Lock()
	got := *copied
	mu.Unlock()
	if got != "" {
		t.Fatalf("click without drag copied %q", got)
	}
}
