package ui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
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
	// Init should NOT fire connectCmd while in StageIntro.
	if cmd := a.Init(); cmd != nil {
		t.Errorf("Init() in StageIntro should return nil; got non-nil cmd")
	}
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
	// Default name has G/A/C/T glyphs — check for one distinctive char.
	if !strings.Contains(out, "/_\\") {
		t.Errorf("expected default G ASCII art in splash: %q", out)
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
	all := a.paletteMatches()
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
	a.paletteFilter = "list"
	filtered := a.paletteMatches()
	for _, c := range filtered {
		if c.ID == "/pr" {
			t.Errorf("filter 'list' should exclude /pr; got %v", filtered)
		}
	}
	// findPluginCommand returns the right tuple.
	pc := a.findPluginCommand("/pr")
	if pc == nil || pc.Command != "/bin/true" {
		t.Errorf("findPluginCommand: %+v", pc)
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
