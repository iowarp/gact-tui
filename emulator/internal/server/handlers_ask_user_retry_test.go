package server

import (
	"net/http"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestRetryMessageWithModelPreservesWarningProvenance(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()

	recPost := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/messages", PostMessageRequest{
		Parts: []gact.Part{gact.NewTextPart("try the analysis again")},
	})
	if recPost.Code != http.StatusAccepted {
		t.Fatalf("post: %d %s", recPost.Code, recPost.Body.String())
	}
	var posted PostMessageResponse
	mustDecode(t, recPost, &posted)

	rec := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/messages/"+posted.MessageID+"/retry", gact.RetryTurnRequest{
		Execute:    true,
		ProviderID: "anthropic",
		ModelID:    "claude-sonnet",
		Metadata: map[string]any{
			"requested_from": "tui",
			"warning_ack":    true,
		},
	})
	if rec.Code != http.StatusAccepted {
		t.Fatalf("retry: %d %s", rec.Code, rec.Body.String())
	}
	var attempt gact.TurnAttempt
	mustDecode(t, rec, &attempt)

	if attempt.Model == nil || attempt.Model.ProviderID != "anthropic" || attempt.Model.ModelID != "claude-sonnet" {
		t.Fatalf("attempt model = %#v, want anthropic/claude-sonnet", attempt.Model)
	}
	if attempt.Warning == "" {
		t.Fatal("retry-with-model attempt should carry recomputation warning")
	}
	if attempt.Metadata["retry_mode"] != "model" || attempt.Metadata["warning_ack"] != true {
		t.Fatalf("attempt metadata = %#v, want model warning provenance", attempt.Metadata)
	}
}
