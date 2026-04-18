package crush

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestPartsToCrushAgentMessage_TextParts(t *testing.T) {
	parts := []gact.Part{
		{Type: gact.PartTypeText, Text: "first line"},
		{Type: gact.PartTypeText, Text: "second line"},
	}
	prompt, atts := PartsToCrushAgentMessage(parts)
	if prompt != "first line\nsecond line" {
		t.Errorf("prompt = %q", prompt)
	}
	if len(atts) != 0 {
		t.Errorf("attachments = %+v", atts)
	}
}

func TestPartsToCrushAgentMessage_ThinkingFenced(t *testing.T) {
	parts := []gact.Part{
		{Type: gact.PartTypeThinking, Thinking: "internal monologue"},
		{Type: gact.PartTypeText, Text: "the answer"},
	}
	prompt, _ := PartsToCrushAgentMessage(parts)
	if !strings.Contains(prompt, "<thinking>\ninternal monologue\n</thinking>") {
		t.Errorf("thinking not fenced: %q", prompt)
	}
	if !strings.Contains(prompt, "the answer") {
		t.Errorf("text part dropped: %q", prompt)
	}
}

func TestPartsToCrushAgentMessage_ImageBecomesAttachment(t *testing.T) {
	parts := []gact.Part{
		{
			Type: gact.PartTypeText, Text: "look at this",
		},
		{
			Type: gact.PartTypeImage,
			Name: "screenshot.png",
			Path: "/tmp/screenshot.png",
			Source: map[string]any{
				"type":      "base64",
				"mediaType": "image/png",
				"data":      []byte("\x89PNG\r\n"),
			},
		},
	}
	prompt, atts := PartsToCrushAgentMessage(parts)
	if prompt != "look at this" {
		t.Errorf("prompt = %q", prompt)
	}
	if len(atts) != 1 {
		t.Fatalf("attachments = %+v", atts)
	}
	a := atts[0]
	if a.FileName != "screenshot.png" || a.MimeType != "image/png" {
		t.Errorf("att = %+v", a)
	}
	if !bytes.HasPrefix(a.Content, []byte("\x89PNG")) {
		t.Errorf("content not preserved: %x", a.Content)
	}
}

func TestPartsToCrushAgentMessage_URLImageIsNotAttachment(t *testing.T) {
	// A URL-source image can't be carried as an attachment without
	// fetching — the adapter doesn't synth that fallback (would change
	// prompt determinism), so it's silently dropped from attachments.
	parts := []gact.Part{
		{Type: gact.PartTypeText, Text: "ignore the url"},
		{Type: gact.PartTypeImage, Source: map[string]any{
			"type": "url", "url": "https://x/y.png",
		}},
	}
	_, atts := PartsToCrushAgentMessage(parts)
	if len(atts) != 0 {
		t.Errorf("attachments should be empty, got %+v", atts)
	}
}

func TestPartsToCrushAgentMessage_UnknownTypeFalconedIntoPrompt(t *testing.T) {
	parts := []gact.Part{
		{Type: "x_future_thing", Text: "with payload"},
	}
	prompt, _ := PartsToCrushAgentMessage(parts)
	if !strings.Contains(prompt, "```json") || !strings.Contains(prompt, "x_future_thing") {
		t.Errorf("unknown part should be JSON-fenced: %q", prompt)
	}
}

func TestHandlePostMessage_E2E_ForwardsAndReturns202(t *testing.T) {
	var (
		mu       sync.Mutex
		gotURL   string
		gotBody  []byte
	)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		gotURL = r.URL.Path
		gotBody, _ = io.ReadAll(r.Body)
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	s := New(upstream.URL, "ws_a", nil)

	body := `{"parts":[{"type":"text","text":"hello crush"}]}`
	req := httptest.NewRequest(http.MethodPost, "/v1/sessions/ses_42/messages", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status %d, want 202; body=%s", rec.Code, rec.Body.String())
	}
	mu.Lock()
	defer mu.Unlock()
	if gotURL != "/v1/workspaces/ws_a/agent" {
		t.Errorf("upstream URL = %q", gotURL)
	}
	var sent crushAgentMessage
	if err := json.Unmarshal(gotBody, &sent); err != nil {
		t.Fatalf("upstream body decode: %v (raw=%s)", err, gotBody)
	}
	if sent.SessionID != "ses_42" {
		t.Errorf("session_id = %q", sent.SessionID)
	}
	if sent.Prompt != "hello crush" {
		t.Errorf("prompt = %q", sent.Prompt)
	}

	// 202 body should include a synthetic message_id + accepted_at.
	var ack struct {
		MessageID  string `json:"message_id"`
		AcceptedAt string `json:"accepted_at"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &ack)
	if !strings.HasPrefix(ack.MessageID, "msg_pending_") {
		t.Errorf("message_id = %q, want msg_pending_*", ack.MessageID)
	}
	if ack.AcceptedAt == "" {
		t.Errorf("accepted_at missing")
	}
}

func TestHandlePostMessage_EmptyBodyReturns400(t *testing.T) {
	s := New("http://unused", "ws_a", nil)
	req := httptest.NewRequest(http.MethodPost, "/v1/sessions/ses_42/messages",
		strings.NewReader(`{"parts":[]}`))
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status %d, want 400", rec.Code)
	}
}

func TestHandlePostMessage_UpstreamErrorPropagates(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"crush is grumpy"}`, http.StatusInternalServerError)
	}))
	defer upstream.Close()

	s := New(upstream.URL, "ws_a", nil)
	body := `{"parts":[{"type":"text","text":"hi"}]}`
	req := httptest.NewRequest(http.MethodPost, "/v1/sessions/x/messages", strings.NewReader(body))
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadGateway {
		t.Errorf("status %d, want 502; body=%s", rec.Code, rec.Body.String())
	}
}

func TestHandlePostMessage_MissingWorkspace(t *testing.T) {
	s := New("http://unused", "", nil)
	body := `{"parts":[{"type":"text","text":"hi"}]}`
	req := httptest.NewRequest(http.MethodPost, "/v1/sessions/x/messages", strings.NewReader(body))
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status %d, want 400", rec.Code)
	}
}
