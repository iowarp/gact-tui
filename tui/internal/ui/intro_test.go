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

// EEEEEEEE1: empty-state callout (no session selected) surfaces
// the detached count + resume hint when the user has detached
// sessions on this backend.
func TestEmptyState_DetachedResumeHint(t *testing.T) {
	a := newReadyApp([]gact.Session{}, nil)
	a.BackendURL = "http://localhost:7777"
	a.width, a.height = 140, 30
	// Without detached → no hint.
	out := a.renderBody(a.width-40, a.height-3)
	if strings.Contains(out, "gact attach") || strings.Contains(out, "detached session(s)") {
		// note: the existing crib already mentions Ctrl+Z and `gact
		// attach <sid>`, so check for the EEEEEEEE1 phrase explicitly.
		if strings.Contains(out, "detached session(s) on this backend") {
			t.Errorf("empty resume hint should not appear when none detached: %q", out)
		}
	}
	// Two detached → resume hint appears with count.
	a.LoadDetachedRegistry([]DetachedRegistryEntry{
		{SessionID: "sess_a", Backend: "http://localhost:7777"},
		{SessionID: "sess_b", Backend: "http://localhost:7777"},
	})
	out = a.renderBody(a.width-40, a.height-3)
	if !strings.Contains(out, "↩ 2 detached session(s) on this backend") {
		t.Errorf("resume hint missing or wrong count: %q", out)
	}
	if !strings.Contains(out, "gact attach") {
		t.Errorf("resume hint should mention gact attach: %q", out)
	}
}

// DDDDDDDD1: header carries a `↩ N` chip when the user has
// detached sessions on the current backend. Hidden when N=0.
func TestHeader_DetachedChip(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{ID: "sess_a", Title: "a", Status: gact.StatusIdle},
	}, nil)
	a.BackendURL = "http://localhost:7777"
	a.width, a.height = 140, 30
	// No detached → no chip.
	out := a.renderHeader()
	if strings.Contains(out, "↩") {
		t.Errorf("header should not show ↩ when no detached sessions: %q", out)
	}
	// Two detached → chip "↩ 2" appears.
	a.LoadDetachedRegistry([]DetachedRegistryEntry{
		{SessionID: "sess_a", Backend: "http://localhost:7777"},
		{SessionID: "sess_b", Backend: "http://localhost:7777"},
		{SessionID: "sess_other", Backend: "http://other:9999"},
	})
	out = a.renderHeader()
	if !strings.Contains(out, "↩ 2") {
		t.Errorf("header should show ↩ 2 chip; got %q", out)
	}
}

// BBBBBBBB1: sidebar shows ↩ marker when the user previously
// detached from a session (loaded from the local registry at
// startup). Filters by backend so cross-backend entries don't
// leak into the wrong sidebar.
func TestSidebar_DetachedMarker(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{ID: "sess_walked", Title: "walked-away", Status: gact.StatusIdle},
		{ID: "sess_fresh", Title: "fresh", Status: gact.StatusIdle},
	}, nil)
	a.BackendURL = "http://localhost:7777"
	a.LoadDetachedRegistry([]DetachedRegistryEntry{
		{SessionID: "sess_walked", Backend: "http://localhost:7777"},
		{SessionID: "sess_other_backend", Backend: "http://other:9999"},
	})
	a.width, a.height = 100, 30
	out := a.renderSidebar(40, 25)
	walkedIdx := strings.Index(out, "walked-away")
	freshIdx := strings.Index(out, "fresh")
	if walkedIdx < 0 || freshIdx < 0 {
		t.Fatalf("expected both sessions rendered: %q", out)
	}
	walkedLine := out[walkedIdx:]
	if eol := strings.IndexByte(walkedLine, '\n'); eol > 0 {
		walkedLine = walkedLine[:eol]
	}
	if !strings.Contains(walkedLine, "↩") {
		t.Errorf("walked-away should carry ↩ marker: %q", walkedLine)
	}
	freshLine := out[freshIdx:]
	if eol := strings.IndexByte(freshLine, '\n'); eol > 0 {
		freshLine = freshLine[:eol]
	}
	if strings.Contains(freshLine, "↩") {
		t.Errorf("fresh session should NOT carry marker: %q", freshLine)
	}
}

// BBBBBBBB1: deleting a marked session (x/x in the sidebar) prunes
// the in-memory set and fires the prune callback so the registry
// stays in sync.
func TestSidebar_DeletePrunesDetached(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{ID: "sess_walked", Title: "walked-away", Status: gact.StatusIdle},
	}, nil)
	a.BackendURL = "http://localhost:7777"
	a.wsID = "ws_default"
	a.LoadDetachedRegistry([]DetachedRegistryEntry{
		{SessionID: "sess_walked", Backend: "http://localhost:7777"},
	})
	a.focus = FocusSidebar
	a.selected = 0

	pruned := ""
	a.PruneDetachedRegistry = func(sid string) { pruned = sid }

	// First x arms.
	if _, _ = a.handleSidebarKey(tea.KeyPressMsg{Code: 'x', Text: "x"}); a.pendingDeleteSessionID != "sess_walked" {
		t.Fatalf("first x should arm; got pendingDelete=%q", a.pendingDeleteSessionID)
	}
	// Second x confirms; should fire the prune.
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'x', Text: "x"})
	if pruned != "sess_walked" {
		t.Errorf("PruneDetachedRegistry not called; pruned=%q", pruned)
	}
	if a.previouslyDetached["sess_walked"] {
		t.Error("in-memory set should drop the deleted sid")
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
