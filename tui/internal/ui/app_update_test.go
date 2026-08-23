package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// OOO1: pickAttachIndex chooses the right initial selection given
// AttachSessionID. Tested directly so we don't pay selectSession's
// network timeout per row in the suite.
func TestPickAttachIndex(t *testing.T) {
	cases := []struct {
		name        string
		attach      string
		sessions    []gact.Session
		wantIdx     int
		wantMissing bool
	}{
		{
			name: "no attach defaults to row 0",
			sessions: []gact.Session{
				{ID: "sess_a", Title: "alpha"},
				{ID: "sess_b", Title: "bravo"},
			},
			wantIdx: 0,
		},
		{
			name:   "match by sess_ id",
			attach: "sess_b",
			sessions: []gact.Session{
				{ID: "sess_a", Title: "alpha"},
				{ID: "sess_b", Title: "bravo"},
			},
			wantIdx: 1,
		},
		{
			name:   "match by title",
			attach: "alpha",
			sessions: []gact.Session{
				{ID: "sess_a", Title: "alpha"},
				{ID: "sess_b", Title: "bravo"},
			},
			wantIdx: 0,
		},
		{
			name:   "missing falls back to 0 with flag set",
			attach: "sess_nope",
			sessions: []gact.Session{
				{ID: "sess_a", Title: "alpha"},
			},
			wantIdx:     0,
			wantMissing: true,
		},
		// id-prefix match resolves an 8-char shortened sid.
		{
			name:   "match by id prefix",
			attach: "sess_b",
			sessions: []gact.Session{
				{ID: "sess_aaaa1111", Title: "alpha"},
				{ID: "sess_bbbb2222", Title: "bravo"},
			},
			wantIdx: 1,
		},
		// substring title, case-insensitive.
		{
			name:   "match by title substring (case-insensitive)",
			attach: "REFACTOR",
			sessions: []gact.Session{
				{ID: "sess_a", Title: "fix bug"},
				{ID: "sess_b", Title: "refactor api auth"},
			},
			wantIdx: 1,
		},
		// precedence - exact id beats prefix beats title sub.
		{
			name:   "exact id wins over title substring",
			attach: "sess_b",
			sessions: []gact.Session{
				{ID: "sess_aaaa", Title: "this contains sess_b somehow"},
				{ID: "sess_b", Title: "exact-target"},
			},
			wantIdx: 1,
		},
		// exact title wins over id prefix when both match.
		{
			name:   "exact title beats id prefix",
			attach: "alpha",
			sessions: []gact.Session{
				{ID: "alphabeta", Title: "other"},
				{ID: "sess_x", Title: "alpha"},
			},
			wantIdx: 1,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			a := New("http://test.local")
			a.AttachSessionID = tc.attach
			a.session.sessions = tc.sessions
			gotIdx, gotMissing := a.session.pickAttachIndex()
			if gotIdx != tc.wantIdx {
				t.Errorf("idx: got %d, want %d", gotIdx, tc.wantIdx)
			}
			if gotMissing != tc.wantMissing {
				t.Errorf("missing: got %v, want %v", gotMissing, tc.wantMissing)
			}
		})
	}
}

// IIIII1: Ctrl+Z is now a clean detach - sets DetachedSessionID
// to the current sid + returns tea.Quit. Main reads
// DetachedSessionID after p.Run() returns and prints a reattach
// hint. Replaces the previous LLL8b SIGTSTP suspend.
func TestUpdate_CtrlZDetachesCleanly(t *testing.T) {
	a := newReadyApp(
		[]gact.Session{{ID: "sess_alpha", Title: "alpha", Status: gact.StatusIdle}},
		nil,
	)
	out, cmd := a.Update(tea.KeyPressMsg{Code: 'z', Mod: tea.ModCtrl, Text: ""})
	got := out.(*App)
	if cmd == nil {
		t.Fatalf("expected non-nil cmd from Ctrl+Z")
	}
	if got.DetachedSessionID != "sess_alpha" {
		t.Errorf("expected DetachedSessionID=sess_alpha, got %q", got.DetachedSessionID)
	}
}

// And with no current session selected, Ctrl+Z still detaches
// cleanly (DetachedSessionID empty signals "no reattach hint").
func TestUpdate_CtrlZNoSession(t *testing.T) {
	a := newReadyApp(nil, nil)
	out, cmd := a.Update(tea.KeyPressMsg{Code: 'z', Mod: tea.ModCtrl, Text: ""})
	got := out.(*App)
	if cmd == nil {
		t.Fatalf("expected non-nil cmd from Ctrl+Z")
	}
	if got.DetachedSessionID != "" {
		t.Errorf("expected empty DetachedSessionID with no session, got %q",
			got.DetachedSessionID)
	}
}

// Verify the app responds to Tab without panicking.
func TestUpdate_TabCyclesFocus(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.focus = FocusInput
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyTab})
	got := out.(*App)
	if got.focus != FocusSidebar {
		t.Errorf("after tab from input, focus = %v, want sidebar", got.focus)
	}
}
