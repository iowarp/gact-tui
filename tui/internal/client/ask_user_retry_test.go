package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestAgentQuestionClientEndpoints(t *testing.T) {
	var answered bool
	var retried bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/v1/sessions/s1/questions":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"questions": []gact.AgentQuestion{{ID: "q1", Prompt: "Pick one."}},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/s1/questions/q1/answer":
			var req gact.AgentQuestionAnswerRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode answer: %v", err)
			}
			if req.ChoiceID != "yes" {
				t.Fatalf("choice_id = %q, want yes", req.ChoiceID)
			}
			answered = true
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/s1/messages/m1/retry":
			var req gact.RetryRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode retry: %v", err)
			}
			if req.Notes != "try again" {
				t.Fatalf("notes = %q", req.Notes)
			}
			retried = true
			_ = json.NewEncoder(w).Encode(gact.RetryAttempt{ID: "attempt_1", Status: "queued"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	c := New(srv.URL)
	questions, err := c.ListPendingQuestions(t.Context(), "s1")
	if err != nil {
		t.Fatalf("ListPendingQuestions: %v", err)
	}
	if len(questions) != 1 || questions[0].ID != "q1" {
		t.Fatalf("questions = %#v", questions)
	}
	if err := c.AnswerQuestion(t.Context(), "s1", "q1", gact.AgentQuestionAnswerRequest{ChoiceID: "yes"}); err != nil {
		t.Fatalf("AnswerQuestion: %v", err)
	}
	attempt, err := c.RetryMessage(t.Context(), "s1", "m1", gact.RetryRequest{Notes: "try again"})
	if err != nil {
		t.Fatalf("RetryMessage: %v", err)
	}
	if attempt.ID != "attempt_1" || !answered || !retried {
		t.Fatalf("attempt=%#v answered=%v retried=%v", attempt, answered, retried)
	}
}
