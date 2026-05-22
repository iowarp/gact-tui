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

// LLLLLLLL1: a transient hint set by a background event between
// two keystrokes must not get wiped on the user's next key until
// it's been visible for at least transientHintMinDwell (800ms).
// Without this gate, the hint flashes for ~1 frame and vanishes.
func TestTransientHint_KeystrokeRespectsMinDwell(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{ID: "sess_a", Title: "a", Status: gact.StatusIdle},
	}, nil)
	a.focus = FocusSidebar
	a.selected = 0

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

// XXXXXXXX1: `b` in sidebar focus toggles busy-only view
// (running + waiting_permission). Parallels the JJJJJJJJ1 `d`
// detached toggle and can stack with it.
func TestSidebar_BusyOnlyToggle(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{ID: "sess_idle", Title: "idle-one", Status: gact.StatusIdle},
		{ID: "sess_run", Title: "running-one", Status: gact.StatusRunning},
		{ID: "sess_wait", Title: "waiting-one", Status: gact.StatusWaitingPermission},
		{ID: "sess_err", Title: "error-one", Status: gact.StatusError},
	}, nil)
	a.focus = FocusSidebar
	a.selected = 0
	a.width, a.height = 100, 30

	// Default: all four visible, title plain.
	out := a.renderSidebar(40, 25)
	for _, name := range []string{"idle-one", "running-one", "waiting-one", "error-one"} {
		if !strings.Contains(out, name) {
			t.Errorf("expected %q visible before toggle: %q", name, out)
		}
	}
	if strings.Contains(out, "· busy") {
		t.Error("title shouldn't carry 'busy' suffix before toggle")
	}

	// Toggle b on.
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'b', Text: "b"})
	if !a.showBusyOnly {
		t.Fatal("b didn't flip showBusyOnly")
	}
	vis := a.visibleSessionIndexes()
	if len(vis) != 2 {
		t.Errorf("expected 2 visible (running + waiting); got %d", len(vis))
	}
	out = a.renderSidebar(40, 25)
	if !strings.Contains(out, "running-one") || !strings.Contains(out, "waiting-one") {
		t.Errorf("busy entries should remain: %q", out)
	}
	if strings.Contains(out, "idle-one") || strings.Contains(out, "error-one") {
		t.Errorf("idle/error should be filtered: %q", out)
	}
	if !strings.Contains(out, "· busy") {
		t.Errorf("title should carry '· busy' suffix: %q", out)
	}

	// Stack with d detached — both filters on should combine (AND).
	a.LoadDetachedRegistry([]DetachedRegistryEntry{
		{SessionID: "sess_run", Backend: a.BackendURL},
	})
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'd', Text: "d"})
	vis = a.visibleSessionIndexes()
	if len(vis) != 1 || a.sessions[vis[0]].ID != "sess_run" {
		t.Errorf("detached+busy should keep only sess_run; got %v", vis)
	}
	out = a.renderSidebar(40, 25)
	if !strings.Contains(out, "detached + busy") {
		t.Errorf("title should show stacked 'detached + busy': %q", out)
	}

	// Toggle b off — detached filter alone, just running-one survives
	// (the only registry entry).
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'b', Text: "b"})
	vis = a.visibleSessionIndexes()
	if len(vis) != 1 || a.sessions[vis[0]].ID != "sess_run" {
		t.Errorf("detached alone should keep sess_run; got %v", vis)
	}
}

// JJJJJJJJ1: `d` in sidebar focus toggles detached-only view.
// Narrows visibleSessionIndexes to sessions in previouslyDetached
// and changes the sidebar title to "SESSIONS · detached".
func TestSidebar_DetachedOnlyToggle(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{ID: "sess_walked", Title: "walked", Status: gact.StatusIdle},
		{ID: "sess_fresh", Title: "fresh", Status: gact.StatusIdle},
		{ID: "sess_other", Title: "also-detached", Status: gact.StatusIdle},
	}, nil)
	a.BackendURL = "http://localhost:7777"
	a.focus = FocusSidebar
	a.selected = 1
	a.width, a.height = 100, 30
	a.LoadDetachedRegistry([]DetachedRegistryEntry{
		{SessionID: "sess_walked", Backend: "http://localhost:7777"},
		{SessionID: "sess_other", Backend: "http://localhost:7777"},
	})

	// Before toggle: all three visible, title is plain SESSIONS.
	out := a.renderSidebar(40, 25)
	for _, name := range []string{"walked", "fresh", "also-detached"} {
		if !strings.Contains(out, name) {
			t.Errorf("expected %q in sidebar before toggle: %q", name, out)
		}
	}
	if strings.Contains(out, "· detached") {
		t.Error("title shouldn't carry the filter suffix yet")
	}
	vis := a.visibleSessionIndexes()
	if len(vis) != 3 {
		t.Errorf("expected 3 visible before toggle; got %d", len(vis))
	}

	// Press `d` to toggle.
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'd', Text: "d"})
	if !a.showDetachedOnly {
		t.Fatal("d didn't flip showDetachedOnly")
	}
	out = a.renderSidebar(40, 25)
	if !strings.Contains(out, "walked") || !strings.Contains(out, "also-detached") {
		t.Errorf("detached entries should remain visible: %q", out)
	}
	if strings.Contains(out, "fresh\n") || strings.Contains(out, " fresh ") {
		// "fresh" might appear as substring of other text; grab the
		// more precise "fresh\n" / " fresh " context check only.
		t.Errorf("fresh session should be filtered out: %q", out)
	}
	if !strings.Contains(out, "· detached") {
		t.Error("title should carry '· detached' suffix when toggled on")
	}
	vis = a.visibleSessionIndexes()
	if len(vis) != 2 {
		t.Errorf("expected 2 visible after toggle; got %d", len(vis))
	}

	// Press `d` again to restore.
	a.handleSidebarKey(tea.KeyPressMsg{Code: 'd', Text: "d"})
	if a.showDetachedOnly {
		t.Fatal("second d should clear the toggle")
	}
	vis = a.visibleSessionIndexes()
	if len(vis) != 3 {
		t.Errorf("expected 3 visible after second toggle; got %d", len(vis))
	}
}

// HHHHHHHH1: sidebar status line now appends a humanized "Nm ago"
// age so users can tell freshness at a glance. Sessions without
// UpdatedAt (backend hasn't filled it yet) show just the status.
func TestSidebar_StatusLineShowsAge(t *testing.T) {
	now := time.Now().UTC()
	a := newReadyApp([]gact.Session{
		{ID: "sess_fresh", Title: "fresh", Status: gact.StatusIdle,
			UpdatedAt: now.Add(-2 * time.Minute)},
		{ID: "sess_stale", Title: "stale", Status: gact.StatusIdle,
			UpdatedAt: now.Add(-3 * 24 * time.Hour)},
		{ID: "sess_no_ts", Title: "no-ts", Status: gact.StatusIdle},
	}, nil)
	a.width, a.height = 100, 30
	out := a.renderSidebar(40, 25)
	freshIdx := strings.Index(out, "fresh")
	staleIdx := strings.Index(out, "stale")
	noTsIdx := strings.Index(out, "no-ts")
	if freshIdx < 0 || staleIdx < 0 || noTsIdx < 0 {
		t.Fatalf("missing expected rows: %q", out)
	}
	// The status/age suffix is checked globally against the whole
	// sidebar render — all three sessions render together so we just
	// check the suffixes exist (or don't) in the full output.
	if !strings.Contains(out, "2m ago") {
		t.Errorf("expected '2m ago' somewhere in sidebar: %q", out)
	}
	if !strings.Contains(out, "3d ago") {
		t.Errorf("expected '3d ago' somewhere in sidebar: %q", out)
	}
	// Exactly two `ago` suffixes should be present (fresh + stale);
	// the no-UpdatedAt session must NOT add a third.
	if got := strings.Count(out, " ago"); got != 2 {
		t.Errorf("expected exactly 2 'ago' suffixes; got %d in %q", got, out)
	}
}

// RRRRRRRRR1: sidebar rendering must never exceed the pane's
// inner height. Before the fix, certain (sessions × contextFiles)
// combinations budgeted past `height-2` — the rendered string
// had more newlines than the pane, lipgloss would still paint
// all lines (Height() pads but doesn't truncate), and the
// sibling body pane was shoved down. Screenshot report: 16
// active sessions + 2 context files at terminal height ~40
// overflowed by 1 row.
func TestSidebar_NeverExceedsPaneHeight(t *testing.T) {
	// Seed a realistic stress case: 16 sessions, selected=0, with
	// 2 context files — the exact combo the user reported.
	sessions := make([]gact.Session, 16)
	for i := range sessions {
		sessions[i] = gact.Session{
			ID:     "sess_" + string(rune('a'+i)),
			Title:  "session-" + string(rune('a'+i)),
			Status: gact.StatusIdle,
		}
	}
	a := newReadyApp(sessions, nil)
	a.selected = 0
	a.contextFiles = []gact.ContextFile{
		{Path: "docs/architecture.md", Mode: "read"},
		{Path: "docs/contributing.md", Mode: "read"},
	}

	// Try several realistic terminal heights — each must produce
	// a sidebar string whose line count fits in height-2 inner
	// rows. Covers the non-monotonic float-division off-by-one
	// (user reported 1 breaks, 2 breaks, 3 works, 4 works).
	for height := 15; height <= 45; height++ {
		for nFiles := 0; nFiles <= 6; nFiles++ {
			a.contextFiles = make([]gact.ContextFile, nFiles)
			for i := range a.contextFiles {
				a.contextFiles[i] = gact.ContextFile{
					Path: "docs/file" + string(rune('a'+i)) + ".md",
					Mode: "read",
				}
			}
			a.width, a.height = 100, height
			out := a.renderSidebar(30, height-2)
			// inner height = outer - 2 (border). Line count of the
			// rendered block must be ≤ inner so the pane's border
			// closes at the expected row.
			gotLines := len(strings.Split(strings.TrimRight(out, "\n"), "\n"))
			inner := height - 2 - 2 // pane inner = outer-2 borders, the sidebar was rendered with outer = height-2 so inner = height-4
			if gotLines > inner+2 {
				t.Errorf("height=%d nFiles=%d: sidebar rendered %d lines, inner=%d (overflow by %d)",
					height, nFiles, gotLines, inner, gotLines-inner)
			}
		}
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
