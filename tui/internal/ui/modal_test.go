package ui

import (
	"strings"
	"testing"
)

func TestModalWidthsUseSingleSharedPolicy(t *testing.T) {
	a := New("http://unused")

	a.width = 180
	if got := a.wideModalWidth(); got != a.modalWidth() {
		t.Fatalf("wide modal width at 180 = %d, want shared width %d", got, a.modalWidth())
	}
	a.width = 120
	if got := a.detailModalWidth(); got != a.modalWidth() {
		t.Fatalf("detail modal width at 120 = %d, want shared width %d", got, a.modalWidth())
	}
	a.width = 92
	if got := a.wideModalWidth(); got != a.modalWidth() {
		t.Fatalf("wide modal should fall back to standard width on narrow screens, got %d want %d", got, a.modalWidth())
	}
}

func TestOverlayTopIsStableAcrossModalHeights(t *testing.T) {
	a := New("http://unused")
	a.width = 120
	a.height = 40

	short := a.renderModalFrame(modalFrameOptions{width: a.modalWidth(), title: "Short", body: "one"})
	tall := a.renderModalFrame(modalFrameOptions{width: a.modalWidth(), title: "Tall", body: strings.Repeat("row\n", 12)})

	shortRect := overlayMouseRect(short, a.width, a.height)
	tallRect := overlayMouseRect(tall, a.width, a.height)
	if shortRect.x != tallRect.x {
		t.Fatalf("modal x positions differ: short=%d tall=%d", shortRect.x, tallRect.x)
	}
	if shortRect.y != tallRect.y {
		t.Fatalf("modal y positions differ: short=%d tall=%d", shortRect.y, tallRect.y)
	}
	if shortRect.y != 3 {
		t.Fatalf("modal top = %d, want fixed top row 3", shortRect.y)
	}
}

func TestLMConfigAndComposeUseSharedWidth(t *testing.T) {
	a := New("http://unused")
	a.width = 160
	a.height = 40

	if got := a.lmConfigModalWidth(); got != a.modalWidth() {
		t.Fatalf("lm config width = %d, want shared width %d", got, a.modalWidth())
	}

	a.stage = StageReady
	a.input.SetValue("hello")
	a.openCompose()
	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:compose:commit")
	if !ok {
		t.Fatal("missing compose commit button hit target")
	}
	view := a.viewCompose()
	rect := overlayMouseRect(view, a.width, a.height)
	if rect.w != a.modalWidth() {
		t.Fatalf("compose modal width = %d, want shared width %d", rect.w, a.modalWidth())
	}
	if target.rect.y != rect.y+2 {
		t.Fatalf("compose commit button y = %d, want header row %d", target.rect.y, rect.y+2)
	}
}

func TestPadModalBodyKeepsShortTabbedViewsStable(t *testing.T) {
	got := padModalBody("one\ntwo", 4)
	if strings.Count(got, "\n")+1 != 4 {
		t.Fatalf("padded body rows = %d, want 4 in %q", strings.Count(got, "\n")+1, got)
	}
	if got := padModalBody("one\ntwo\nthree", 2); got != "one\ntwo\nthree" {
		t.Fatalf("pad should not truncate long bodies, got %q", got)
	}
}
