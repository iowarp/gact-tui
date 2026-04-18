package server

import (
	"io"
	"net/http"
	"strings"
)

// VoiceTranscribeResponse mirrors SPEC §6.14 — POST .../voice/transcribe
// returns {text, duration_ms}.
type VoiceTranscribeResponse struct {
	Text       string `json:"text"`
	DurationMs int    `json:"duration_ms"`
}

// handleVoiceTranscribe accepts an audio/* body and returns a canned
// transcript. The emulator doesn't actually decode the audio — it derives
// a deterministic transcript from the body length so callers can verify
// the upload round-trip.
//
// Real backends would shell out to whisper, plug into Cloud Speech, etc.
func (s *Server) handleVoiceTranscribe(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 8*1024*1024)) // 8 MB cap
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	// Pick a canned transcript so users can SEE the round-trip happened.
	// Length-keyed so different uploads return different text — useful
	// for verifying the wire path in tests.
	transcripts := []string{
		"refactor this function for clarity",
		"add a unit test that covers the empty case",
		"explain what happens when the input is empty",
		"summarise the main argument of this paragraph",
		"why is this slow and how do I speed it up",
	}
	text := transcripts[len(body)%len(transcripts)]
	if r.URL.Query().Get("text") != "" {
		text = r.URL.Query().Get("text") // test override
	}
	durMs := 1500 + (len(body) / 16) // pretend duration
	if durMs > 30000 {
		durMs = 30000
	}
	writeJSON(w, http.StatusOK, VoiceTranscribeResponse{
		Text:       strings.TrimSpace(text),
		DurationMs: durMs,
	})
}
