package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

func TestModalWheelRegionRegistersRelativeToContent(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.interaction.beginHitFrame()
	wheeled := false
	modal := a.modals.renderDefaultModalSurface(48, "Title\n\nscrollable box")

	a.interaction.registerModalWheelRegion(modal, "box:wheel", 2, 4, 16, 3, func(*App, tea.MouseButton) tea.Cmd {
		wheeled = true
		return nil
	})

	target, ok := findHitTargetForTest(a, "box:wheel")
	if !ok {
		t.Fatal("missing modal wheel region target")
	}
	rect := overlayMouseRect(modal, a.width, a.height)
	if target.rect.x != rect.x+3+4 || target.rect.y != rect.y+2+2 || target.rect.w != 16 || target.rect.h != 3 {
		t.Fatalf("wheel rect = %+v, want render-relative region", target.rect)
	}
	if _, handled := a.interaction.activateWheelHitAt(target.rect.x, target.rect.y, tea.MouseWheelDown); !handled || !wheeled {
		t.Fatalf("modal wheel region should activate, handled=%v wheeled=%v", handled, wheeled)
	}
}

func TestModalCellHitsRegisterRelativeToBody(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.interaction.beginHitFrame()
	clicked := false
	modal := a.modals.renderDefaultModalSurface(48, "Title\n\ncontrol  ◀ value ▶")

	a.interaction.registerModalCellHits(modal, 2, []modalCellHit{{
		id:    "cell:inc",
		row:   1,
		col:   17,
		width: 3,
		action: func(*App) tea.Cmd {
			clicked = true
			return nil
		},
	}})

	target, ok := findHitTargetForTest(a, "cell:inc")
	if !ok {
		t.Fatal("missing modal cell hit target")
	}
	if _, handled := a.interaction.activateHitAt(target.rect.x, target.rect.y, tea.MouseLeft); !handled || !clicked {
		t.Fatalf("modal cell hit should activate, handled=%v clicked=%v", handled, clicked)
	}
}

func TestModalCellHitsSupportColumnOffsets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.interaction.beginHitFrame()
	modal := a.modals.renderDefaultModalSurface(40, "abc")
	a.interaction.registerModalCellHitsAt(modal, 1, 7, []modalCellHit{{
		id:     "cell:offset",
		row:    2,
		col:    3,
		width:  4,
		height: 1,
		action: func(*App) tea.Cmd { return nil },
	}})

	target, ok := findHitTargetForTest(a, "cell:offset")
	if !ok {
		t.Fatal("missing offset cell hit")
	}
	rect := overlayMouseRect(modal, a.width, a.height)
	wantX := rect.x + 3 + 7 + 3
	wantY := rect.y + 2 + 1 + 2
	if target.rect.x != wantX || target.rect.y != wantY {
		t.Fatalf("offset target rect = %+v, want x=%d y=%d", target.rect, wantX, wantY)
	}
}

func TestModalInlineOptionsRenderActiveChipAndHits(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	clicked := ""
	row, hits := a.modals.renderModalInlineOptions("mode: ", []modalInlineOption{{
		id:    "mode:read",
		label: "read",
		action: func(*App) tea.Cmd {
			clicked = "read"
			return nil
		},
	}, {
		id:     "mode:edit",
		label:  "edit",
		active: true,
		action: func(*App) tea.Cmd {
			clicked = "edit"
			return nil
		},
	}})

	plain := ansi.Strip(row)
	if !strings.Contains(plain, "mode:  read  edit ") {
		t.Fatalf("inline options row = %q", plain)
	}
	if len(hits) != 2 {
		t.Fatalf("hit count = %d, want 2", len(hits))
	}
	if hits[1].id != "mode:edit" || hits[1].col <= hits[0].col || hits[1].width != lipgloss.Width(" edit ") {
		t.Fatalf("unexpected edit hit geometry: %+v after %+v", hits[1], hits[0])
	}
	if hits[1].action == nil {
		t.Fatal("missing edit action")
	}
	_ = hits[1].action(a)
	if clicked != "edit" {
		t.Fatalf("clicked = %q, want edit", clicked)
	}
}

func TestModalButtonsRenderAndRegisterWithSameLabels(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	buttons := []menuButton{
		{id: "primary", label: "apply", action: func(*App) tea.Cmd { return nil }},
		{id: "cancel", label: "cancel", action: func(*App) tea.Cmd { return nil }},
	}
	row, hits := a.modals.renderModalButtonsWithHits(buttons, 0)
	if !strings.Contains(ansi.Strip(row), "apply") || !strings.Contains(ansi.Strip(row), "cancel") {
		t.Fatalf("button row did not render labels: %q", ansi.Strip(row))
	}
	if len(hits) != 2 {
		t.Fatalf("button hits = %d, want 2", len(hits))
	}
	if hits[0].id != "button:primary" || hits[0].col != 0 || hits[0].width != lipgloss.Width("apply")+4 {
		t.Fatalf("unexpected primary hit geometry: %+v", hits[0])
	}
	if hits[1].id != "button:cancel" || hits[1].col != hits[0].width+modalButtonSpacing || hits[1].width != lipgloss.Width("cancel")+4 {
		t.Fatalf("unexpected cancel hit geometry: %+v after %+v", hits[1], hits[0])
	}
	modal := a.modals.renderDefaultModalSurface(50, row)
	a.interaction.beginHitFrame()
	a.interaction.registerModalButtons(modal, 0, 0, buttons)
	if _, ok := findHitTargetForTest(a, "button:primary"); !ok {
		t.Fatal("missing primary button hit")
	}
	if _, ok := findHitTargetForTest(a, "button:cancel"); !ok {
		t.Fatal("missing cancel button hit")
	}
}

func TestCenteredModalButtonsUseSharedGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	buttons := []menuButton{
		{id: "save", label: "Save and connect", action: func(*App) tea.Cmd { return nil }},
	}
	row, startCol := a.modals.renderCenteredModalButtons(40, buttons, -1)
	if !strings.Contains(ansi.Strip(row), "Save and connect") {
		t.Fatalf("centered button row did not render label: %q", ansi.Strip(row))
	}
	buttonW := lipgloss.Width(a.modals.renderModalButtons(buttons, -1))
	if startCol != (40-buttonW)/2 {
		t.Fatalf("centered button col = %d, want %d", startCol, (40-buttonW)/2)
	}
	modal := a.modals.renderDefaultModalSurface(50, row)
	a.interaction.beginHitFrame()
	a.interaction.registerModalButtons(modal, 0, startCol, buttons)
	target, ok := findHitTargetForTest(a, "button:save")
	if !ok {
		t.Fatal("missing centered button hit")
	}
	rect := overlayMouseRect(modal, a.width, a.height)
	if target.rect.x != rect.x+3+startCol {
		t.Fatalf("centered button hit x = %d, want %d", target.rect.x, rect.x+3+startCol)
	}
}

func TestDisabledModalButtonsDoNotRegisterHits(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	buttons := []menuButton{
		{id: "disabled", label: "apply", disabled: true, action: func(*App) tea.Cmd { return nil }},
	}
	row, hits := a.modals.renderModalButtonsWithHits(buttons, -1)
	if !strings.Contains(ansi.Strip(row), "apply") {
		t.Fatalf("disabled button should still render its label: %q", ansi.Strip(row))
	}
	if len(hits) != 0 {
		t.Fatalf("disabled button hits = %d, want none", len(hits))
	}
}

func TestSideScrollIndicatorSharedRailRendering(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	lines := []string{"alpha", "beta", "gamma", "delta"}
	got, ok := a.modals.renderSideScrollIndicator(lines, 8, scrollWindow{start: 3, end: 7, total: 12})
	if !ok {
		t.Fatal("expected shared side rail to render for overflowed content")
	}
	plain := ansi.Strip(strings.Join(got, "\n"))
	if !strings.Contains(plain, "│") || !strings.Contains(plain, "┃") {
		t.Fatalf("shared side rail should render track and thumb:\n%s", plain)
	}
	if strings.Contains(strings.Join(lines, "\n"), "┃") {
		t.Fatal("shared side rail should not mutate the input lines")
	}

	unchanged, ok := a.modals.renderSideScrollIndicator(lines, 8, scrollWindow{start: 0, end: 4, total: 4})
	if ok {
		t.Fatal("non-overflowing content should not render a rail")
	}
	if strings.Join(unchanged, "\n") != strings.Join(lines, "\n") {
		t.Fatalf("non-overflowing lines changed: %#v", unchanged)
	}
}

func TestModalActionRowAppendsAndRegistersConsistently(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	buttons := []menuButton{
		{id: "save", label: "save", action: func(*App) tea.Cmd { return nil }},
		{id: "cancel", label: "cancel", action: func(*App) tea.Cmd { return nil }},
	}
	rows, row := a.modals.appendModalActionRow([]string{"title", ""}, buttons, 1)
	if row != 2 {
		t.Fatalf("action row = %d, want appended row index 2", row)
	}
	if got := ansi.Strip(rows[row]); !strings.Contains(got, "save") || !strings.Contains(got, "cancel") {
		t.Fatalf("action row did not render labels: %q", got)
	}
	modal := a.modals.renderDefaultModalSurface(50, strings.Join(rows, "\n"))
	a.interaction.beginHitFrame()
	a.interaction.registerModalActionRow(modal, row, buttons)
	if _, ok := findHitTargetForTest(a, "button:save"); !ok {
		t.Fatal("missing save button hit")
	}
	if _, ok := findHitTargetForTest(a, "button:cancel"); !ok {
		t.Fatal("missing cancel button hit")
	}
}

func TestModalTabsRenderAndRegisterWithSameLabels(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	tabs := []menuTab{
		{id: "one", label: "One", active: true, action: func(*App) tea.Cmd { return nil }},
		{id: "two", label: "Two", action: func(*App) tea.Cmd { return nil }},
	}
	row, hits := a.modals.renderModalTabsWithHits(tabs, 1, 0)
	if !strings.Contains(ansi.Strip(row), "One") || !strings.Contains(ansi.Strip(row), "Two") {
		t.Fatalf("tab row did not render labels: %q", ansi.Strip(row))
	}
	if len(hits) != 2 {
		t.Fatalf("tab hits = %d, want 2", len(hits))
	}
	if hits[0].id != "tab:one" || hits[0].col != 0 || hits[0].width != lipgloss.Width("One")+2 {
		t.Fatalf("unexpected first tab hit: %+v", hits[0])
	}
	if hits[1].id != "tab:two" || hits[1].col != hits[0].width || hits[1].width != lipgloss.Width("Two")+2 {
		t.Fatalf("unexpected second tab hit: %+v after %+v", hits[1], hits[0])
	}
	modal := a.modals.renderDefaultModalSurface(50, row)
	a.interaction.beginHitFrame()
	a.interaction.registerModalTabsWithLayout(modal, 0, tabs, 1, 0)
	if _, ok := findHitTargetForTest(a, "tab:one"); !ok {
		t.Fatal("missing first tab hit")
	}
	if _, ok := findHitTargetForTest(a, "tab:two"); !ok {
		t.Fatal("missing second tab hit")
	}
}

func TestModalFrameRegistersHeaderButtonsAndTabs(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.interaction.beginHitFrame()

	buttons := []menuButton{{
		id:     "frame:close",
		label:  "close",
		action: func(*App) tea.Cmd { return nil },
	}}
	tabs := []menuTab{
		{id: "frame-one", label: "One", active: true, action: func(*App) tea.Cmd { return nil }},
		{id: "frame-two", label: "Two", action: func(*App) tea.Cmd { return nil }},
	}
	rendered := a.modals.renderModalFrameWithLayout(modalFrameOptions{
		width:      64,
		title:      "Frame Title",
		buttons:    buttons,
		tabs:       tabs,
		tabPadding: 1,
		tabSpacing: 0,
		body:       "primary body",
		footer:     "footer hint",
	})

	if rendered.bodyRow != 4 {
		t.Fatalf("bodyRow = %d, want 4 after title, spacer, tabs, spacer", rendered.bodyRow)
	}
	if rendered.footerRow <= rendered.bodyRow {
		t.Fatalf("footerRow = %d should follow bodyRow %d", rendered.footerRow, rendered.bodyRow)
	}

	plain := ansi.Strip(rendered.modal)
	for _, want := range []string{"Frame Title", "close", "One", "Two", "primary body", "footer hint"} {
		if !strings.Contains(plain, want) {
			t.Fatalf("modal frame missing %q:\n%s", want, plain)
		}
	}
	if _, ok := findHitTargetForTest(a, "button:frame:close"); !ok {
		t.Fatal("missing frame close button hit target")
	}
	if _, ok := findHitTargetForTest(a, "tab:frame-two"); !ok {
		t.Fatal("missing frame tab hit target")
	}
}
