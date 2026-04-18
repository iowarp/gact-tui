package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// makeArchivedViewApp returns an App whose httptest server answers
// /v1/sessions with either an "active" list or an "archived" list
// depending on the `archived=true` query param. Lets tests drive the
// `h` toggle through a real HTTP round-trip.
func makeArchivedViewApp(t *testing.T) *App {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/sessions" {
			archived := r.URL.Query().Get("archived") == "true"
			var sessions []map[string]any
			if archived {
				sessions = []map[string]any{
					{"id": "arch1", "title": "old thing", "workspace_id": "ws_a"},
					{"id": "arch2", "title": "older thing", "workspace_id": "ws_a"},
				}
			} else {
				sessions = []map[string]any{
					{"id": "live1", "title": "current", "workspace_id": "ws_a"},
				}
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"sessions": sessions})
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	a := New(srv.URL)
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.focus = FocusSidebar
	a.wsID = "ws_a"
	a.sessions = []gact.Session{{ID: "live1", Title: "current", WorkspaceID: "ws_a"}}
	a.selected = 0
	return a
}

func TestArchivedView_HTogglesFetchesWithFilter(t *testing.T) {
	// Spy on ListSessions requests so we can assert the `archived=true`
	// filter was sent when the view is toggled.
	var (
		mu       sync.Mutex
		queries  []string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/sessions" {
			mu.Lock()
			queries = append(queries, r.URL.RawQuery)
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"sessions": []any{}})
			return
		}
	}))
	defer srv.Close()

	a := New(srv.URL)
	a.focus = FocusSidebar
	a.wsID = "ws_a"

	// `h` toggles on → fetch with archived=true.
	_, cmd := a.handleSidebarKey(tea.KeyPressMsg{Code: 'h', Text: "h"})
	if !a.showArchived {
		t.Error("h should toggle showArchived to true")
	}
	if !strings.Contains(a.transientHint, "archived") {
		t.Errorf("hint = %q, want a toggle toast", a.transientHint)
	}
	if cmd != nil {
		cmd() // run the fetch
	}

	// `h` again toggles off → fetch with no archived filter.
	_, cmd = a.handleSidebarKey(tea.KeyPressMsg{Code: 'h', Text: "h"})
	if a.showArchived {
		t.Error("second h should toggle back to active view")
	}
	if cmd != nil {
		cmd()
	}

	mu.Lock()
	defer mu.Unlock()
	if len(queries) != 2 {
		t.Fatalf("expected 2 session fetches, got %d (%+v)", len(queries), queries)
	}
	if !strings.Contains(queries[0], "archived=true") {
		t.Errorf("first fetch should include archived=true filter, got %q", queries[0])
	}
	if strings.Contains(queries[1], "archived=true") {
		t.Errorf("second fetch should NOT include archived=true filter, got %q", queries[1])
	}
}

func TestArchivedView_HSkipsFetchWhenNoWorkspace(t *testing.T) {
	a := New("http://unused")
	a.focus = FocusSidebar
	a.wsID = "" // no workspace yet

	_, cmd := a.handleSidebarKey(tea.KeyPressMsg{Code: 'h', Text: "h"})
	if cmd != nil {
		t.Error("h with no workspace should not issue a fetch")
	}
	if !a.showArchived {
		t.Error("toggle flag should still flip for deferred use")
	}
}

func TestArchive_InArchivedViewSendsFalse(t *testing.T) {
	// In the archived view, `A` should un-archive (send archived=false).
	var (
		mu           sync.Mutex
		archivedSent *bool
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch {
			body, _ := readAll(r.Body)
			var b struct {
				Archived *bool `json:"archived"`
			}
			_ = json.Unmarshal(body, &b)
			mu.Lock()
			archivedSent = b.Archived
			mu.Unlock()
			_, _ = w.Write([]byte(`{}`))
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"sessions": []any{}})
	}))
	defer srv.Close()

	a := New(srv.URL)
	a.focus = FocusSidebar
	a.wsID = "ws_a"
	a.sessions = []gact.Session{{ID: "arch1", Title: "old"}}
	a.selected = 0
	a.showArchived = true

	// Match the Code + Text + Mod shape that k.String() expands to "A";
	// without Text set the key renders differently in lipgloss's key
	// encoder and the case arm won't match.
	_, cmd := a.handleSidebarKey(tea.KeyPressMsg{Code: 'A', Text: "A", Mod: tea.ModShift})
	if cmd == nil {
		t.Fatal("A should dispatch unarchive cmd")
	}
	msg := cmd()
	archived, ok := msg.(sessionArchivedMsg)
	if !ok {
		t.Fatalf("cmd returned %T", msg)
	}
	if archived.archived {
		t.Error("archivedMsg.archived should be false for un-archive")
	}
	mu.Lock()
	defer mu.Unlock()
	if archivedSent == nil || *archivedSent != false {
		t.Errorf("PATCH body archived = %v, want explicit false", archivedSent)
	}
}

func TestArchive_UnarchiveHintSaysUnArchived(t *testing.T) {
	a := makeArchivedViewApp(t)
	a.sessions = []gact.Session{{ID: "arch1"}}
	a.selected = 0

	model, _ := a.Update(sessionArchivedMsg{sessionID: "arch1", archived: false})
	a = model.(*App)
	if !strings.Contains(a.transientHint, "un-archived") {
		t.Errorf("hint = %q, want 'un-archived' confirmation", a.transientHint)
	}
}

// readAll slurps an io.Reader without pulling in io/ioutil. Keeping
// the helper tiny rather than adding an extra import just for tests.
func readAll(r interface{ Read(p []byte) (int, error) }) ([]byte, error) {
	var out []byte
	buf := make([]byte, 4096)
	for {
		n, err := r.Read(buf)
		if n > 0 {
			out = append(out, buf[:n]...)
		}
		if err != nil {
			if err.Error() == "EOF" {
				return out, nil
			}
			return out, err
		}
	}
}
