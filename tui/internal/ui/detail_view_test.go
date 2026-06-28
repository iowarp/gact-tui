package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/charmbracelet/x/ansi"
)

func TestDetailModalWidthIsReadableButNotHuge(t *testing.T) {
	a := New("http://unused")
	a.width = 180
	if got := a.modals.detailModalWidth(); got != a.modals.modalWidth() {
		t.Fatalf("detail width = %d, want shared modal width %d", got, a.modals.modalWidth())
	}
	a.width = 120
	if got := a.modals.detailModalWidth(); got != 96 {
		t.Fatalf("medium terminal detail width = %d, want shared width 96", got)
	}
	a.width = 70
	if got := a.modals.detailModalWidth(); got > a.width-8 {
		t.Fatalf("small terminal detail width = %d, should fit width %d", got, a.width)
	}
}

func TestCatalogBackedDetailUsesBackButton(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{kind: catalogKindTools, title: "Tools"}
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{title: "Tool · shell_bash", fullText: "Summary\n  name: shell_bash"}

	out := ansi.Strip(a.View().Content)
	if !strings.Contains(out, "back") {
		t.Fatalf("catalog-backed detail should render visible back button:\n%s", out)
	}
	target, ok := findHitTargetForTest(a, "button:detail:close")
	if !ok {
		t.Fatal("missing semantic detail back/close target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	if cmd != nil {
		t.Fatal("detail back click should not dispatch a command")
	}
	a = model.(*App)
	if a.detail.visible {
		t.Fatal("detail back click should close only the detail overlay")
	}
	if !a.catalog.open || a.catalog.current == nil {
		t.Fatal("detail back click should reveal the catalog browser behind it")
	}
}

func TestFileDetailShowsUploadAffordance(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.session.caps.Capabilities.AttachmentsUpload = true
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{
		title:     "File · README.md",
		messageID: "files",
		fullText:  "path: README.md\n\n# demo",
		localPath: "/tmp/demo/README.md",
	}

	out := ansi.Strip(a.View().Content)
	if !strings.Contains(out, "upload") || !strings.Contains(out, "u upload") {
		t.Fatalf("file detail should expose upload button and key hint:\n%s", out)
	}
	if _, ok := findHitTargetForTest(a, "button:detail:upload"); !ok {
		t.Fatal("missing semantic upload button target")
	}
}

func TestCatalogBackedDetailBlocksBackgroundHits(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
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
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{
		title:    "Tool · shell_bash",
		fullText: strings.Repeat("detail line\n", 20),
	}

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "detail:surface")
	if !ok {
		t.Fatal("missing opaque detail surface hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      surface.rect.x + surface.rect.w/2,
		Y:      surface.rect.y + surface.rect.h/2,
		Button: tea.MouseLeft,
	}))
	if cmd != nil {
		t.Fatal("clicking detail body should not dispatch a command")
	}
	a = model.(*App)
	if !a.detail.visible {
		t.Fatal("clicking detail body should not close detail")
	}
	if a.catalog.current.sel != 0 {
		t.Fatalf("detail surface click leaked into catalog selection, got sel=%d", a.catalog.current.sel)
	}
}

func TestDetailWheelUsesBodyRegionOnly(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{
		title:    "Evidence",
		fullText: strings.Repeat("detail line\n", 40),
	}

	_ = a.View()
	body, ok := findHitTargetForTest(a, "detail:body:wheel")
	if !ok {
		t.Fatal("missing detail body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      body.rect.x,
		Y:      body.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.detail.scroll != 1 {
		t.Fatalf("wheel over detail body should scroll detail, got %d", a.detail.scroll)
	}

	_ = a.View()
	surface, ok := findHitTargetForTest(a, "detail:surface:wheel")
	if !ok {
		t.Fatal("missing detail surface wheel blocker")
	}
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      surface.rect.x + 1,
		Y:      surface.rect.y + 1,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.detail.scroll != 1 {
		t.Fatalf("wheel on detail chrome should not scroll detail, got %d", a.detail.scroll)
	}
}

func TestDetailSectionsRenderConsistentFieldsAndBodies(t *testing.T) {
	rows := appendDetailSection(nil, "Section",
		detailField{"name", "value"},
		detailField{"description", "first\nsecond"},
		detailField{"", "freeform"},
	)
	out := strings.Join(rows, "\n")
	for _, want := range []string{
		"Section",
		"  name: value",
		"  description:",
		"    first",
		"    second",
		"    freeform",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("detail section missing %q:\n%s", want, out)
		}
	}
}

func TestDetailWrappingPreservesIndentedFieldShape(t *testing.T) {
	content := strings.Join(detailFieldRows("api_base", "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1"), "\n")
	wrapped := textutil.Wrap(content, 34)
	lines := strings.Split(wrapped, "\n")
	if len(lines) < 2 {
		t.Fatalf("expected wrapped detail field, got:\n%s", wrapped)
	}
	for _, line := range lines {
		if !strings.HasPrefix(line, "  ") {
			t.Fatalf("wrapped detail line lost field indentation: %q\n%s", line, wrapped)
		}
	}
	if !strings.Contains(wrapped, "api_base:") {
		t.Fatalf("wrapped detail field lost label:\n%s", wrapped)
	}
}

func TestScrollableDetailModalClampsAndRegistersClose(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 36
	a.interaction.beginHitFrame()

	lines := []string{
		"detail line 01",
		"detail line 02",
		"detail line 03",
		"detail line 04",
		"detail line 05",
		"detail line 06",
	}
	rendered := a.modals.renderScrollableDetailModal(scrollableDetailOptions{
		width:   72,
		title:   "Evidence",
		content: strings.Join(lines, "\n"),
		scroll:  99,
		page:    3,
		closeID: "detail:test-close",
	})

	if rendered.scroll != 3 {
		t.Fatalf("scroll = %d, want max clamp 3", rendered.scroll)
	}
	if rendered.window.start != 3 || rendered.window.end != 6 || rendered.window.total != 6 {
		t.Fatalf("window = %+v, want start 3 end 6 total 6", rendered.window)
	}

	plain := ansi.Strip(rendered.modal)
	for _, want := range []string{
		"Evidence",
		"detail line 04",
		"detail line 06",
		"┃",
	} {
		if !strings.Contains(plain, want) {
			t.Fatalf("rendered modal missing %q:\n%s", want, plain)
		}
	}
	if strings.Contains(plain, "line 4") || strings.Contains(plain, "of 6") {
		t.Fatalf("rendered modal should use the side scroll indicator instead of title range text:\n%s", plain)
	}
	if strings.Contains(plain, "detail line 03") {
		t.Fatalf("rendered modal included a line above the clamped window:\n%s", plain)
	}
	if _, ok := findHitTargetForTest(a, "button:detail:test-close"); !ok {
		t.Fatalf("scrollable detail modal did not register close button hit target")
	}
	if _, ok := findHitTargetForTest(a, "button:detail:copy"); !ok {
		t.Fatalf("scrollable detail modal did not register copy button hit target")
	}
}

func TestScrollableDetailCloseButtonAlignsWithSharedFrameHeader(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 36
	a.interaction.beginHitFrame()

	rendered := a.modals.renderScrollableDetailModal(scrollableDetailOptions{
		width:   72,
		title:   "Evidence",
		content: "detail line",
		page:    3,
		closeID: "detail:test-close",
	})

	target, ok := findHitTargetForTest(a, "button:detail:test-close")
	if !ok {
		t.Fatalf("scrollable detail modal did not register close button hit target")
	}
	rect := overlayMouseRect(rendered.modal, a.width, a.height)
	closeLine := -1
	for i, line := range strings.Split(ansi.Strip(rendered.modal), "\n") {
		if strings.Contains(line, "Evidence") && strings.Contains(line, "x") {
			closeLine = i
			break
		}
	}
	if closeLine < 0 {
		t.Fatalf("could not find visible detail header close row in:\n%s", ansi.Strip(rendered.modal))
	}
	if wantY := rect.y + closeLine; target.rect.y != wantY {
		t.Fatalf("detail close button y = %d, want visible header row %d", target.rect.y, wantY)
	}
}

func TestDetailShortPayloadUsesCompactSharedBodyHeight(t *testing.T) {
	short := New("http://unused")
	short.width, short.height = 150, 44
	short.detail.visible = true
	short.detail.ref = &bulkyPartRef{title: "Evidence", fullText: "one\ntwo"}
	shortRect := overlayMouseRect(short.detail.view(), short.width, short.height)
	if shortRect.y != 3 {
		t.Fatalf("short detail top = %d, want shared top row 3", shortRect.y)
	}

	long := New("http://unused")
	long.width, long.height = short.width, short.height
	long.detail.visible = true
	long.detail.ref = &bulkyPartRef{title: "Evidence", fullText: strings.Repeat("detail line\n", 60)}
	longRect := overlayMouseRect(long.detail.view(), long.width, long.height)
	if shortRect.w != longRect.w {
		t.Fatalf("short detail width = %d, long detail width = %d; shared modal width should be stable", shortRect.w, longRect.w)
	}
	if shortRect.h >= longRect.h {
		t.Fatalf("short detail height = %d, want less than long detail height %d", shortRect.h, longRect.h)
	}
	if longRect.y != shortRect.y {
		t.Fatalf("long detail top = %d, want same top as compact detail %d", longRect.y, shortRect.y)
	}
	if longRect.y+longRect.h > long.height-1 {
		t.Fatalf("long detail bottom = %d, want above footer row %d", longRect.y+longRect.h, long.height-1)
	}
}

func TestDetailWrappedContentCacheInvalidatesByWidthAndContent(t *testing.T) {
	a := New("http://unused")
	first := a.conversation.cachedDetailWrappedContent("alpha beta gamma", 8)
	if first == "" {
		t.Fatal("expected wrapped content")
	}
	if got := a.conversation.cachedDetailWrappedContent("alpha beta gamma", 8); got != first {
		t.Fatalf("same content/width should reuse equivalent wrapped content, got %q want %q", got, first)
	}
	wider := a.conversation.cachedDetailWrappedContent("alpha beta gamma", 40)
	if wider == first {
		t.Fatalf("width change should recalculate wrapping, still got %q", wider)
	}
	changed := a.conversation.cachedDetailWrappedContent("alpha beta gamma delta", 40)
	if changed == wider {
		t.Fatalf("content change should recalculate wrapping, still got %q", changed)
	}
}

func TestDetailWrappedContentCacheClearsOnClose(t *testing.T) {
	a := New("http://unused")
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{title: "Evidence", fullText: "alpha beta gamma"}
	_ = a.conversation.cachedDetailWrappedContent(a.detail.ref.fullText, 8)
	if a.detail.wrap.wrapped == "" {
		t.Fatal("expected populated detail wrap cache")
	}
	a.detail.close()
	if a.detail.wrap != (detailWrapCache{}) {
		t.Fatalf("detail wrap cache should clear on close: %+v", a.detail.wrap)
	}
}
