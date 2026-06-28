package ui

import (
	"strconv"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestCatalogRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentDetail,
		title: "Agent detail",
		items: []catalogItem{
			{id: "summary", title: "Summary", desc: "long summary row consumes an extra visual line"},
			{id: "handoffs", title: "Handoffs", desc: "routes to downstream experts"},
		},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "catalog:item:1")
	if !ok {
		t.Fatal("missing semantic catalog item target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("catalog row click should open detail view")
	}
	if a.detail.ref.title != "Handoffs" {
		t.Fatalf("detail title = %q, want Handoffs", a.detail.ref.title)
	}
}

func TestCatalogRowTargetsAlignWithSharedFrameBody(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{
			{id: "one", title: "One", desc: "first tool"},
			{id: "two", title: "Two", desc: "second tool"},
		},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "catalog:item:0")
	if !ok {
		t.Fatal("missing semantic first catalog target")
	}
	rect := overlayMouseRect(a.catalog.view(), a.width, a.height)
	introRows := 0
	if catalogBrowserIntro(a.catalog.current.kind) != "" {
		introRows = 2
	}
	if wantY := rect.y + 2 + 2 + introRows; target.rect.y != wantY {
		t.Fatalf("first catalog row y = %d, want shared frame body row %d", target.rect.y, wantY)
	}
}

func TestCatalogModalRegistersOpaqueSurface(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentBlueprints,
		title: "Agent Blueprints",
		items: []catalogItem{
			{id: "seismic-waveform-review", title: "Seismic Waveform Review", desc: "workspace blueprint"},
			{id: "ndp-environmental-hazards", title: "NDP Environmental Hazards", desc: "marketplace blueprint"},
		},
	}

	view := a.View().Content
	headerLine := ""
	for _, line := range strings.Split(view, "\n") {
		if strings.Contains(line, "Agent Blueprints") {
			headerLine = line
			break
		}
	}
	if headerLine == "" {
		t.Fatalf("catalog header not found in view:\n%s", stripANSI(view))
	}
	if bg := "48;2;25;25;35"; strings.Count(headerLine, bg) < 2 {
		t.Fatalf("catalog header gaps should carry modal background escapes, got %d in %q", strings.Count(headerLine, bg), headerLine)
	}
	surface, ok := findHitTargetForTest(a, "catalog:surface")
	if !ok {
		t.Fatal("catalog browser should register an opaque modal surface target")
	}
	rect := overlayMouseRect(a.catalog.view(), a.width, a.height)
	if surface.rect.x != rect.x || surface.rect.y != rect.y || surface.rect.w != rect.w || surface.rect.h != rect.h {
		t.Fatalf("catalog surface rect = %+v, want modal rect %+v", surface.rect, rect)
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 1,
		Y:      rect.y + 1,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("opaque catalog surface should absorb non-control clicks without dispatching commands")
	}
	if !a.catalog.open {
		t.Fatal("opaque catalog surface click should not close the catalog browser")
	}
}

func TestCatalogShortListsUseCompactSharedBodyHeight(t *testing.T) {
	short := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	short.width = 150
	short.height = 44
	short.stage = StageReady
	short.catalog.open = true
	short.catalog.current = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{
			{id: "one", title: "One", desc: "first tool"},
			{id: "two", title: "Two", desc: "second tool"},
		},
	}
	shortRect := overlayMouseRect(short.catalog.view(), short.width, short.height)
	if shortRect.y != 3 {
		t.Fatalf("short catalog top = %d, want shared top row 3", shortRect.y)
	}

	long := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	long.width = short.width
	long.height = short.height
	long.stage = StageReady
	long.catalog.open = true
	long.catalog.current = &catalogBrowserState{kind: catalogKindTools, title: "Tools"}
	for i := 0; i < catalogBrowserBodyRows+4; i++ {
		long.catalog.current.items = append(long.catalog.current.items, catalogItem{
			id:    "tool-" + strconv.Itoa(i),
			title: "Tool " + strconv.Itoa(i),
			desc:  "tool metadata",
		})
	}
	longRect := overlayMouseRect(long.catalog.view(), long.width, long.height)
	if shortRect.w != longRect.w {
		t.Fatalf("short catalog width = %d, long catalog width = %d; shared modal width should be stable", shortRect.w, longRect.w)
	}
	if shortRect.h >= longRect.h {
		t.Fatalf("short catalog height = %d, want less than overflowing long catalog height %d", shortRect.h, longRect.h)
	}
	if longRect.y != shortRect.y {
		t.Fatalf("long catalog top = %d, want same top as compact catalog %d", longRect.y, shortRect.y)
	}
}

func TestCatalogNonRowClickDoesNotChooseByCoordinates(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentDetail,
		title: "Agent detail",
		items: []catalogItem{
			{id: "summary", title: "Summary", desc: "long summary row consumes an extra visual line"},
			{id: "handoffs", title: "Handoffs", desc: "routes to downstream experts"},
		},
	}

	_ = a.View()
	rect := overlayMouseRect(a.catalog.view(), a.width, a.height)
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + 5,
		Y:      rect.y + 2 + 10,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("non-row click inside catalog should not dispatch")
	}
	if !a.catalog.open {
		t.Fatal("non-row click inside catalog should keep browser open")
	}
	if a.detail.visible {
		t.Fatal("non-row click inside catalog should not open detail")
	}
}

func TestCatalogMouseWheelMovesSelectionOnlyOverList(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{
			{id: "one", title: "One"},
			{id: "two", title: "Two"},
			{id: "three", title: "Three"},
		},
	}

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "catalog:surface:wheel")
	if !ok {
		t.Fatal("missing catalog surface wheel blocker")
	}
	target, ok := findHitTargetForTest(a, "catalog:list:wheel")
	if !ok {
		t.Fatal("missing semantic catalog list wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.catalog.current.sel != 1 {
		t.Fatalf("wheel over list should move catalog selection, got %d", a.catalog.current.sel)
	}

	_ = a.View()
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      surface.rect.x + surface.rect.w - 2,
		Y:      surface.rect.y + 2,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.catalog.current.sel != 1 {
		t.Fatalf("wheel outside list should not move catalog selection, got %d", a.catalog.current.sel)
	}
}

func TestAgentBlueprintCatalogMouseWheelWorksAcrossBody(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalog.open = true
	items := make([]catalogItem, 0, 18)
	for i := 0; i < 18; i++ {
		items = append(items, catalogItem{
			id:    "blueprint-" + itoa2(i),
			title: "Blueprint " + itoa2(i),
			desc:  "workspace markdown agent blueprint",
		})
	}
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentBlueprints,
		title: "Agent Blueprints",
		items: items,
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "catalog:list:wheel:body:wheel")
	if !ok {
		t.Fatal("missing full-body blueprint catalog wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x + target.rect.w - 2,
		Y:      target.rect.y + target.rect.h - 1,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.catalog.current.sel != 1 {
		t.Fatalf("wheel over blueprint catalog body should move selection, got %d", a.catalog.current.sel)
	}
}

func TestAgentBlueprintCatalogInstallShortcutOpensInstallFlow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgentBlueprints,
		title: "Agent Blueprints",
		items: []catalogItem{{id: "seismic", title: "Seismic Marketplace"}},
	}

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "button:agent-blueprints:install"); ok {
		t.Fatal("top-level blueprint catalog should not render management action buttons in the list body")
	}

	model, _ := a.Update(keyMsg("i"))
	a = model.(*App)
	if !a.agentBlueprintManage.open || a.agentBlueprintManage.mode != agentBlueprintManageInstall {
		t.Fatalf("pressing i should open install flow, open=%v mode=%q", a.agentBlueprintManage.open, a.agentBlueprintManage.mode)
	}
}

func TestCatalogCloseButtonUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{{id: "shell_bash", title: "shell_bash"}},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:catalog:close")
	if !ok {
		t.Fatal("missing semantic catalog close button target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("catalog close button should not dispatch a command")
	}
	if a.catalog.open || a.catalog.current != nil {
		t.Fatalf("catalog close button should close browser, open=%v browser=%v", a.catalog.open, a.catalog.current)
	}
}

func TestCatalogBackButtonUsesSemanticHitTarget(t *testing.T) {
	parent := &catalogBrowserState{
		kind:  catalogKindMcp,
		title: "MCP Connections",
		items: []catalogItem{{id: "mcp_fs", title: "Filesystem"}},
	}
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:   catalogKindMcpDetail,
		title:  "MCP detail",
		parent: parent,
		items:  []catalogItem{{id: "summary", title: "Summary"}},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:catalog:back")
	if !ok {
		t.Fatal("missing semantic catalog back button target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("catalog back button should not dispatch a command")
	}
	if !a.catalog.open {
		t.Fatal("catalog back button should keep browser open")
	}
	if a.catalog.current != parent {
		t.Fatalf("catalog back button should restore parent browser, got %#v", a.catalog.current)
	}
}
