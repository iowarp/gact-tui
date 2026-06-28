package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
)

func TestBoundedScrollWindowClampsToVisibleRange(t *testing.T) {
	tests := []struct {
		name       string
		total      int
		budget     int
		scroll     int
		wantStart  int
		wantEnd    int
		wantScroll int
	}{
		{name: "negative scroll", total: 10, budget: 4, scroll: -3, wantStart: 0, wantEnd: 4, wantScroll: 0},
		{name: "past end", total: 10, budget: 4, scroll: 99, wantStart: 6, wantEnd: 10, wantScroll: 6},
		{name: "content shorter than budget", total: 3, budget: 10, scroll: 4, wantStart: 0, wantEnd: 3, wantScroll: 0},
		{name: "zero budget", total: 3, budget: 0, scroll: 2, wantStart: 2, wantEnd: 3, wantScroll: 2},
	}
	for _, tc := range tests {
		got := boundedScrollWindow(tc.total, tc.budget, tc.scroll)
		if got.start != tc.wantStart || got.end != tc.wantEnd || got.scroll != tc.wantScroll || got.total != tc.total {
			t.Fatalf("%s: got %+v, want start=%d end=%d scroll=%d total=%d", tc.name, got, tc.wantStart, tc.wantEnd, tc.wantScroll, tc.total)
		}
	}
}

func TestWindowModalBodyAndRangeHintUseSharedScrollSemantics(t *testing.T) {
	body := strings.Join([]string{"zero", "one", "two", "three", "four"}, "\n")
	windowed := windowModalBody(body, 2, 99)

	if windowed.body != "three\nfour" {
		t.Fatalf("windowed body = %q, want final two rows", windowed.body)
	}
	if windowed.window.scroll != 3 || windowed.window.start != 3 || windowed.window.end != 5 || windowed.window.total != 5 {
		t.Fatalf("window = %+v, want clamped final window", windowed.window)
	}
	if got := modalRangeHint(windowed.window, "Up/Down scroll"); got != "Up/Down scroll" {
		t.Fatalf("range hint at bottom = %q, want base hint only", got)
	}

	windowed = windowModalBody(body, 2, 1)
	if got := modalRangeHint(windowed.window, "Up/Down scroll"); got != "Up/Down scroll" {
		t.Fatalf("range hint = %q, want base hint only", got)
	}
}

func TestScrollableModalFrameRegistersBodyWheelAndPersistsWindow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.interaction.beginHitFrame()
	wheeled := false
	closed := false
	railScroll := -1
	hintStyle := a.Theme.HintLabel

	rendered := a.modals.renderScrollableModalFrame(scrollableModalFrameOptions{
		frame: modalFrameOptions{
			width: 60,
			title: "Scrollable",
			buttons: []menuButton{{
				id:    "scrollable:close",
				label: "close",
				action: func(*App) tea.Cmd {
					closed = true
					return nil
				},
			}},
			tabs: []menuTab{{
				id:     "scrollable-tab",
				label:  "Tab",
				active: true,
				action: func(*App) tea.Cmd { return nil },
			}},
		},
		content:     strings.Join([]string{"zero", "one", "two", "three"}, "\n"),
		pageSize:    2,
		scroll:      1,
		wheelID:     "shared-scroll",
		footerHint:  "Up/Down scroll",
		footerStyle: &hintStyle,
		wheelAction: func(*App, tea.MouseButton) tea.Cmd {
			wheeled = true
			return nil
		},
		scrollTo: func(_ *App, scroll int) tea.Cmd {
			railScroll = scroll
			return nil
		},
	})

	plain := ansi.Strip(rendered.modal)
	if !strings.Contains(plain, "one") || !strings.Contains(plain, "two") || strings.Contains(plain, "zero") {
		t.Fatalf("modal should render selected body window:\n%s", plain)
	}
	if strings.Contains(plain, "2-3/4") {
		t.Fatalf("modal footer should not include numeric range text:\n%s", plain)
	}
	if !strings.Contains(plain, "Up/Down scroll") {
		t.Fatalf("modal footer should keep the base hint:\n%s", plain)
	}
	if !strings.Contains(plain, "┃") {
		t.Fatalf("scrollable modal body should render a side scroll indicator:\n%s", plain)
	}
	if rendered.window.scroll != 1 || rendered.window.start != 1 || rendered.window.end != 3 {
		t.Fatalf("window = %+v, want rows 1-3", rendered.window)
	}
	target, ok := findHitTargetForTest(a, "shared-scroll:body:wheel")
	if !ok {
		t.Fatal("missing shared scroll body wheel target")
	}
	if _, handled := a.interaction.activateWheelHitAt(target.rect.x, target.rect.y, tea.MouseWheelDown); !handled || !wheeled {
		t.Fatalf("shared scroll wheel target not activated, handled=%v wheeled=%v", handled, wheeled)
	}
	railTarget, ok := findHitTargetForTest(a, "shared-scroll:rail:1")
	if !ok {
		t.Fatal("missing shared scroll rail target")
	}
	if _, handled := a.interaction.activateHitAt(railTarget.rect.x, railTarget.rect.y, tea.MouseLeft); !handled {
		t.Fatal("shared scroll rail target did not handle click")
	}
	if railScroll != 2 {
		t.Fatalf("rail click scroll = %d, want bottom offset 2", railScroll)
	}
	if _, ok := findHitTargetForTest(a, "button:scrollable:close"); !ok {
		t.Fatal("scrollable modal frame should register header buttons after wheel surface targets")
	}
	closeTarget, _ := findHitTargetForTest(a, "button:scrollable:close")
	if _, handled := a.interaction.activateHitAt(closeTarget.rect.x, closeTarget.rect.y, tea.MouseLeft); !handled || !closed {
		t.Fatalf("scrollable modal close button should remain clickable above surface target, handled=%v closed=%v", handled, closed)
	}
	if _, ok := findHitTargetForTest(a, "tab:scrollable-tab"); !ok {
		t.Fatal("scrollable modal frame should register tab targets after wheel surface targets")
	}
}

func TestSelectableListModalRegistersSemanticRailTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.interaction.beginHitFrame()
	railSelection := -1
	items := make([]modalListItem, 0, 8)
	for i := 0; i < 8; i++ {
		items = append(items, modalListItem{
			id:       "list:item:" + itoa2(i),
			title:    "Item " + itoa2(i),
			selected: i == 2,
			action:   func(*App) tea.Cmd { return nil },
		})
	}
	win := selectedItemWindow(len(items), 2, 4)
	visibleItems := items[win.start:win.end]
	list := a.modals.renderModalList(visibleItems, modalListOptions{width: 48, rowBudget: 4})

	a.modals.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width: 60,
			title: "List",
		},
		rows:      list.rows,
		list:      list,
		listStart: 0,
		listWidth: 48,
		bodyRows:  4,
		window:    win,
		wheelID:   "selectable:list:wheel",
		railAction: func(_ *App, index int) tea.Cmd {
			railSelection = index
			return nil
		},
	})

	target, ok := findHitTargetForTest(a, "selectable:list:wheel:rail:3")
	if !ok {
		t.Fatal("missing selectable list rail target")
	}
	if _, handled := a.interaction.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled {
		t.Fatal("selectable list rail target did not handle click")
	}
	if railSelection != 7 {
		t.Fatalf("rail selection = %d, want final item index 7", railSelection)
	}
}

func TestSelectableListModalRoutesRowsThroughSharedListRegionWithoutWheel(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.interaction.beginHitFrame()
	clicked := false
	list := modalListRender{
		rows: []string{"  Alpha"},
		hits: []modalListHit{{
			id:     "list:item:alpha",
			row:    0,
			height: 1,
			action: func(*App) tea.Cmd {
				clicked = true
				return nil
			},
		}},
	}

	a.modals.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width: 60,
			title: "List",
		},
		rows:      list.rows,
		list:      list,
		listStart: 0,
		listWidth: 48,
		bodyRows:  1,
	})

	target, ok := findHitTargetForTest(a, "list:item:alpha")
	if !ok {
		t.Fatal("missing selectable list row target")
	}
	if _, ok := findHitTargetForTest(a, "selectable:list:wheel"); ok {
		t.Fatal("selectable list without wheel id should not register a wheel target")
	}
	if _, handled := a.interaction.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("row target should handle click through shared list region, handled=%v clicked=%v", handled, clicked)
	}
}
