package ui

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestDeleteMessageCmdUsesSessionScopedRoute(t *testing.T) {
	got := make(chan string, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got <- r.URL.EscapedPath()
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	cmd := deleteMessageCmd(client.New(srv.URL), "sess_1", "msg_1")
	if msg := cmd(); msg != nil {
		t.Fatalf("deleteMessageCmd returned %T, want nil", msg)
	}

	wantPath := "/v1/sessions/sess_1/messages/msg_1"
	var gotPath string
	select {
	case gotPath = <-got:
	case <-time.After(time.Second):
		t.Fatal("deleteMessageCmd did not issue a request")
	}
	if gotPath != wantPath {
		t.Fatalf("path = %q, want %q", gotPath, wantPath)
	}
}
