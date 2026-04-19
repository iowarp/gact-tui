package ui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

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
	// EEEEE1: default name is generated from go-figure (slant font).
	// Hard-coding the exact glyphs would couple this test to the
	// font choice; assert the splash has a multi-line ASCII-art block
	// (≥ 4 rows of forward-slash ornament from the slant font).
	if strings.Count(out, "/") < 8 {
		t.Errorf("expected slant-style ASCII art in splash: %q", out)
	}
}

// UUU1: sidebar shows `(N tasks)` badge when the session has open
// tasks. Counts pending+running; completed/failed don't count.
func TestSidebar_TaskBadge(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{ID: "sess_1", Title: "with-tasks", Status: gact.StatusIdle},
		{ID: "sess_2", Title: "no-tasks", Status: gact.StatusIdle},
	}, nil)
	a.taskCountBySession = map[string]int{"sess_1": 3}
	a.width, a.height = 100, 30
	out := a.renderSidebar(40, 25)
	if !strings.Contains(out, "(3 tasks)") {
		t.Errorf("expected (3 tasks) badge in sidebar: %q", out)
	}
	// no-tasks session should NOT have a badge.
	noBadge := strings.Index(out, "no-tasks")
	if noBadge < 0 {
		t.Fatalf("no-tasks session not rendered: %q", out)
	}
	// Strip the with-tasks line, check the no-tasks line doesn't
	// contain "tasks)".
	tail := out[noBadge:]
	if eol := strings.IndexByte(tail, '\n'); eol > 0 {
		tail = tail[:eol]
	}
	if strings.Contains(tail, "tasks)") {
		t.Errorf("no-tasks session shouldn't show badge: %q", tail)
	}
}

// UUU1: sessionTasksLoadedMsg counts only pending+running, ignores
// completed/failed.
func TestSessionTasksLoaded_OnlyOpenCount(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.taskCountBySession = map[string]int{}
	out, _ := a.Update(sessionTasksLoadedMsg{
		sessionID: "sess_x",
		tasks: []gact.SessionTask{
			{ID: "1", Status: "pending"},
			{ID: "2", Status: "running"},
			{ID: "3", Status: "completed"},
			{ID: "4", Status: "failed"},
		},
	})
	got := out.(*App)
	if got.taskCountBySession["sess_x"] != 2 {
		t.Errorf("expected 2 open tasks, got %d", got.taskCountBySession["sess_x"])
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
