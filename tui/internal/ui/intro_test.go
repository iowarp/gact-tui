package ui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// TestEnableIntro_FlipsStage checks that EnableIntro switches the
// initial stage to StageIntro.
func TestEnableIntro_FlipsStage(t *testing.T) {
	a := New("http://test.local")
	if a.stage != StageConnecting {
		t.Fatalf("default stage should be StageConnecting, got %v", a.stage)
	}
	a.EnableIntro()
	if a.stage != StageIntro {
		t.Errorf("after EnableIntro, stage = %v, want StageIntro", a.stage)
	}
	// Init should NOT fire connectCmd while in StageIntro. It MAY
	// fire the MMMMMMMMM1 introTickCmd that drives the animated
	// GRC logo, but that cmd never produces a connectedMsg so the
	// splash-before-connect invariant still holds. Actual runtime
	// dispatch of the tick is covered by splash-dismiss tests below.
	_ = a.Init()
}

// TestSplashKeyDismisses simulates pressing a key during the splash
// and checks that the stage advances to StageConnecting.
func TestSplashKeyDismisses(t *testing.T) {
	a := New("http://test.local")
	a.EnableIntro()
	a.width, a.height = 80, 24

	// Any non-Ctrl+C keypress should dismiss.
	out, _ := a.Update(tea.KeyPressMsg{Code: 'a', Text: "a"})
	got := out.(*App)
	if got.stage != StageConnecting {
		t.Errorf("after key press, stage = %v, want StageConnecting", got.stage)
	}
}

func TestSplashClickDismissesThroughSemanticTarget(t *testing.T) {
	a := New("http://test.local")
	a.EnableIntro()
	a.MouseEnabled = true
	a.width, a.height = 80, 24

	_ = a.View()
	target, ok := findHitTargetForTest(a, "intro:continue")
	if !ok {
		t.Fatal("missing intro continue hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.stage != StageConnecting {
		t.Fatalf("stage after intro click = %v, want connecting", a.stage)
	}
	if cmd == nil {
		t.Fatal("intro click should dispatch connect command")
	}
}

// TestViewIntro_RendersDefaults checks the splash output includes
// the baked-in name + a "press any key" hint when no custom file
// was loaded.
func TestViewIntro_RendersDefaults(t *testing.T) {
	a := New("http://test.local")
	a.EnableIntro()
	a.width, a.height = 80, 24
	out := a.viewIntro()
	if !strings.Contains(out, "press any key") {
		t.Errorf("expected 'press any key' hint in splash: %q", out)
	}
	// EEEEE1: default name is generated from go-figure (slant font).
	// Hard-coding the exact glyphs would couple this test to the
	// font choice; assert the splash has a multi-line ASCII-art block
	// (≥ 4 rows of forward-slash ornament from the slant font).
	if strings.Count(out, "/") < 8 {
		t.Errorf("expected slant-style ASCII art in splash: %q", out)
	}
}

func TestViewIntro_CompactHeightDoesNotOverflow(t *testing.T) {
	for _, height := range []int{6, 10, 16} {
		a := New("http://test.local")
		a.EnableIntro()
		a.width, a.height = 80, height

		renderedHeight := len(strings.Split(ansi.Strip(a.viewIntro()), "\n"))
		if renderedHeight > height {
			t.Fatalf("intro height at terminal height %d = %d", height, renderedHeight)
		}
	}
}

// EEEEEEEE1: empty-state callout (no session selected) surfaces
// the detached count + resume hint when the user has detached
// sessions on this server.
func TestEmptyState_DetachedResumeHint(t *testing.T) {
	a := newReadyApp([]gact.Session{}, nil)
	a.BackendURL = "http://localhost:7777"
	a.width, a.height = 140, 30
	// Without detached → no hint.
	out := a.conversation.render(a.width-40, a.height-3)
	if strings.Contains(out, "gact attach") || strings.Contains(out, "detached session(s)") {
		// note: the existing crib already mentions Ctrl+Z and `gact
		// attach <sid>`, so check for the EEEEEEEE1 phrase explicitly.
		if strings.Contains(out, "detached session(s) on this server") {
			t.Errorf("empty resume hint should not appear when none detached: %q", out)
		}
	}
	// Two detached → resume hint appears with count.
	a.LoadDetachedRegistry([]DetachedRegistryEntry{
		{SessionID: "sess_a", Backend: "http://localhost:7777"},
		{SessionID: "sess_b", Backend: "http://localhost:7777"},
	})
	out = a.conversation.render(a.width-40, a.height-3)
	if !strings.Contains(out, "↩ 2 detached session(s) on this server") {
		t.Errorf("resume hint missing or wrong count: %q", out)
	}
	if !strings.Contains(out, "gact attach") {
		t.Errorf("resume hint should mention gact attach: %q", out)
	}
}

// LLLLLLLL1: a transient hint set by a background event between
// two keystrokes must not get wiped on the user's next key until
// it's been visible for at least transientHintMinDwell (800ms).
// Without this gate, the hint flashes for ~1 frame and vanishes.
func TestTransientHint_KeystrokeRespectsMinDwell(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{ID: "sess_a", Title: "a", Status: gact.StatusIdle},
	}, nil)
	a.focus = FocusSidebar
	a.session.selected = 0

	// Simulate the "background event sets hint" flow: a prior
	// Update cycle assigned transientHint. The LLLLLLLL1 deferred
	// stamp runs at the end of each Update, so we simulate it
	// manually here (the test is synchronous — no scheduler tick).
	a.transientHint = "background toast"
	a.transientHintAt = time.Now() // "just rendered"

	// First keystroke within the dwell window should NOT clear.
	a.Update(tea.KeyPressMsg{Code: tea.KeyTab})
	if a.transientHint == "" {
		t.Error("keystroke within dwell window cleared the hint; flicker risk")
	}

	// Fast-forward past the dwell window by rewinding the stamp.
	a.transientHintAt = time.Now().Add(-2 * transientHintMinDwell)

	// Now a keystroke should clear cleanly — the hint had its time.
	a.Update(tea.KeyPressMsg{Code: tea.KeyTab})
	if a.transientHint != "" {
		t.Errorf("keystroke after dwell didn't clear the hint: %q", a.transientHint)
	}
	if !a.transientHintAt.IsZero() {
		t.Error("transientHintAt should reset when hint clears")
	}
}

// MMM8b: SetPlugins flattens manifests + paletteMatches surfaces
// the plugin commands alongside backend ones with Source="plugin".
func TestPlugins_PaletteMerge(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.SetPlugins([]PluginsLoaded{
		{
			Name:      "git-pr",
			SourceDir: "/tmp/plugin",
			Commands: []PluginsCommand{
				{ID: "/pr", Title: "Open PR", Command: "/bin/true"},
				{ID: "/pr-list", Title: "List PRs", Command: "/bin/true"},
			},
		},
	})
	all := a.cmdPalette.matches()
	hits := 0
	for _, c := range all {
		if c.Source == "plugin" && (c.ID == "/pr" || c.ID == "/pr-list") {
			hits++
		}
	}
	if hits != 2 {
		t.Errorf("expected 2 plugin commands in palette, got %d", hits)
	}
	// Filter narrows correctly.
	a.cmdPalette.paletteFilter = "list"
	filtered := a.cmdPalette.matches()
	for _, c := range filtered {
		if c.ID == "/pr" {
			t.Errorf("filter 'list' should exclude /pr; got %v", filtered)
		}
	}
	// findCommand returns the right tuple.
	pc := a.plugins.findCommand("/pr")
	if pc == nil || pc.Command != "/bin/true" {
		t.Errorf("plugins.findCommand: %+v", pc)
	}
}

// TestSetIntroFromFile_OverridesDefaults loads a custom splash file
// and verifies it appears in the rendered output.
func TestSetIntroFromFile_OverridesDefaults(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "intro.txt")
	body := "[CUSTOM-LOGO]\n" +
		"\n" +
		"[CUSTOM-NAME]\n"
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	a := New("http://test.local")
	if err := a.SetIntroFromFile(path); err != nil {
		t.Fatalf("SetIntroFromFile: %v", err)
	}
	a.EnableIntro()
	a.width, a.height = 80, 24
	out := a.viewIntro()
	if !strings.Contains(out, "[CUSTOM-LOGO]") || !strings.Contains(out, "[CUSTOM-NAME]") {
		t.Errorf("expected custom logo+name in splash: %q", out)
	}
}
