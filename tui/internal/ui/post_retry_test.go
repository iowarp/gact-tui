package ui

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
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
	if !strings.Contains(a.transientHint, "the agent is still starting") {
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

func TestPostMessageWithMentions_AttachesBeforePostingSanitizedText(t *testing.T) {
	var calls []string
	var attachedPath string
	var postedText string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/ses_x/context/files":
			calls = append(calls, "attach")
			var body struct {
				Path string `json:"path"`
				Mode string `json:"mode"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode attach body: %v", err)
			}
			attachedPath = body.Path
			_ = json.NewEncoder(w).Encode(map[string]any{
				"path": body.Path,
				"mode": body.Mode,
			})
		case r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/ses_x/messages":
			calls = append(calls, "message")
			var body struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode message body: %v", err)
			}
			if len(body.Parts) > 0 {
				postedText = body.Parts[0].Text
			}
			_, _ = w.Write([]byte(`{"message_id":"msg_ack"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	a := New(srv.URL)
	cmd := postMessageWithMentionsCmd(
		a.c,
		"ses_x",
		"please inspect @docs/readme.md",
		"please inspect @docs/readme.md",
		[]composerFileMention{{Path: "docs/readme.md", Mode: "read"}},
	)
	msg := cmd()
	ack, ok := msg.(msgPostedAck)
	if !ok {
		t.Fatalf("cmd returned %T, want msgPostedAck", msg)
	}
	if len(ack.contextFiles) != 1 || ack.contextFiles[0].Path != "docs/readme.md" {
		t.Fatalf("ack context files = %#v", ack.contextFiles)
	}
	if strings.Join(calls, ",") != "attach,message" {
		t.Fatalf("calls = %v, want attach before message", calls)
	}
	if attachedPath != "docs/readme.md" {
		t.Fatalf("attached path = %q", attachedPath)
	}
	if postedText != "please inspect docs/readme.md" {
		t.Fatalf("posted text = %q, want @ prefix removed", postedText)
	}
}

func TestPostMessageWithMentions_AttachFailureRestoresDraftAndSkipsMessage(t *testing.T) {
	messagePosted := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/ses_x/context/files":
			http.Error(w, `{"error":"missing"}`, http.StatusNotFound)
		case r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/ses_x/messages":
			messagePosted = true
			_, _ = w.Write([]byte(`{"message_id":"msg_ack"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	a := New(srv.URL)
	cmd := postMessageWithMentionsCmd(
		a.c,
		"ses_x",
		"use @missing.txt",
		"use @missing.txt",
		[]composerFileMention{{Path: "missing.txt", Mode: "read"}},
	)
	msg := cmd()
	failed, ok := msg.(postFailedMsg)
	if !ok {
		t.Fatalf("cmd returned %T, want postFailedMsg", msg)
	}
	if failed.text != "use @missing.txt" {
		t.Fatalf("restored text = %q", failed.text)
	}
	if len(failed.mentions) != 1 || failed.mentions[0].Path != "missing.txt" {
		t.Fatalf("restored mentions = %#v", failed.mentions)
	}
	if messagePosted {
		t.Fatal("message should not be posted after attach failure")
	}
}

func TestMsgPostedAck_MergesAttachedContextFiles(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "ses_x", Title: "demo"}}, nil)
	a.contextFiles = []gact.ContextFile{{Path: "docs/old.md", Mode: "read"}}

	model, _ := a.Update(msgPostedAck{
		sessionID: "ses_x",
		text:      "hello",
		contextFiles: []gact.ContextFile{
			{Path: "docs/readme.md", Mode: "read"},
		},
	})
	a = model.(*App)

	if len(a.contextFiles) != 2 {
		t.Fatalf("context files = %#v, want existing plus attached", a.contextFiles)
	}
	if a.contextFiles[1].Path != "docs/readme.md" {
		t.Fatalf("attached context file missing: %#v", a.contextFiles)
	}
}
