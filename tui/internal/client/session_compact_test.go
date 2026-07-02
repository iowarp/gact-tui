package client

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Regression test for iowarp/gact-tui#224: the TUI must compact sessions
// via POST /v1/sessions/{id}/compact with a `focus` body key (the contract
// clio actually serves). Before the fix the client hit the nonexistent
// /summarize route with an `instructions` key and always 404ed.
func TestCompactSessionHitsCompactRouteWithFocus(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.EscapedPath()
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("{}"))
	}))
	t.Cleanup(srv.Close)

	fallback, err := New(srv.URL).CompactSession(context.Background(), "sess-1", "keep dataset paths")
	if err != nil {
		t.Fatalf("compact returned error: %v", err)
	}
	if fallback != "" {
		t.Fatalf("fallback = %q, want empty when /compact is served", fallback)
	}
	if want := "/v1/sessions/sess-1/compact"; gotPath != want {
		t.Fatalf("path = %q, want %q", gotPath, want)
	}
	if got, ok := gotBody["focus"].(string); !ok || got != "keep dataset paths" {
		t.Fatalf("body focus = %#v, want %q (body: %#v)", gotBody["focus"], "keep dataset paths", gotBody)
	}
	if _, ok := gotBody["instructions"]; ok {
		t.Fatalf("body must not carry the legacy `instructions` key on /compact: %#v", gotBody)
	}
}

// A backend that predates /compact (e.g. the emulator) still serves the
// legacy /summarize route. The client must fall back to it exactly once,
// map focus into the legacy `instructions` key, and report the degraded
// path via a structured fallback reason — never silently.
func TestCompactSessionFallsBackToLegacySummarize(t *testing.T) {
	var paths []string
	var legacyBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.EscapedPath())
		if strings.HasSuffix(r.URL.EscapedPath(), "/compact") {
			http.Error(w, "404 page not found", http.StatusNotFound)
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&legacyBody)
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(srv.Close)

	fallback, err := New(srv.URL).CompactSession(context.Background(), "sess-2", "focus text")
	if err != nil {
		t.Fatalf("compact with legacy backend returned error: %v", err)
	}
	if fallback != CompactFallbackLegacySummarize {
		t.Fatalf("fallback reason = %q, want %q", fallback, CompactFallbackLegacySummarize)
	}
	want := []string{"/v1/sessions/sess-2/compact", "/v1/sessions/sess-2/summarize"}
	if len(paths) != 2 || paths[0] != want[0] || paths[1] != want[1] {
		t.Fatalf("paths = %v, want %v", paths, want)
	}
	if got, ok := legacyBody["instructions"].(string); !ok || got != "focus text" {
		t.Fatalf("legacy body instructions = %#v, want %q", legacyBody["instructions"], "focus text")
	}
}

// When the backend supports neither /compact nor /summarize, the error must
// surface to the caller (which renders it as a hint) instead of being
// swallowed.
func TestCompactSessionErrsWhenBackendSupportsNeitherRoute(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "404 page not found", http.StatusNotFound)
	}))
	t.Cleanup(srv.Close)

	fallback, err := New(srv.URL).CompactSession(context.Background(), "sess-3", "")
	if err == nil {
		t.Fatal("expected an error when neither route exists")
	}
	if fallback != "" {
		t.Fatalf("fallback = %q, want empty on failure", fallback)
	}
	if !strings.Contains(err.Error(), "404") {
		t.Fatalf("error should carry the 404 status: %v", err)
	}
}
