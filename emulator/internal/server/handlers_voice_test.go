package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestVoiceTranscribe(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()

	// Send some bytes — emulator picks a canned transcript.
	rec := httptest.NewRecorder()
	body := bytes.NewReader(make([]byte, 1024))
	req := httptest.NewRequest(http.MethodPost,
		"/v1/sessions/"+sid+"/voice/transcribe", body)
	req.Header.Set("Content-Type", "audio/wav")
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var got VoiceTranscribeResponse
	_ = json.NewDecoder(rec.Body).Decode(&got)
	if got.Text == "" {
		t.Errorf("text empty")
	}
	if got.DurationMs <= 0 {
		t.Errorf("duration_ms = %d", got.DurationMs)
	}
}

func TestVoiceTranscribe_QueryOverride(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost,
		"/v1/sessions/"+sid+"/voice/transcribe?text=hello+world",
		bytes.NewReader([]byte("x")))
	srv.Handler().ServeHTTP(rec, req)
	var got VoiceTranscribeResponse
	_ = json.NewDecoder(rec.Body).Decode(&got)
	if got.Text != "hello world" {
		t.Errorf("text override didn't take: %q", got.Text)
	}
}

func TestVoiceTranscribe_MissingSession(t *testing.T) {
	srv, _ := newServerWithSeededWorkspace(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost,
		"/v1/sessions/sess_nope/voice/transcribe",
		strings.NewReader(""))
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}
}
