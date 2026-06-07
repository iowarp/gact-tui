package ui

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestCommandErrMsgSurfacesHintWithoutStageError(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.stage = StageReady

	model, cmd := a.Update(errMsg{stage: "command", err: errors.New("command_not_found: no command /chache-stash")})
	a = model.(*App)

	if a.stage == StageError {
		t.Fatalf("command failure should not replace the TUI with StageError: %q", a.stageError)
	}
	if !strings.Contains(a.transientHint, "command failed") ||
		!strings.Contains(a.transientHint, "/chache-stash") {
		t.Fatalf("command failure hint should include the real command error, got %q", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("command failure should schedule hint expiry")
	}
}

func TestRunCommandCancelFailureShowsCancelHint(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error":{"code":"cancel_failed","message":"cancel failed: runtime supervisor did not acknowledge the request"}}`))
	}))
	defer srv.Close()

	a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
	a.stage = StageReady
	msg := runCommandCmd(client.New(srv.URL), "sess_1", "/cancel")()

	model, cmd := a.Update(msg)
	a = model.(*App)
	if a.stage == StageError {
		t.Fatalf("cancel command failure should not replace the TUI with StageError: %q", a.stageError)
	}
	if !strings.Contains(a.transientHint, "cancel failed") ||
		!strings.Contains(a.transientHint, "runtime supervisor did not acknowledge") {
		t.Fatalf("cancel failure hint = %q", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("cancel failure should schedule hint expiry")
	}
}
