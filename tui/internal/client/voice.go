package client

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// VoiceTranscribeResponse mirrors the server type.
type VoiceTranscribeResponse struct {
	Text       string `json:"text"`
	DurationMs int    `json:"duration_ms"`
}

// VoiceTranscribe POSTs raw audio bytes to /v1/sessions/{id}/voice/transcribe.
// mimeType examples: "audio/wav", "audio/webm", "audio/mp3". Returns the
// recognised text + claimed duration.
func (c *Client) VoiceTranscribe(ctx context.Context, sessionID string, audio []byte, mimeType string) (VoiceTranscribeResponse, error) {
	endpoint := c.baseURL + "/v1/sessions/" + url.PathEscape(sessionID) + "/voice/transcribe"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(audio))
	if err != nil {
		return VoiceTranscribeResponse{}, err
	}
	req.Header.Set("Content-Type", mimeType)
	if c.bearer != "" {
		req.Header.Set("Authorization", "Bearer "+c.bearer)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return VoiceTranscribeResponse{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		var e gact.Error
		_ = json.NewDecoder(resp.Body).Decode(&e)
		return VoiceTranscribeResponse{}, &Error{
			Status: resp.StatusCode, Code: e.Error.Code, Message: e.Error.Message,
		}
	}
	var out VoiceTranscribeResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return VoiceTranscribeResponse{}, err
	}
	return out, nil
}
