package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestRequestCompactCmdUsesSessionSummarizeEndpoint(t *testing.T) {
	var sawSummarize bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/sessions/s1/compact" {
			t.Fatalf("requestCompactCmd should not call stale compact endpoint")
		}
		if r.Method != http.MethodPost || r.URL.Path != "/v1/sessions/s1/summarize" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		sawSummarize = true
		var req map[string]any
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode summarize request: %v", err)
		}
		if req["auto"] != true {
			t.Fatalf("summarize auto = %#v, want true", req["auto"])
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	msg := requestCompactCmd(client.New(srv.URL), "s1")()
	if msg != nil {
		t.Fatalf("requestCompactCmd returned %#v, want nil success message", msg)
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
	err, ok := msg.(errMsg)
	if !ok {
		t.Fatalf("requestCompactCmd returned %#v, want errMsg", msg)
	}
	if err.stage != "compact" {
		t.Fatalf("error stage = %q, want compact", err.stage)
	}
}
