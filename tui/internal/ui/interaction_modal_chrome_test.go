package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

func TestRenderModalHeaderKeepsActionButtonsReachable(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	buttons := []menuButton{{
		id:     "sample:close",
		label:  "close",
		action: func(*App) tea.Cmd { return nil },
	}}

	row, buttonCol := a.modals.renderModalHeader("Very long modal title that should truncate", 24, buttons)
	plain := ansi.Strip(row)

	if !strings.Contains(plain, "close") {
		t.Fatalf("header should keep action button visible: %q", plain)
	}
	if strings.Contains(plain, "Very long modal title that should truncate") {
		t.Fatalf("header should truncate title before it collides with buttons: %q", plain)
	}
	if buttonCol <= 0 {
		t.Fatalf("buttonCol = %d, want positive registration column", buttonCol)
	}
}

func TestModalFrameWithSurfaceLayerKeepsHeaderControlsReachable(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.interaction.beginHitFrame()
	closed := false
	tabbed := false
	rendered := a.modals.renderModalFrameWithSurfaceLayer(modalFrameOptions{
		width: 42,
		title: "Layered Modal",
		buttons: []menuButton{{
			id:    "layered:close",
			label: "close",
			action: func(*App) tea.Cmd {
				closed = true
				return nil
			},
		}},
		tabs: []menuTab{{
			id:     "layered-tab",
			label:  "Tab",
			active: true,
			action: func(*App) tea.Cmd {
				tabbed = true
				return nil
			},
		}},
		body: "body",
	}, "layered")

	if _, ok := findHitTargetForTest(a, "layered:surface"); !ok {
		t.Fatal("layered frame should register an opaque modal surface")
	}
	closeTarget, ok := findHitTargetForTest(a, "button:layered:close")
	if !ok {
		t.Fatal("layered frame should register header buttons above the surface")
	}
	if _, handled := a.interaction.activateHitAt(closeTarget.rect.x, closeTarget.rect.y, tea.MouseLeft); !handled || !closed {
		t.Fatalf("layered close button should remain clickable above surface target, handled=%v closed=%v", handled, closed)
	}
	tabTarget, ok := findHitTargetForTest(a, "tab:layered-tab")
	if !ok {
		t.Fatal("layered frame should register tabs above the surface")
	}
	if _, handled := a.interaction.activateHitAt(tabTarget.rect.x, tabTarget.rect.y, tea.MouseLeft); !handled || !tabbed {
		t.Fatalf("layered tab should remain clickable above surface target, handled=%v tabbed=%v", handled, tabbed)
	}
	rect := overlayMouseRect(rendered.modal, a.width, a.height)
	if _, handled := a.interaction.activateHitAt(rect.x+1, rect.y+1, tea.MouseLeft); !handled {
		t.Fatal("non-control click inside layered modal should be absorbed by the surface")
	}
}

func TestModalFrameHeaderButtonsAreUnselectedByDefault(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	buttons := []menuButton{{
		id:     "sample:close",
		label:  "close",
		action: func(*App) tea.Cmd { return nil },
	}}

	row, _ := a.modals.renderModalHeader("Title", 40, buttons)
	unselected := a.modals.renderModalButtons(buttons, -1)
	selected := a.modals.renderModalButtons(buttons, 0)

	if !strings.Contains(row, unselected) {
		t.Fatalf("header should render passive action buttons by default:\nrow=%q\nwant segment=%q", row, unselected)
	}
	if strings.Contains(row, selected) {
		t.Fatalf("header should not render selected button styling unless explicitly requested")
	}
}

func TestModalFrameCanExplicitlyHighlightHeaderButton(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	buttons := []menuButton{
		{id: "quit:close", label: "close", action: func(*App) tea.Cmd { return nil }},
		{id: "quit:no", label: "no", action: func(*App) tea.Cmd { return nil }},
	}

	row, _ := a.modals.renderModalHeaderWithColor("Close the TUI?", 46, buttons, a.Theme.Warning, 1)
	selected := a.modals.renderModalButtons(buttons, 1)

	if !strings.Contains(row, selected) {
		t.Fatalf("explicit button selection should be visible in frame header:\nrow=%q\nwant segment=%q", row, selected)
	}
}

func TestModalButtonsHaveVisibleSpacingAndMatchingHitBoxes(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	if modalButtonSpacing < 3 {
		t.Fatalf("modal button spacing = %d, want at least 3 cells between adjacent action chips", modalButtonSpacing)
	}
	buttons := []menuButton{
		{id: "sample:close", label: "close", action: func(*App) tea.Cmd { return nil }},
		{id: "sample:save", label: "save", action: func(*App) tea.Cmd { return nil }},
	}

	renderedRow, hits := a.modals.renderModalButtonsWithHits(buttons, -1)
	row := ansi.Strip(renderedRow)
	if !strings.Contains(row, "close") || !strings.Contains(row, "save") || strings.Contains(row, "closesave") {
		t.Fatalf("button row should visibly separate adjacent buttons: %q", row)
	}
	if len(hits) != 2 {
		t.Fatalf("button hits = %d, want 2", len(hits))
	}
	if hits[0].id != "button:sample:close" || hits[0].col != 0 || hits[0].width != lipgloss.Width("close")+4 {
		t.Fatalf("unexpected close hit geometry: %+v", hits[0])
	}
	if hits[1].id != "button:sample:save" || hits[1].col != hits[0].width+modalButtonSpacing || hits[1].width != lipgloss.Width("save")+4 {
		t.Fatalf("unexpected save hit geometry: %+v after %+v", hits[1], hits[0])
	}

	a.interaction.beginHitFrame()
	modal := a.modals.renderDefaultModalSurface(48, renderedRow)
	a.interaction.registerModalActionRow(modal, 0, buttons)
	closeTarget, ok := findHitTargetForTest(a, "button:sample:close")
	if !ok {
		t.Fatal("missing close target")
	}
	saveTarget, ok := findHitTargetForTest(a, "button:sample:save")
	if !ok {
		t.Fatal("missing save target")
	}
	if got := saveTarget.rect.x - (closeTarget.rect.x + closeTarget.rect.w); got != modalButtonSpacing {
		t.Fatalf("button hit gap = %d, want %d", got, modalButtonSpacing)
	}
}
