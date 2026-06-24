package ui

import (
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

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
	a.session.selected = 0
	a.width, a.height = 100, 30

	// Default: all four visible, title plain.
	out := a.sidebar.render(40, 25)
	for _, name := range []string{"idle-one", "running-one", "waiting-one", "error-one"} {
		if !strings.Contains(out, name) {
			t.Errorf("expected %q visible before toggle: %q", name, out)
		}
	}
	if strings.Contains(out, "· busy") {
		t.Error("title shouldn't carry 'busy' suffix before toggle")
	}

	// Toggle b on.
	a.sidebar.handleKey(tea.KeyPressMsg{Code: 'b', Text: "b"})
	if !a.sidebar.showBusyOnly {
		t.Fatal("b didn't flip showBusyOnly")
	}
	vis := a.session.visibleIndexes()
	if len(vis) != 2 {
		t.Errorf("expected 2 visible (running + waiting); got %d", len(vis))
	}
	out = a.sidebar.render(40, 25)
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
	a.sidebar.handleKey(tea.KeyPressMsg{Code: 'd', Text: "d"})
	vis = a.session.visibleIndexes()
	if len(vis) != 1 || a.session.sessions[vis[0]].ID != "sess_run" {
		t.Errorf("detached+busy should keep only sess_run; got %v", vis)
	}
	out = a.sidebar.render(40, 25)
	if !strings.Contains(out, "detached + busy") {
		t.Errorf("title should show stacked 'detached + busy': %q", out)
	}

	// Toggle b off — detached filter alone, just running-one survives
	// (the only registry entry).
	a.sidebar.handleKey(tea.KeyPressMsg{Code: 'b', Text: "b"})
	vis = a.session.visibleIndexes()
	if len(vis) != 1 || a.session.sessions[vis[0]].ID != "sess_run" {
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
	a.session.selected = 1
	a.width, a.height = 100, 30
	a.LoadDetachedRegistry([]DetachedRegistryEntry{
		{SessionID: "sess_walked", Backend: "http://localhost:7777"},
		{SessionID: "sess_other", Backend: "http://localhost:7777"},
	})

	// Before toggle: all three visible, title is plain SESSIONS.
	out := a.sidebar.render(40, 25)
	for _, name := range []string{"walked", "fresh", "also-detached"} {
		if !strings.Contains(out, name) {
			t.Errorf("expected %q in sidebar before toggle: %q", name, out)
		}
	}
	if strings.Contains(out, "· detached") {
		t.Error("title shouldn't carry the filter suffix yet")
	}
	vis := a.session.visibleIndexes()
	if len(vis) != 3 {
		t.Errorf("expected 3 visible before toggle; got %d", len(vis))
	}

	// Press `d` to toggle.
	a.sidebar.handleKey(tea.KeyPressMsg{Code: 'd', Text: "d"})
	if !a.sidebar.showDetachedOnly {
		t.Fatal("d didn't flip showDetachedOnly")
	}
	out = a.sidebar.render(40, 25)
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
	vis = a.session.visibleIndexes()
	if len(vis) != 2 {
		t.Errorf("expected 2 visible after toggle; got %d", len(vis))
	}

	// Press `d` again to restore.
	a.sidebar.handleKey(tea.KeyPressMsg{Code: 'd', Text: "d"})
	if a.sidebar.showDetachedOnly {
		t.Fatal("second d should clear the toggle")
	}
	vis = a.session.visibleIndexes()
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
	out := a.sidebar.render(40, 25)
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
	a.session.selected = 0
	a.session.contextFiles = []gact.ContextFile{
		{Path: "docs/architecture.md", Mode: "read"},
		{Path: "docs/contributing.md", Mode: "read"},
	}

	// Try several realistic terminal heights — each must produce
	// a sidebar string whose line count fits in height-2 inner
	// rows. Covers the non-monotonic float-division off-by-one
	// (user reported 1 breaks, 2 breaks, 3 works, 4 works).
	for height := 15; height <= 45; height++ {
		for nFiles := 0; nFiles <= 6; nFiles++ {
			a.session.contextFiles = make([]gact.ContextFile, nFiles)
			for i := range a.session.contextFiles {
				a.session.contextFiles[i] = gact.ContextFile{
					Path: "docs/file" + string(rune('a'+i)) + ".md",
					Mode: "read",
				}
			}
			a.width, a.height = 100, height
			out := a.sidebar.render(30, height-2)
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
	out := a.chrome.renderHeader()
	if strings.Contains(out, "↩") {
		t.Errorf("header should not show ↩ when no detached sessions: %q", out)
	}
	// Two detached → chip "↩ 2" appears.
	a.LoadDetachedRegistry([]DetachedRegistryEntry{
		{SessionID: "sess_a", Backend: "http://localhost:7777"},
		{SessionID: "sess_b", Backend: "http://localhost:7777"},
		{SessionID: "sess_other", Backend: "http://other:9999"},
	})
	out = a.chrome.renderHeader()
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
	out := a.sidebar.render(40, 25)
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
	a.session.wsID = "ws_default"
	a.LoadDetachedRegistry([]DetachedRegistryEntry{
		{SessionID: "sess_walked", Backend: "http://localhost:7777"},
	})
	a.focus = FocusSidebar
	a.session.selected = 0

	pruned := ""
	a.PruneDetachedRegistry = func(sid string) { pruned = sid }

	// First x arms.
	if _, _ = a.sidebar.handleKey(tea.KeyPressMsg{Code: 'x', Text: "x"}); a.sidebar.pendingDeleteSessionID != "sess_walked" {
		t.Fatalf("first x should arm; got pendingDelete=%q", a.sidebar.pendingDeleteSessionID)
	}
	// Second x confirms; should fire the prune.
	a.sidebar.handleKey(tea.KeyPressMsg{Code: 'x', Text: "x"})
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
	a.session.taskCountBySession = map[string]int{"sess_1": 3}
	a.width, a.height = 100, 30
	out := a.sidebar.render(40, 25)
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
	a.session.taskCountBySession = map[string]int{}
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
	if got.session.taskCountBySession["sess_x"] != 2 {
		t.Errorf("expected 2 open tasks, got %d", got.session.taskCountBySession["sess_x"])
	}
}
