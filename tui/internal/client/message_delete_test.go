package client

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDeleteMessageUsesSessionScopedRoute(t *testing.T) {
	var gotMethod, gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.EscapedPath()
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	if err := New(srv.URL).DeleteMessage(context.Background(), "sess_1", "msg_1"); err != nil {
		t.Fatalf("DeleteMessage returned error: %v", err)
	}
	if gotMethod != http.MethodDelete {
		t.Fatalf("method = %q, want %q", gotMethod, http.MethodDelete)
	}
	wantPath := "/v1/sessions/sess_1/messages/msg_1"
	if gotPath != wantPath {
		t.Fatalf("path = %q, want %q", gotPath, wantPath)
	}
}

func TestDeleteMessageFallsBackToLegacyRouteWithoutSession(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.EscapedPath()
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	if err := New(srv.URL).DeleteMessage(context.Background(), "", "msg_1"); err != nil {
		t.Fatalf("DeleteMessage returned error: %v", err)
	}
	wantPath := "/v1/messages/msg_1"
	if gotPath != wantPath {
		t.Fatalf("path = %q, want %q", gotPath, wantPath)
	}
}
