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
			if r.URL.Query().Get("status") != "pending" {
				t.Fatalf("status query = %q, want pending", r.URL.Query().Get("status"))
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"questions": []gact.UserQuestion{{ID: "q1", Prompt: "Pick one."}},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/s1/questions/q1/answer":
			var req gact.AnswerUserQuestionRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode answer: %v", err)
			}
			if len(req.SelectedOptions) != 1 || req.SelectedOptions[0] != "yes" {
				t.Fatalf("selected_options = %#v, want [yes]", req.SelectedOptions)
			}
			answered = true
			_ = json.NewEncoder(w).Encode(gact.UserQuestion{ID: "q1", Status: "answered"})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/sessions/s1/attempts":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"attempts": []gact.TurnAttempt{{ID: "attempt_old", Status: "completed"}},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/s1/messages/m1/retry":
			var req gact.RetryRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode retry: %v", err)
			}
			if req.Notes != "try again" || !req.Execute {
				t.Fatalf("retry request = %#v, want notes and execute=true", req)
			}
			retried = true
			_ = json.NewEncoder(w).Encode(gact.TurnAttempt{ID: "attempt_1", Status: "queued"})
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
	if _, err := c.AnswerUserQuestion(t.Context(), "s1", "q1", gact.AnswerUserQuestionRequest{SelectedOptions: []string{"yes"}}); err != nil {
		t.Fatalf("AnswerQuestion: %v", err)
	}
	attempts, err := c.ListTurnAttempts(t.Context(), "s1")
	if err != nil || len(attempts) != 1 || attempts[0].ID != "attempt_old" {
		t.Fatalf("ListTurnAttempts: attempts=%#v err=%v", attempts, err)
	}
	attempt, err := c.RetryMessage(t.Context(), "s1", "m1", gact.RetryRequest{Notes: "try again", Execute: true})
	if err != nil {
		t.Fatalf("RetryMessage: %v", err)
	}
	if attempt.ID != "attempt_1" || !answered || !retried {
		t.Fatalf("attempt=%#v answered=%v retried=%v", attempt, answered, retried)
	}
}
