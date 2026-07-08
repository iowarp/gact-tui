package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// JJJJJ1: Ctrl+C with a running session must POST /cancel before
// quitting. The user explicitly asked for "stop everything" semantics
// — leaving the backend churning on a turn the user just abandoned
// defeats the point of "exit".
func TestCtrlC_CancelsRunningSession(t *testing.T) {
	var cancelHits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost &&
			strings.HasSuffix(r.URL.Path, "/cancel") {
			atomic.AddInt32(&cancelHits, 1)
			w.WriteHeader(http.StatusOK)
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	a := newReadyApp(
		[]gact.Session{{ID: "sess_busy", Title: "busy", Status: gact.StatusRunning}},
		nil,
	)
	a.c = client.New(srv.URL)
	a.session.currentStatus = gact.StatusRunning

	// Ctrl+C now opens a confirm modal. First press opens
	// with "close" highlighted (the original quit-everything option);
	// second press accepts and fires the cancel+quit fan-out.
	out, cmd := a.Update(tea.KeyPressMsg{Code: 'c', Mod: tea.ModCtrl, Text: ""})
	if cmd != nil {
		t.Fatalf("first Ctrl+C should open the modal without firing a cmd")
	}
	a = out.(*App)
	out, cmd = a.Update(tea.KeyPressMsg{Code: 'c', Mod: tea.ModCtrl, Text: ""})
	if cmd == nil {
		t.Fatalf("second Ctrl+C should fire the quit-family cmd")
	}
	msg := cmd()
	if batch, ok := msg.(tea.BatchMsg); ok {
		for _, c := range batch {
			if c != nil {
				_ = c()
			}
		}
	}
	_ = out

	// Cancel HTTP call may complete asynchronously — short poll.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if atomic.LoadInt32(&cancelHits) > 0 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if got := atomic.LoadInt32(&cancelHits); got != 1 {
		t.Errorf("expected 1 POST /cancel hit, got %d", got)
	}
}

// And the inverse: Ctrl+C on an idle session does NOT POST /cancel
// (no in-flight work to stop; firing cancel anyway would create
// noise + a redundant log line on the backend).
func TestCtrlC_NoCancelWhenIdle(t *testing.T) {
	var cancelHits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost &&
			strings.HasSuffix(r.URL.Path, "/cancel") {
			atomic.AddInt32(&cancelHits, 1)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	a := newReadyApp(
		[]gact.Session{{ID: "sess_idle", Title: "idle", Status: gact.StatusIdle}},
		nil,
	)
	a.c = client.New(srv.URL)
	a.session.currentStatus = gact.StatusIdle

	// Double-Ctrl+C preserves the old "quit immediately"
	// UX. The first press opens the modal, the second accepts and
	// runs the close path — which on an idle session must NOT POST
	// /cancel.
	out, cmd := a.Update(tea.KeyPressMsg{Code: 'c', Mod: tea.ModCtrl, Text: ""})
	if cmd != nil {
		t.Fatalf("first Ctrl+C should open the modal without firing a cmd")
	}
	a = out.(*App)
	out, cmd = a.Update(tea.KeyPressMsg{Code: 'c', Mod: tea.ModCtrl, Text: ""})
	if cmd == nil {
		t.Fatalf("second Ctrl+C should fire a quit-family cmd")
	}
	msg := cmd()
	if batch, ok := msg.(tea.BatchMsg); ok {
		for _, c := range batch {
			if c != nil {
				_ = c()
			}
		}
	}
	_ = out
	time.Sleep(150 * time.Millisecond) // let any stray request land
	if got := atomic.LoadInt32(&cancelHits); got != 0 {
		t.Errorf("idle session Ctrl+C should NOT POST cancel, got %d hits", got)
	}
}
