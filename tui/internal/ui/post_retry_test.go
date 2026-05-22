package ui

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestPostFailed_RestoresTextAndShowsHint(t *testing.T) {
	a := New("http://unused")
	a.input.SetValue("") // start clean

	msg := postFailedMsg{text: "important query", err: errors.New("dial tcp: i/o timeout")}
	model, cmd := a.Update(msg)
	a = model.(*App)
	if cmd != nil {
		t.Errorf("postFailedMsg should be fully handled in Update, got cmd=%v", cmd)
	}
	if a.input.Value() != "important query" {
		t.Errorf("input text = %q, want 'important query'", a.input.Value())
	}
	if !strings.Contains(a.transientHint, "press Enter to retry") {
		t.Errorf("hint = %q, want a 'press Enter to retry' note", a.transientHint)
	}
	if !strings.Contains(a.transientHint, "i/o timeout") {
		t.Errorf("hint = %q, want the underlying error text", a.transientHint)
	}
}

func TestPostFailed_DoesNotGoToStageError(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	_, _ = a.Update(postFailedMsg{text: "hi", err: errors.New("boom")})
	if a.stage == StageError {
		t.Error("post failure should not send the UI to StageError")
	}
}

func TestPostFailed_AgentNotAvailableUsesHumanHint(t *testing.T) {
	a := New("http://unused")
	a.input.SetValue("")

	msg := postFailedMsg{
		text: "hi",
		err: &client.Error{
			Status:  503,
			Code:    "agent_not_available",
			Message: "CLIO is still starting its agent; no agent is ready to accept messages yet.",
			Details: map[string]any{
				"agent_status": "starting",
			},
		},
	}
	model, _ := a.Update(msg)
	a = model.(*App)

	if a.input.Value() != "hi" {
		t.Errorf("input text = %q, want hi", a.input.Value())
	}
	if !strings.Contains(a.transientHint, "CLIO agent is still starting") {
		t.Errorf("hint = %q, want startup-specific text", a.transientHint)
	}
	if strings.Contains(a.transientHint, "gact: 503") {
		t.Errorf("hint should not expose raw GACT status: %q", a.transientHint)
	}
}

func TestPostMessageCmd_EmitsPostFailedMsgOnError(t *testing.T) {
	// Mock server that always 503s — simulates the real transient
	// failure we're guarding against.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"no"}`, http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	// Build an App pointed at the mock; postMessageCmd takes a Client
	// directly so no need to wire the whole App.
	a := New(srv.URL)

	cmd := postMessageCmd(a.c, "ses_x", "hello")
	if cmd == nil {
		t.Fatal("cmd = nil")
	}
	msg := cmd()
	got, ok := msg.(postFailedMsg)
	if !ok {
		t.Fatalf("cmd returned %T, want postFailedMsg", msg)
	}
	if got.text != "hello" {
		t.Errorf("text = %q, want hello", got.text)
	}
	if got.err == nil {
		t.Errorf("err should be non-nil on 503")
	}
}
