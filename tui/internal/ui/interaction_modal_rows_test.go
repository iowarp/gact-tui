package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestModalListColumnsPreserveColumnHitGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	list := a.modals.renderModalList([]modalListItem{
		{id: "one", title: "one", meta: "first", action: func(*App) tea.Cmd { return nil }},
		{id: "two", title: "two", meta: "second", action: func(*App) tea.Cmd { return nil }},
		{id: "three", title: "three", meta: "third", action: func(*App) tea.Cmd { return nil }},
		{id: "four", title: "four", meta: "fourth", action: func(*App) tea.Cmd { return nil }},
	}, modalListOptions{width: 80, columns: 2, minColumnWidth: 24})
	if len(list.rows) != 2 {
		t.Fatalf("column list rows = %d, want 2", len(list.rows))
	}
	if len(list.hits) != 4 {
		t.Fatalf("column list hits = %d, want 4", len(list.hits))
	}
	if list.hits[0].id != "one" || list.hits[1].id != "three" {
		t.Fatalf("column-major first row hit ids = %q/%q, want one/three", list.hits[0].id, list.hits[1].id)
	}
	if list.hits[0].row != list.hits[1].row {
		t.Fatalf("first-row column hits should share row, got %d and %d", list.hits[0].row, list.hits[1].row)
	}
	if list.hits[1].col <= list.hits[0].col || list.hits[1].width != list.hits[0].width {
		t.Fatalf("second column hit geometry = %+v, first = %+v", list.hits[1], list.hits[0])
	}
	clipped := clipModalListToWindow(list, scrollWindow{start: 0, end: 1, total: len(list.rows)})
	if len(clipped.hits) != 2 {
		t.Fatalf("clipped first row hits = %d, want both columns", len(clipped.hits))
	}
	if clipped.hits[1].col != list.hits[1].col || clipped.hits[1].width != list.hits[1].width {
		t.Fatalf("clipped column geometry = %+v, want col/width from %+v", clipped.hits[1], list.hits[1])
	}
}

func TestScrollableModalRowHitsClipToVisibleWindow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.interaction.beginHitFrame()
	clicked := false
	rendered := a.modals.renderModalFrameWithLayout(modalFrameOptions{
		width: 40,
		title: "Rows",
		body: strings.Join([]string{
			"row 0",
			"row 1",
			"row 2",
			"row 3",
		}, "\n"),
	})

	a.interaction.registerScrollableModalRowHits(rendered, scrollWindow{start: 2, end: 4, total: 4}, []modalRowHit{{
		id:     "rows:middle",
		start:  1,
		height: 3,
		action: func(*App) tea.Cmd {
			clicked = true
			return nil
		},
	}})

	target, ok := findHitTargetForTest(a, "rows:middle")
	if !ok {
		t.Fatal("missing scrollable modal row target")
	}
	if target.rect.h != 2 {
		t.Fatalf("row target height = %d, want visible clipped height 2", target.rect.h)
	}
	if _, handled := a.interaction.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("clipped row target should handle click, handled=%v clicked=%v", handled, clicked)
	}
}

func TestScrollableModalRowDetailFooterInsertsBeforeRefreshAndClose(t *testing.T) {
	hits := []modalRowHit{{id: "row", start: 0, height: 1, action: func(*App) tea.Cmd { return nil }}}
	got := scrollableModalRowDetailFooter("Tab view  Up/Down scroll  r refresh  Esc close", hits)
	want := "Tab view  Up/Down scroll  Enter/click details  r refresh  Esc close"
	if got != want {
		t.Fatalf("footer hint = %q, want %q", got, want)
	}
	if got := scrollableModalRowDetailFooter("Up/Down scroll  r refresh  Esc close", nil); got != "Up/Down scroll  r refresh  Esc close" {
		t.Fatalf("footer without row hits changed to %q", got)
	}
}
