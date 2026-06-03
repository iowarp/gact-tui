package ui

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestRequestCompactCmdUsesSessionSummarizeEndpoint(t *testing.T) {
	var sawSummarize bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/sessions/s1/compact" {
			t.Fatalf("requestCompactCmd should not call stale compact endpoint")
		}
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/s1/summarize":
			sawSummarize = true
			var req map[string]any
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode summarize request: %v", err)
			}
			if req["auto"] != true {
				t.Fatalf("summarize auto = %#v, want true", req["auto"])
			}
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && r.URL.Path == "/v1/sessions/s1":
			_ = json.NewEncoder(w).Encode(gact.Session{
				ID:      "s1",
				Title:   "demo",
				Summary: "Retained the important tool evidence.",
			})
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
	}))
	defer srv.Close()

	msg := requestCompactCmd(client.New(srv.URL), "s1")()
	got, ok := msg.(sessionSummarizedMsg)
	if !ok {
		t.Fatalf("requestCompactCmd returned %#v, want sessionSummarizedMsg", msg)
	}
	if got.err != nil || got.session.ID != "s1" || got.session.Summary == "" {
		t.Fatalf("summary message = %#v", got)
	}
	if !sawSummarize {
		t.Fatal("summarize endpoint was not called")
	}
}

func TestRequestCompactCmdSurfacesSummarizeError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "missing session", http.StatusNotFound)
	}))
	defer srv.Close()

	msg := requestCompactCmd(client.New(srv.URL), "missing")()
	got, ok := msg.(sessionSummarizedMsg)
	if !ok {
		t.Fatalf("requestCompactCmd returned %#v, want sessionSummarizedMsg", msg)
	}
	if got.err == nil {
		t.Fatalf("summary message should carry backend error: %#v", got)
	}
}

func TestRequestCompactCmdSurfacesRefreshError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/s1/summarize":
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && r.URL.Path == "/v1/sessions/s1":
			http.Error(w, "refresh failed", http.StatusBadGateway)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	msg := requestCompactCmd(client.New(srv.URL), "s1")()
	got, ok := msg.(sessionSummarizedMsg)
	if !ok {
		t.Fatalf("requestCompactCmd returned %#v, want sessionSummarizedMsg", msg)
	}
	if got.err == nil {
		t.Fatalf("summary message should carry refresh error: %#v", got)
	}
}

func TestSessionSummarizedMsgUpdatesSessionAndHint(t *testing.T) {
	a := &App{
		c:        client.New("http://example.test"),
		sessions: []gact.Session{{ID: "s1", Title: "demo"}, {ID: "s2", Title: "other"}},
		selected: 0,
		wsID:     "ws_1",
	}
	model, cmd := a.Update(sessionSummarizedMsg{
		sessionID: "s1",
		session: gact.Session{
			ID:      "s1",
			Title:   "demo",
			Summary: "Retained NDP search and plotting evidence for the next turn.",
		},
	})
	a = model.(*App)
	if a.sessions[a.selected].Summary == "" {
		t.Fatalf("selected session summary was not updated: %#v", a.sessions)
	}
	if !strings.Contains(a.transientHint, "Retained NDP search") {
		t.Fatalf("hint = %q, want returned summary", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("summary completion should schedule hint expiry and session reload")
	}
}

func TestSelectedSessionSummaryRendersInSidebar(t *testing.T) {
	a := makeSidebarApp(t, 4)
	a.sessions = []gact.Session{
		{ID: "s1", Title: "demo", Status: gact.StatusIdle, Summary: "Retained NDP and plot evidence for follow-up."},
		{ID: "s2", Title: "other", Status: gact.StatusIdle, Summary: "This should not render while unselected."},
	}
	a.selected = 0

	if rows := a.sidebarSessionRowCount(0); rows != 3 {
		t.Fatalf("selected parent with summary rows = %d, want 3", rows)
	}
	if rows := a.sidebarSessionRowCount(1); rows != 2 {
		t.Fatalf("unselected parent rows = %d, want 2", rows)
	}
	out := ansi.Strip(a.renderSidebar(56, 18))
	if !strings.Contains(out, "summary: Retained NDP and plot evidence") {
		t.Fatalf("selected summary missing from sidebar:\n%s", out)
	}
	if strings.Contains(out, "This should not render") {
		t.Fatalf("unselected summary leaked into sidebar:\n%s", out)
	}
}

func TestSelectedSessionSummaryRowOpensDetail(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.MouseEnabled = true
	a.sessions = []gact.Session{
		{ID: "s1", Title: "demo", Status: gact.StatusIdle, Summary: "Retained NDP and plot evidence for follow-up."},
		{ID: "s2", Title: "other", Status: gact.StatusIdle},
	}
	a.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:session:s1:summary")
	if !ok {
		t.Fatal("missing selected session summary hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("summary detail click should not dispatch backend command")
	}
	if a.focus != FocusSidebar || a.sidebarSectionFocus != sidebarSectionSessions || a.sidebarSectionCursor {
		t.Fatalf("summary click focus = %v section=%v cursor=%v, want sidebar session row", a.focus, a.sidebarSectionFocus, a.sidebarSectionCursor)
	}
	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("summary click should open detail view")
	}
	for _, want := range []string{"Session Summary", "session_id: s1", "title: demo", "summary:", "Retained NDP and plot evidence"} {
		if !strings.Contains(a.detailView.fullText, want) {
			t.Fatalf("summary detail missing %q:\n%s", want, a.detailView.fullText)
		}
	}
}

func TestRightSidebarSessionSummaryRowOpensDetail(t *testing.T) {
	a := makeSidebarApp(t, 2)
	a.MouseEnabled = true
	a.width = 150
	a.height = 36
	a.sessions = []gact.Session{
		{ID: "s1", Title: "demo", Status: gact.StatusIdle, Summary: "Retained NDP and plot evidence for follow-up."},
		{ID: "s2", Title: "other", Status: gact.StatusIdle},
	}
	a.selected = 0
	a.SetSidebarLayout([]string{"context"}, []string{"sessions"})

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:session:right-s1:summary")
	if !ok {
		t.Fatal("missing right sidebar selected session summary hit target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("right summary detail click should not dispatch backend command")
	}
	if a.focus != FocusRightSidebar || a.sidebarSectionFocus != sidebarSectionSessions || a.sidebarSectionCursor {
		t.Fatalf("right summary click focus = %v section=%v cursor=%v, want right sidebar session row", a.focus, a.sidebarSectionFocus, a.sidebarSectionCursor)
	}
	if !a.detailViewOpen || a.detailView == nil || !strings.Contains(a.detailView.fullText, "Retained NDP and plot evidence") {
		t.Fatalf("right summary click should open detail, open=%v detail=%#v", a.detailViewOpen, a.detailView)
	}
}

func TestSessionSummarizedMsgFailureSurfacesError(t *testing.T) {
	a := &App{}
	model, cmd := a.Update(sessionSummarizedMsg{sessionID: "s1", err: errors.New("backend unavailable")})
	a = model.(*App)
	if !strings.Contains(a.transientHint, "summary failed: backend unavailable") {
		t.Fatalf("hint = %q, want backend error", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("failure should schedule hint expiry")
	}
}
