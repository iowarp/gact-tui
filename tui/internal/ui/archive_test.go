package ui

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// makeArchiveApp builds an App pointed at a spy PATCH server. The
// spy captures the body so tests can assert the archived=true flag
// was actually sent.
func makeArchiveApp(t *testing.T) (*App, *atomic.Bool) {
	t.Helper()
	var gotArchiveTrue atomic.Bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch && strings.HasPrefix(r.URL.Path, "/v1/sessions/") {
			buf, _ := io.ReadAll(r.Body)
			var body struct {
				Archived *bool `json:"archived"`
			}
			_ = json.Unmarshal(buf, &body)
			if body.Archived != nil && *body.Archived {
				gotArchiveTrue.Store(true)
			}
			_, _ = w.Write([]byte(`{"id":"whatever","archived":true}`))
			return
		}
		// SSE open for selectSession after archive — respond OK and close.
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	a := New(srv.URL)
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.focus = FocusSidebar
	a.sessions = []gact.Session{
		{ID: "s1", Title: "first"},
		{ID: "s2", Title: "second"},
		{ID: "s3", Title: "third"},
	}
	a.selected = 1 // middle — tests archive-at-selected path
	return a, &gotArchiveTrue
}

func TestArchive_CapitalAFromSidebarDispatchesPATCH(t *testing.T) {
	a, gotArchive := makeArchiveApp(t)
	_, cmd := a.handleSidebarKey(tea.KeyPressMsg{Code: 'A', Text: "A", Mod: tea.ModShift})
	if cmd == nil {
		t.Fatal("A should dispatch archiveSessionCmd")
	}
	msg := cmd()
	archived, ok := msg.(sessionArchivedMsg)
	if !ok {
		t.Fatalf("cmd returned %T, want sessionArchivedMsg", msg)
	}
	if archived.err != nil {
		t.Errorf("unexpected err: %v", archived.err)
	}
	if archived.sessionID != "s2" {
		t.Errorf("sessionID = %q, want s2", archived.sessionID)
	}
	if !gotArchive.Load() {
		t.Error("PATCH body should have archived=true")
	}
}

func TestArchive_SuccessRemovesFromSidebarAndPicksPrevious(t *testing.T) {
	a, _ := makeArchiveApp(t) // selected=1 (s2)

	model, _ := a.Update(sessionArchivedMsg{sessionID: "s2"})
	a = model.(*App)

	if len(a.sessions) != 2 {
		t.Errorf("sessions len = %d, want 2", len(a.sessions))
	}
	for _, s := range a.sessions {
		if s.ID == "s2" {
			t.Errorf("s2 should be gone, still present: %+v", a.sessions)
		}
	}
	// Previous sibling (s1) is visually less disorienting than jumping
	// down to what used to be s3.
	if a.selected != 0 {
		t.Errorf("selected = %d, want 0 (previous sibling)", a.selected)
	}
	if a.sessions[0].ID != "s1" {
		t.Errorf("sessions[0] = %+v, want s1", a.sessions[0])
	}
	if !strings.Contains(a.transientHint, "archived") {
		t.Errorf("hint = %q, want 'archived' confirmation", a.transientHint)
	}
}

func TestArchive_AboveSelectedDecrementsIndex(t *testing.T) {
	// If we archive a session ABOVE the selected one, selection
	// index must shift down by 1 so the same session stays focused.
	a, _ := makeArchiveApp(t)
	a.selected = 2 // s3 selected
	model, _ := a.Update(sessionArchivedMsg{sessionID: "s1"})
	a = model.(*App)

	if a.selected != 1 {
		t.Errorf("selected after archiving above = %d, want 1", a.selected)
	}
	if a.sessions[a.selected].ID != "s3" {
		t.Errorf("should still be on s3, got %+v", a.sessions[a.selected])
	}
}

func TestArchive_LastSessionClearsSelection(t *testing.T) {
	a, _ := makeArchiveApp(t)
	a.sessions = []gact.Session{{ID: "only"}}
	a.selected = 0

	model, _ := a.Update(sessionArchivedMsg{sessionID: "only"})
	a = model.(*App)

	if len(a.sessions) != 0 {
		t.Errorf("sessions should be empty, got %+v", a.sessions)
	}
	if a.selected != -1 {
		t.Errorf("selected = %d, want -1 when no sessions left", a.selected)
	}
	if a.currentStatus != "" {
		t.Errorf("currentStatus = %q, want empty", a.currentStatus)
	}
}

func TestArchive_FailureShowsHintNotStageError(t *testing.T) {
	a, _ := makeArchiveApp(t)
	model, _ := a.Update(sessionArchivedMsg{
		sessionID: "s2",
		err:       errors.New("backend is grumpy"),
	})
	a = model.(*App)

	if a.stage == StageError {
		t.Error("archive failure should not promote to StageError")
	}
	if len(a.sessions) != 3 {
		t.Errorf("sessions len = %d, want 3 (unchanged on failure)", len(a.sessions))
	}
	if !strings.Contains(a.transientHint, "archive failed") {
		t.Errorf("hint = %q, want 'archive failed' message", a.transientHint)
	}
}

func TestArchive_UnknownSessionIgnored(t *testing.T) {
	// Stale archived event for a session we don't have. Should be a
	// no-op, not panic.
	a, _ := makeArchiveApp(t)
	model, _ := a.Update(sessionArchivedMsg{sessionID: "never_existed"})
	a = model.(*App)
	if len(a.sessions) != 3 {
		t.Errorf("sessions should be unchanged, got %+v", a.sessions)
	}
}
