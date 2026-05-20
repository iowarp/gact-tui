package ui

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestRunCommandCmdReturnsErrMsgOnBackendFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":{"error":"command_error","message":"cache stats failed"}}`))
	}))
	defer srv.Close()

	msg := runCommandCmd(client.New(srv.URL), "sess_1", "/cache-stats")()

	got, ok := msg.(errMsg)
	if !ok {
		t.Fatalf("message = %T %v, want errMsg", msg, msg)
	}
	if got.stage != "command" {
		t.Fatalf("stage = %q, want command", got.stage)
	}
	if got.err == nil {
		t.Fatal("err is nil")
	}
}
