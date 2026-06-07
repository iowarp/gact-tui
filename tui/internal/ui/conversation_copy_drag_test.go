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
	a.conversationCopy = conversationCopySnapshot{
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
	a.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{"hello world", "second line"},
	}

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: 10, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)
	model, _ = a.Update(tea.MouseMotionMsg(tea.Mouse{X: 14, Y: 4}))
	a = model.(*App)

	if !a.copyDrag.moved {
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
	a.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{"hello world", "second line"},
	}
	a.copyDrag = conversationCopyDrag{
		active: true,
		moved:  true,
		startX: 10,
		startY: 4,
		endX:   14,
		endY:   4,
	}

	got := a.activeCopyDragStatus()
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
	a.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{"hello world", "second line"},
	}
	a.copyDrag = conversationCopyDrag{
		active: true,
		moved:  true,
		startX: 10,
		startY: 4,
		endX:   14,
		endY:   4,
	}

	rendered := stripANSI(a.renderFooter())
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
	a.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{"hello world", "second line"},
	}
	a.hits = &uiHitRegistry{}
	a.hits.add(uiHitTarget{
		id:   "conversation:body:focus",
		rect: a.conversationCopy.rect,
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
	a.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{"hello world", "second line"},
	}
	a.hits = &uiHitRegistry{}
	a.hits.add(uiHitTarget{
		id:   "conversation:body:focus",
		rect: a.conversationCopy.rect,
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
	a.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{"hello world", "second line"},
	}
	a.hits = &uiHitRegistry{}
	a.hits.add(uiHitTarget{
		id:   "conversation:body:focus",
		rect: a.conversationCopy.rect,
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
	if a.copyDrag.active {
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
	a.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{"hello world", "second line"},
	}

	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{X: 10, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)
	model, _ = a.Update(tea.MouseMotionMsg(tea.Mouse{X: 14, Y: 4, Button: tea.MouseLeft}))
	a = model.(*App)
	if !a.copyDrag.active || !a.copyDrag.moved {
		t.Fatalf("expected active in-app drag before Alt release: %+v", a.copyDrag)
	}

	model, _ = a.Update(tea.MouseReleaseMsg(tea.Mouse{X: 14, Y: 4, Button: tea.MouseLeft, Mod: tea.ModAlt}))
	a = model.(*App)

	mu.Lock()
	got := *copied
	mu.Unlock()
	if got != "" {
		t.Fatalf("Alt release should cancel in-app copy, copied %q", got)
	}
	if a.copyDrag.active {
		t.Fatal("Alt release should clear active in-app copy drag")
	}
}

func TestConversationCopyDragHighlightMarksVisibleSelection(t *testing.T) {
	snapshot := conversationCopySnapshot{
		rect: mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{
			"hello world",
			"second line",
		},
	}
	drag := conversationCopyDrag{
		active: true,
		moved:  true,
		startX: 10,
		startY: 4,
		endX:   14,
		endY:   4,
	}

	rendered := renderConversationCopySelection(strings.Join(snapshot.lines, "\n"), snapshot, drag, DefaultTheme())
	if !strings.Contains(rendered, "\x1b[") {
		t.Fatalf("highlighted selection should contain ANSI styling: %q", rendered)
	}
	if !strings.Contains(rendered, "\x1b[4") && !strings.Contains(rendered, ";4;") {
		t.Fatalf("highlighted selection should underline selected text for visibility: %q", rendered)
	}
	if got := strings.TrimSpace(stripANSI(rendered)); got != "hello world\nsecond line" {
		t.Fatalf("highlight should preserve visible text, got %q", got)
	}
}

func TestConversationCopyDragHighlightUsesBodyLocalCoordinates(t *testing.T) {
	a := New("http://example.invalid")
	a.Theme = DefaultTheme()
	a.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 34, y: 15, w: 80, h: 1},
		lines: []string{"status: success"},
	}
	a.copyDrag = conversationCopyDrag{
		active: true,
		moved:  true,
		startX: 34,
		startY: 15,
		endX:   48,
		endY:   15,
	}

	rendered := a.renderConversationCopyDragHighlight("status: success")
	if !strings.Contains(rendered, "\x1b[") {
		t.Fatalf("highlight should contain ANSI styling after local coordinate conversion: %q", rendered)
	}
	if got := strings.TrimSpace(stripANSI(rendered)); got != "status: success" {
		t.Fatalf("highlight should preserve visible text, got %q", got)
	}
}

func TestCopySelectionOnSurfaceHighlightsBodyRowWithOffset(t *testing.T) {
	snapshot := conversationCopySnapshot{
		rect: mouseRect{x: 2, y: 2, w: 40, h: 2},
		lines: []string{
			"alpha detail line",
			"bravo detail line",
		},
	}
	drag := conversationCopyDrag{
		active: true,
		moved:  true,
		startX: 2,
		startY: 2,
		endX:   6,
		endY:   2,
	}
	surface := strings.Join([]string{
		"modal title",
		"Operator view",
		"  alpha detail line",
		"  bravo detail line",
	}, "\n")

	rendered := renderCopySelectionOnSurface(surface, snapshot, drag, DefaultTheme())
	lines := strings.Split(rendered, "\n")
	if strings.Contains(lines[0], "\x1b[") || strings.Contains(lines[1], "\x1b[") {
		t.Fatalf("selection should not highlight header rows:\n%q\n%q", lines[0], lines[1])
	}
	if !strings.Contains(lines[2], "\x1b[") {
		t.Fatalf("selection should highlight the body row, got %q", lines[2])
	}
	if got := strings.TrimSpace(stripANSI(rendered)); got != strings.TrimSpace(surface) {
		t.Fatalf("highlight should preserve visible surface text, got %q", got)
	}
}

func TestConversationCopyDragHighlightShowsInitialCellBeforeMotion(t *testing.T) {
	snapshot := conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 1},
		lines: []string{"hello world"},
	}
	drag := conversationCopyDrag{
		active: true,
		startX: 10,
		startY: 4,
		endX:   10,
		endY:   4,
	}

	rendered := renderConversationCopySelection(strings.Join(snapshot.lines, "\n"), snapshot, drag, DefaultTheme())
	if !strings.Contains(rendered, "\x1b[") {
		t.Fatalf("initial drag cell should contain ANSI styling: %q", rendered)
	}
	if got := strings.TrimSpace(stripANSI(rendered)); got != "hello world" {
		t.Fatalf("initial drag highlight should preserve visible text, got %q", got)
	}
}

func TestConversationFooterShowsDragCopyWhenMouseEnabled(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.focus = FocusBody
	a.MouseEnabled = true

	variants := a.footerContextHintVariants(func(key, label string) string {
		return key + " " + label
	})
	if len(variants) == 0 {
		t.Fatal("missing conversation footer variants")
	}
	joined := strings.Join(variants[0], " | ")
	if !strings.Contains(joined, "drag CLIO copy") {
		t.Fatalf("mouse-enabled conversation footer missing drag copy hint: %q", joined)
	}
	if !strings.Contains(joined, "Alt+drag terminal select") {
		t.Fatalf("mouse-enabled conversation footer should expose native terminal selection escape hatch: %q", joined)
	}
}

func TestConversationFooterPrioritizesCopyAtDemoWidth(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 150
	a.focus = FocusBody
	a.MouseEnabled = true

	rendered := stripANSI(a.renderFooter())
	for _, want := range []string{"y copy", "drag CLIO copy", "Alt+drag terminal select"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("conversation footer missing %q at demo width:\n%s", want, rendered)
		}
	}
}

func TestFooterRestoresNativeSelectionHintsWhenMouseDisabled(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 150
	a.focus = FocusInput
	a.MouseEnabled = false

	rendered := stripANSI(a.renderFooter())
	for _, notWant := range []string{"drag CLIO copy", "Alt+drag terminal select"} {
		if strings.Contains(rendered, notWant) {
			t.Fatalf("mouse-disabled footer should not advertise TUI mouse capture affordance %q:\n%s", notWant, rendered)
		}
	}
	for _, want := range []string{"/ cmd", "? help", "Ctrl+C quit"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("mouse-disabled footer missing normal terminal hint %q:\n%s", want, rendered)
		}
	}
}

func TestInputFooterShowsDragCopyWhenMouseEnabled(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 180
	a.focus = FocusInput
	a.MouseEnabled = true

	variants := a.footerContextHintVariants(func(key, label string) string {
		return key + " " + label
	})
	if len(variants) == 0 {
		t.Fatal("missing input footer variants")
	}
	hasDragVariant := false
	hasNativeVariant := false
	for _, variant := range variants {
		joined := strings.Join(variant, " | ")
		if strings.Contains(joined, "drag CLIO copy") {
			hasDragVariant = true
		}
		if strings.Contains(joined, "Alt+drag terminal select") {
			hasNativeVariant = true
		}
	}
	if !hasDragVariant {
		t.Fatalf("mouse-enabled input footer variants missing drag copy hint: %#v", variants)
	}
	if !hasNativeVariant {
		t.Fatalf("mouse-enabled input footer variants missing native selection hint: %#v", variants)
	}
	rendered := stripANSI(a.renderFooter())
	if !strings.Contains(rendered, "\\+Enter newline") {
		t.Fatalf("wide mouse-enabled input footer should preserve newline hint:\n%s", rendered)
	}
	if !strings.Contains(rendered, "Enter send") {
		t.Fatalf("mouse-enabled rendered input footer should preserve input send hint:\n%s", rendered)
	}
}

func TestInputFooterPrioritizesDragCopyAtDemoWidth(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 150
	a.focus = FocusInput
	a.MouseEnabled = true

	rendered := stripANSI(a.renderFooter())
	for _, want := range []string{"drag CLIO copy", "Alt+drag terminal select", "Enter send"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("mouse-enabled input footer missing %q at demo width:\n%s", want, rendered)
		}
	}
}

func TestMouseClickWithoutDragDoesNotCopyConversationSelection(t *testing.T) {
	mu, copied, _ := withClipboardSpy(t)
	a := New("http://example.invalid")
	a.MouseEnabled = true
	a.conversationCopy = conversationCopySnapshot{
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
