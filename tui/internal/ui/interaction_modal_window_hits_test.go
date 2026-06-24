package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestModalIndexRailHitsMapVisibleRowsToIndexes(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.interaction.beginHitFrame()
	selected := -1
	modal := a.modals.renderDefaultModalSurface(40, strings.Join([]string{
		"one",
		"two",
		"three",
		"four",
	}, "\n"))

	a.interaction.registerModalIndexRailHits(modal, "index-rail", 0, 6, 4, 10, func(_ *App, index int) tea.Cmd {
		selected = index
		return nil
	})

	target, ok := findHitTargetForTest(a, "index-rail:rail:3")
	if !ok {
		t.Fatal("missing modal index rail target")
	}
	if _, handled := a.interaction.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled {
		t.Fatal("modal index rail target did not handle click")
	}
	if selected != 9 {
		t.Fatalf("selected index = %d, want final index 9", selected)
	}
}

func TestModalIndexedListRailHitsMapRowsToIndexes(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.interaction.beginHitFrame()
	selected := -1
	modal := a.modals.renderDefaultModalSurface(40, strings.Join([]string{
		"one",
		"two",
		"three",
		"four",
	}, "\n"))

	a.interaction.registerModalIndexedListRailHits(modal, "indexed-rail", 0, 6, 4, []int{2, 4, 8, 16, 32}, func(_ *App, index int) tea.Cmd {
		selected = index
		return nil
	})

	target, ok := findHitTargetForTest(a, "indexed-rail:rail:3")
	if !ok {
		t.Fatal("missing indexed modal rail target")
	}
	if _, handled := a.interaction.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled {
		t.Fatal("indexed modal rail target did not handle click")
	}
	if selected != 32 {
		t.Fatalf("selected index = %d, want final item value 32", selected)
	}
}

func TestWindowedModalListHitsClipToVisibleScrollWindow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.interaction.beginHitFrame()
	clicked := ""
	modal := a.modals.renderDefaultModalSurface(48, strings.Join([]string{
		"row 0",
		"row 1",
		"row 2",
		"row 3",
		"row 4",
	}, "\n"))
	rendered := scrollableModalFrameRender{
		modalFrameRender: modalFrameRender{modal: modal, bodyRow: 1},
		window:           scrollWindow{start: 2, end: 5, scroll: 2, total: 6},
	}
	list := modalListRender{hits: []modalListHit{{
		id:     "list:above",
		row:    0,
		height: 1,
		action: func(*App) tea.Cmd {
			clicked = "above"
			return nil
		},
	}, {
		id:     "list:spanning",
		row:    1,
		height: 3,
		action: func(*App) tea.Cmd {
			clicked = "spanning"
			return nil
		},
	}, {
		id:     "list:visible",
		row:    4,
		height: 1,
		action: func(*App) tea.Cmd {
			clicked = "visible"
			return nil
		},
	}}}

	a.interaction.registerWindowedModalListHits(rendered, 0, 20, list)
	if _, ok := findHitTargetForTest(a, "list:above"); ok {
		t.Fatal("offscreen list hit should not register")
	}
	spanning, ok := findHitTargetForTest(a, "list:spanning")
	if !ok {
		t.Fatal("partially visible list hit should register")
	}
	if spanning.rect.h != 2 {
		t.Fatalf("spanning hit height = %d, want clipped height 2", spanning.rect.h)
	}
	visible, ok := findHitTargetForTest(a, "list:visible")
	if !ok {
		t.Fatal("fully visible list hit should register")
	}
	if visible.rect.y <= spanning.rect.y {
		t.Fatalf("visible hit should be below spanning hit: spanning=%+v visible=%+v", spanning.rect, visible.rect)
	}
	if _, handled := a.interaction.activateHitAt(spanning.rect.x, spanning.rect.y, tea.MouseLeft); !handled || clicked != "spanning" {
		t.Fatalf("spanning hit activation handled=%v clicked=%q", handled, clicked)
	}
}

func TestClipModalListToWindowKeepsRowsAndHitsAligned(t *testing.T) {
	list := modalListRender{
		rows: []string{"row 0", "row 1", "row 2", "row 3"},
		hits: []modalListHit{{
			id:     "row:one",
			row:    1,
			height: 2,
			action: func(*App) tea.Cmd { return nil },
		}, {
			id:     "row:three",
			row:    3,
			height: 1,
			action: func(*App) tea.Cmd { return nil },
		}},
		renderedItems: 2,
	}

	clipped := clipModalListToWindow(list, scrollWindow{start: 2, end: 4, scroll: 2, total: 4})

	if got := strings.Join(clipped.rows, "|"); got != "row 2|row 3" {
		t.Fatalf("clipped rows = %q, want visible rows 2 and 3", got)
	}
	if clipped.renderedItems != 2 {
		t.Fatalf("renderedItems = %d, want preserved 2", clipped.renderedItems)
	}
	if len(clipped.hits) != 2 {
		t.Fatalf("clipped hits = %d, want 2", len(clipped.hits))
	}
	if clipped.hits[0].id != "row:one" || clipped.hits[0].row != 0 || clipped.hits[0].height != 1 {
		t.Fatalf("partially visible hit not clipped into window coordinates: %+v", clipped.hits[0])
	}
	if clipped.hits[1].id != "row:three" || clipped.hits[1].row != 1 || clipped.hits[1].height != 1 {
		t.Fatalf("visible hit not shifted into window coordinates: %+v", clipped.hits[1])
	}
}

func TestOffsetModalListHitsPreserveActionsAndHeights(t *testing.T) {
	called := false
	action := func(*App) tea.Cmd {
		called = true
		return nil
	}
	hits := offsetModalListHits(modalListRender{hits: []modalListHit{{
		id:     "row:a",
		row:    2,
		height: 3,
		action: action,
	}}}, 5)

	if len(hits) != 1 {
		t.Fatalf("offset hits = %d, want 1", len(hits))
	}
	if hits[0].id != "row:a" || hits[0].row != 7 || hits[0].height != 3 {
		t.Fatalf("offset hit = %+v, want id row:a row 7 height 3", hits[0])
	}
	hits[0].action(nil)
	if !called {
		t.Fatal("offset hit should preserve original action")
	}
}

func TestWindowedIndexModalListBuildsVisibleRowsAroundCursor(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	indexes := []int{10, 20, 30, 40, 50}
	list, win := a.modals.renderWindowedIndexModalList(
		indexes,
		3,
		3,
		6,
		modalListOptions{width: 24, rowBudget: 3},
		func(index int) modalListItem {
			return modalListItem{
				id:     "idx:" + itoa2(index),
				title:  "item " + itoa2(index),
				action: func(*App) tea.Cmd { return nil },
			}
		})

	if len(list.rows) != 3 {
		t.Fatalf("visible row count = %d, want 3", len(list.rows))
	}
	if len(list.hits) != 3 {
		t.Fatalf("hit count = %d, want 3", len(list.hits))
	}
	gotIDs := []string{list.hits[0].id, list.hits[1].id, list.hits[2].id}
	wantIDs := []string{"idx:30", "idx:40", "idx:50"}
	if strings.Join(gotIDs, ",") != strings.Join(wantIDs, ",") {
		t.Fatalf("hit ids = %#v, want %#v", gotIDs, wantIDs)
	}
	if win.start != 2 || win.end != 5 || win.total != 5 {
		t.Fatalf("window = %+v, want start=2 end=5 total=5", win)
	}
	for i, hit := range list.hits {
		if hit.row != i || hit.height != 1 {
			t.Fatalf("hit %d row/height = %d/%d, want %d/1", i, hit.row, hit.height, i)
		}
	}
}
