package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"
)

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
	a.interaction.beginHitFrame()
	gotLine := -1
	gotCol := -1

	a.interaction.registerScreenTextareaCursorHits("screen-text", 5, 7, "ab\ncd", func(_ *App, line int, col int) {
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
	if _, handled := a.interaction.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled {
		t.Fatal("screen textarea cursor target did not handle click")
	}
	if gotLine != 1 || gotCol != 2 {
		t.Fatalf("cursor action got line=%d col=%d, want 1,2", gotLine, gotCol)
	}
}

func TestScreenTextareaRegionRegistersCursorHits(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.interaction.beginHitFrame()
	gotLine := -1
	gotCol := -1

	a.interaction.registerScreenTextareaRegion("input", 5, 7, "ab\ncd", func(_ *App, line int, col int) {
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
	if _, handled := a.interaction.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled {
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
	a.interaction.beginHitFrame()
	gotLine := -1
	gotCol := -1
	wheeled := false

	modal := a.modals.renderDefaultModalSurface(50, "alpha\nbravo")
	a.interaction.registerModalTextareaRegion(modal, 2, 3, 20, 4, "compose", "ab\ncd", func(_ *App, line int, col int) {
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
	if _, handled := a.interaction.activateHitAt(cursorTarget.rect.x, cursorTarget.rect.y, tea.MouseLeft); !handled {
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
	if _, handled := a.interaction.activateWheelHitAt(wheelTarget.rect.x, wheelTarget.rect.y, tea.MouseWheelDown); !handled || !wheeled {
		t.Fatalf("modal textarea wheel target not handled, handled=%v wheeled=%v", handled, wheeled)
	}
}

func TestScreenTextSpanHitUsesTextGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.interaction.beginHitFrame()
	clicked := false

	a.interaction.registerScreenTextSpanHit("span:placeholder", 4, 6, "xx[paste]", 2, "[paste]", func(*App) tea.Cmd {
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
	if _, handled := a.interaction.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("screen text span target should handle click, handled=%v clicked=%v", handled, clicked)
	}
}

func TestClippedScreenTextSpanHitUsesVisibleTextGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.interaction.beginHitFrame()
	clicked := false

	a.interaction.registerClippedScreenTextSpanHit("span:clip", 10, 4, "....workspace", 4, "workspace", 17, func(*App) tea.Cmd {
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
	if _, handled := a.interaction.activateHitAt(16, 4, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("clipped screen text span should handle visible click, handled=%v clicked=%v", handled, clicked)
	}
}

func TestScreenSurfaceHitUsesViewportGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 90
	a.height = 28
	a.interaction.beginHitFrame()
	clicked := false

	a.interaction.registerScreenSurfaceHit("surface:all", func(*App) tea.Cmd {
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
	if _, handled := a.interaction.activateHitAt(89, 27, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("screen surface should handle viewport edge click, handled=%v clicked=%v", handled, clicked)
	}
}

func TestFocusSurfaceHitSetsFocusAndRunsHook(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.focus = FocusInput
	a.interaction.beginHitFrame()
	hooked := false

	a.interaction.registerFocusSurfaceHit("focus:body", mouseRect{x: 3, y: 4, w: 20, h: 5}, FocusBody, func(*App) {
		hooked = true
	})

	if _, handled := a.interaction.activateHitAt(10, 6, tea.MouseLeft); !handled {
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

	if got, want := a.sidebar.focusSurfaceRect(30, 32), (mouseRect{x: 0, y: 1, w: 28, h: 32}); got != want {
		t.Fatalf("sidebar focus rect = %+v, want %+v", got, want)
	}
	if got, want := a.conversation.focusSurfaceRect(28, 88), (mouseRect{x: 30, y: 1, w: 86, h: 28}); got != want {
		t.Fatalf("conversation focus rect = %+v, want %+v", got, want)
	}
	if got, want := a.inputComposer.focusSurfaceRect(28, 1, 3, 88), (mouseRect{x: 30, y: 29, w: 86, h: 4}); got != want {
		t.Fatalf("input focus rect = %+v, want %+v", got, want)
	}
}
