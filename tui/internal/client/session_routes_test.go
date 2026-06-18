package client

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestEventStreamScopeEscapesScopedSessionAndWorkspaceIDs(t *testing.T) {
	if got, want := (EventStreamScope{SessionID: "ws1/live?run"}).path(), "/v1/sessions/ws1%2Flive%3Frun/events"; got != want {
		t.Fatalf("session stream path = %q, want %q", got, want)
	}
	if got, want := (EventStreamScope{WorkspaceID: "demo workspace/one"}).path(), "/v1/events?workspace_id=demo+workspace%2Fone"; got != want {
		t.Fatalf("workspace stream path = %q, want %q", got, want)
	}
}

func TestVoiceTranscribeEscapesScopedSessionID(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.EscapedPath()
		if gotPath != "/v1/sessions/ws1%2Flive%3Frun/voice/transcribe" {
			t.Fatalf("path = %q", gotPath)
		}
		_ = json.NewEncoder(w).Encode(VoiceTranscribeResponse{Text: "ok"})
	}))
	t.Cleanup(srv.Close)

	_, err := New(srv.URL).VoiceTranscribe(context.Background(), "ws1/live?run", []byte("audio"), "audio/wav")
	if err != nil {
		t.Fatalf("VoiceTranscribe returned error: %v", err)
	}
	if gotPath == "" {
		t.Fatal("server did not receive transcription request")
	}
}
