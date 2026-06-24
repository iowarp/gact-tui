package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

func TestModalListRendersDescriptionRowsIntoOneHit(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	rendered := a.modals.renderModalList([]modalListItem{{
		id:          "row:alpha",
		title:       "alpha",
		description: "long description that should wrap onto more than one rendered row so mouse hits cover the whole item",
		selected:    true,
		action:      func(*App) tea.Cmd { return nil },
	}}, modalListOptions{width: 36, rowBudget: 4, descriptionLines: 2})

	if len(rendered.rows) != 3 {
		t.Fatalf("rows = %d, want title plus two description rows: %#v", len(rendered.rows), rendered.rows)
	}
	if len(rendered.hits) != 1 {
		t.Fatalf("hits = %d, want one item hit", len(rendered.hits))
	}
	if rendered.hits[0].id != "row:alpha" || rendered.hits[0].row != 0 || rendered.hits[0].height != 3 {
		t.Fatalf("hit = %+v, want one hit spanning all rendered rows", rendered.hits[0])
	}
}

func TestModalListDescriptionContinuationDoesNotDoubleIndent(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	rendered := a.modals.renderModalList([]modalListItem{{
		id:          "row:alpha",
		title:       "alpha",
		description: "alpha beta gamma delta epsilon zeta eta theta iota",
		action:      func(*App) tea.Cmd { return nil },
	}}, modalListOptions{width: 24, rowBudget: 4, descriptionLines: 2})

	if len(rendered.rows) < 3 {
		t.Fatalf("rows = %d, want wrapped description rows: %#v", len(rendered.rows), rendered.rows)
	}
	for i, row := range rendered.rows[1:] {
		plain := ansi.Strip(row)
		if strings.HasPrefix(plain, "    ") {
			t.Fatalf("description row %d double-indented: %q", i+1, plain)
		}
		if lipgloss.Width(plain) > 24 {
			t.Fatalf("description row %d width = %d, want <= 24: %q", i+1, lipgloss.Width(plain), plain)
		}
	}
}

func TestModalListTreeDescriptionAlignsWithNestedTitle(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	rendered := a.modals.renderModalList([]modalListItem{{
		id:          "row:child",
		title:       "│   └─ EarthScope Catalog",
		description: "reports to Geospatial Resolver · catalog metadata_found · 2 tools",
		action:      func(*App) tea.Cmd { return nil },
	}}, modalListOptions{width: 84, rowBudget: 3, descriptionLines: 1})

	if len(rendered.rows) < 2 {
		t.Fatalf("rows = %d, want title and description: %#v", len(rendered.rows), rendered.rows)
	}
	desc := ansi.Strip(rendered.rows[1])
	if !strings.HasPrefix(desc, "         reports to") {
		t.Fatalf("nested description should align under child row, got %q", desc)
	}
	if strings.Contains(desc, "1.1.1") {
		t.Fatalf("nested description should not repeat hierarchy index: %q", desc)
	}
}

func TestModalListSupportsCustomSelectedMarker(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	rendered := a.modals.renderModalList([]modalListItem{{
		id:             "row:current",
		title:          "current",
		selected:       true,
		selectedMarker: "✓ ",
		action:         func(*App) tea.Cmd { return nil },
	}}, modalListOptions{width: 24, rowBudget: 1})

	if len(rendered.rows) != 1 {
		t.Fatalf("rows = %d, want one row", len(rendered.rows))
	}
	if got := ansi.Strip(rendered.rows[0]); !strings.Contains(got, "✓ current") {
		t.Fatalf("custom selected marker not rendered: %q", got)
	}
}

func TestModalListRegionRegistersWheelAndRowHits(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 100
	a.height = 30
	a.interaction.beginHitFrame()
	rowClicked := false
	wheeled := false
	modal := a.modals.renderDefaultModalSurface(48, "Title\n\nalpha\n  details")
	list := modalListRender{
		rows: []string{"alpha", "  details"},
		hits: []modalListHit{{
			id:     "list:item:alpha",
			row:    0,
			height: 2,
			action: func(*App) tea.Cmd {
				rowClicked = true
				return nil
			},
		}},
	}

	a.interaction.registerModalListRegion(modal, 2, 0, 42, list, "list:wheel", func(*App, tea.MouseButton) tea.Cmd {
		wheeled = true
		return nil
	})

	rowTarget, ok := findHitTargetForTest(a, "list:item:alpha")
	if !ok {
		t.Fatal("missing list row hit target")
	}
	if _, handled := a.interaction.activateHitAt(rowTarget.rect.x, rowTarget.rect.y+1, tea.MouseLeft); !handled || !rowClicked {
		t.Fatalf("list row hit should span rendered description rows, handled=%v clicked=%v", handled, rowClicked)
	}
	wheelTarget, ok := findHitTargetForTest(a, "list:wheel")
	if !ok {
		t.Fatal("missing list wheel target")
	}
	if _, handled := a.interaction.activateWheelHitAt(wheelTarget.rect.x, wheelTarget.rect.y, tea.MouseWheelDown); !handled || !wheeled {
		t.Fatalf("list wheel hit should activate, handled=%v wheeled=%v", handled, wheeled)
	}
}
