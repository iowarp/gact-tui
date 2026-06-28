package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestCatalogBrowserScrollsSelectionIntoView(t *testing.T) {
	a := newReadyApp(nil, nil)
	items := make([]catalogItem, 20)
	for i := range items {
		items[i] = catalogItem{id: itoa2(i), title: "item-" + itoa2(i)}
	}
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindSkills,
		title: "Skills",
		items: items,
		sel:   0,
	}
	for i := 0; i < 15; i++ {
		_, _ = a.catalog.handleKey(tea.KeyPressMsg{Code: tea.KeyDown})
	}

	if a.catalog.current.offset == 0 {
		t.Fatal("catalog browser offset did not move after selection passed visible budget")
	}
	out := a.catalog.view()
	if !strings.Contains(out, "item-15") {
		t.Fatalf("selected item not visible after scrolling:\n%s", out)
	}
	if strings.Contains(out, "item-0") {
		t.Fatalf("top item still visible after scrolling past viewport:\n%s", out)
	}
}

func TestCatalogBrowserUsesSharedScrollRailInsteadOfRangeRows(t *testing.T) {
	a := newReadyApp(nil, nil)
	items := make([]catalogItem, 30)
	for i := range items {
		items[i] = catalogItem{id: itoa2(i), title: "item-" + itoa2(i)}
	}
	a.width = 120
	a.height = 36
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindSkills,
		title: "Skills",
		items: items,
		sel:   14,
	}
	a.catalog.current.offset = catalogBrowserClampOffset(a.catalog.current.sel, a.catalog.current.offset, len(items))

	out := stripANSI(a.catalog.view())
	if !strings.Contains(out, "┃") {
		t.Fatalf("long catalog should render a shared side scroll rail:\n%s", out)
	}
	for _, notWant := range []string{"above", "and ", " more"} {
		if strings.Contains(out, notWant) {
			t.Fatalf("catalog should not render textual scroll count %q:\n%s", notWant, out)
		}
	}
}

func TestAgentBlueprintCatalogScrollsSelectionIntoViewWithRail(t *testing.T) {
	a := newReadyApp(nil, nil)
	items := make([]catalogItem, 32)
	for i := range items {
		items[i] = catalogItem{
			id:        "blueprint-" + itoa2(i),
			title:     "Blueprint " + itoa2(i),
			desc:      "source grouped blueprint used to prove long blueprint libraries scroll cleanly",
			statusTag: "source",
		}
	}
	a.width = 120
	a.height = 36
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentBlueprints,
		title: "Agent Blueprints",
		items: items,
		sel:   18,
	}
	a.catalog.current.offset = catalogBrowserClampOffsetForKind(a.catalog.current.kind, a.catalog.current.sel, a.catalog.current.offset, len(items))

	out := stripANSI(a.catalog.view())
	if !strings.Contains(out, "Blueprint 18") {
		t.Fatalf("selected blueprint should remain visible after scrolling:\n%s", out)
	}
	if strings.Contains(out, "Blueprint 0") {
		t.Fatalf("top blueprint should be clipped after scrolling:\n%s", out)
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("long blueprint catalog should render a shared side scroll rail:\n%s", out)
	}
	for _, notWant := range []string{"above", "and ", " more"} {
		if strings.Contains(out, notWant) {
			t.Fatalf("blueprint catalog should not render textual scroll count %q:\n%s", notWant, out)
		}
	}
}
