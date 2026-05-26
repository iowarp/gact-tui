package ui

import "testing"

func TestWideModalWidthUsesSharedPolicy(t *testing.T) {
	a := New("http://unused")

	a.width = 180
	if got := a.wideModalWidth(); got != 128 {
		t.Fatalf("wide modal width at 180 = %d, want 128", got)
	}

	a.width = 120
	if got := a.wideModalWidth(); got != 105 {
		t.Fatalf("wide modal width at 120 = %d, want 105", got)
	}

	a.width = 92
	if got := a.wideModalWidth(); got != a.modalWidth() {
		t.Fatalf("wide modal should fall back to standard width on narrow screens, got %d want %d", got, a.modalWidth())
	}
}

func TestLMConfigAndComposeUseSharedWideWidth(t *testing.T) {
	a := New("http://unused")
	a.width = 160
	a.height = 40

	if got := a.lmConfigModalWidth(); got != a.wideModalWidth() {
		t.Fatalf("lm config width = %d, want shared wide width %d", got, a.wideModalWidth())
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
	if rect.w != a.wideModalWidth() {
		t.Fatalf("compose modal width = %d, want shared wide width %d", rect.w, a.wideModalWidth())
	}
	if target.rect.y != rect.y+2 {
		t.Fatalf("compose commit button y = %d, want header row %d", target.rect.y, rect.y+2)
	}
}
