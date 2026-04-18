package opencode

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestAdapter_ListMessages(t *testing.T) {
	upstream := mockOpenCode(t, map[string]http.HandlerFunc{
		"/session/ses_42/message": func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`[
				{
					"info": {"id":"msg_u","sessionID":"ses_42","role":"user","time":{"created":1,"updated":1}},
					"parts": [{"id":"p1","type":"text","text":"go"}]
				},
				{
					"info": {"id":"msg_a","sessionID":"ses_42","role":"assistant","time":{"created":2,"updated":3,"completed":3},"providerID":"anthropic","modelID":"claude-opus-4-7","cost":0.0135,"finish":"end_turn"},
					"parts": [
						{"id":"p2","type":"reasoning","text":"thinking..."},
						{"id":"p3","type":"text","text":"done"}
					]
				}
			]`))
		},
	})
	defer upstream.Close()

	s := New(upstream.URL, nil)
	rec := do(t, s.Handler(), http.MethodGet, "/v1/sessions/ses_42/messages")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Messages []gact.Message `json:"messages"`
	}
	_ = json.NewDecoder(rec.Body).Decode(&body)
	if len(body.Messages) != 2 {
		t.Fatalf("messages count = %d", len(body.Messages))
	}
	if body.Messages[0].Role != gact.RoleUser {
		t.Errorf("first.role = %q", body.Messages[0].Role)
	}
	if body.Messages[1].CostUSD != 0.0135 {
		t.Errorf("cost not propagated: %v", body.Messages[1].CostUSD)
	}
	if body.Messages[1].Parts[0].Type != gact.PartTypeThinking {
		t.Errorf("reasoning → thinking translation missing: %+v", body.Messages[1].Parts[0])
	}
}

func TestAdapter_PostMessage(t *testing.T) {
	gotBody := []byte{}
	upstream := mockOpenCode(t, map[string]http.HandlerFunc{
		"/session/ses_x/prompt_async": func(w http.ResponseWriter, r *http.Request) {
			gotBody, _ = io.ReadAll(r.Body)
			w.WriteHeader(http.StatusNoContent)
		},
	})
	defer upstream.Close()

	s := New(upstream.URL, nil)
	body := bytes.NewBufferString(`{"parts":[{"type":"text","text":"hi"}],"model":{"provider_id":"anthropic","model_id":"claude-opus-4-7"}}`)
	req := httptest.NewRequest(http.MethodPost, "/v1/sessions/ses_x/messages", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	_ = json.NewDecoder(rec.Body).Decode(&resp)
	if mid, _ := resp["message_id"].(string); mid == "" {
		t.Errorf("no message_id returned")
	}
	// Check the upstream actually saw text+model.
	if !bytes.Contains(gotBody, []byte(`"text":"hi"`)) {
		t.Errorf("upstream missing text: %s", gotBody)
	}
	if !bytes.Contains(gotBody, []byte(`"providerID":"anthropic"`)) {
		t.Errorf("upstream missing provider: %s", gotBody)
	}
}

func TestAdapter_PostMessage_EmptyParts(t *testing.T) {
	s := New("http://unused", nil)
	body := bytes.NewBufferString(`{"parts":[]}`)
	req := httptest.NewRequest(http.MethodPost, "/v1/sessions/ses_x/messages", body)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
}

func TestAdapter_ListMessages_QueryForward(t *testing.T) {
	// Verify the adapter forwards limit and before to OpenCode.
	gotPath := ""
	upstream := mockOpenCode(t, map[string]http.HandlerFunc{
		"/session/ses_x/message": func(w http.ResponseWriter, r *http.Request) {
			gotPath = r.URL.RawQuery
			_, _ = w.Write([]byte(`[]`))
		},
	})
	defer upstream.Close()

	s := New(upstream.URL, nil)
	do(t, s.Handler(), http.MethodGet, "/v1/sessions/ses_x/messages?limit=5&before=msg_z")
	if !strings.Contains(gotPath, "limit=5") || !strings.Contains(gotPath, "before=msg_z") {
		t.Errorf("upstream query = %q (missing forwarded params)", gotPath)
	}
}
