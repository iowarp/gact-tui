package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestRenderAgentQuestionPart(t *testing.T) {
	msg := gact.Message{
		ID:   "msg_question",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:   "part_question",
			Type: gact.PartTypeAgentQuestion,
			Question: &gact.AgentQuestion{
				ID:                 "q_missing_target",
				Prompt:             "Which dataset should I inspect before continuing?",
				AgentID:            "data_expert",
				Category:           "clarification",
				ExpectedAnswerType: "choice",
				AllowFreeform:      true,
				Choices: []gact.AgentQuestionChoice{
					{ID: "csv", Label: "CSV"},
					{ID: "parquet", Label: "Parquet"},
				},
			},
		}},
	}

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 90, nil))
	for _, want := range []string{
		"agent question",
		"data_expert",
		"Which dataset should I inspect",
		"choices: CSV, Parquet",
		"free-form answer allowed",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("question render missing %q:\n%s", want, out)
		}
	}
}

func TestAgentQuestionDetails(t *testing.T) {
	part := gact.Part{
		ID:   "part_question",
		Type: gact.PartTypeAgentQuestion,
		Question: &gact.AgentQuestion{
			ID:                 "q1",
			Prompt:             "Pick a path.",
			AgentID:            "planner",
			Category:           "ambiguity",
			ExpectedAnswerType: "path",
		},
	}

	text := partDetailText(part)
	for _, want := range []string{"question: q1", "source: planner", "prompt: Pick a path."} {
		if !strings.Contains(text, want) {
			t.Fatalf("question detail missing %q:\n%s", want, text)
		}
	}
	for _, raw := range []string{"question_id:", "attempt_id:", "source_message_id:", "attempt_message_id:"} {
		if strings.Contains(text, raw) {
			t.Fatalf("question detail should avoid raw label %q:\n%s", raw, text)
		}
	}
}

func TestUserQuestionCreatedSSEOpensModalAndAddsTranscriptPart(t *testing.T) {
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0

	a.conversation.applySSE(client.SSEEvent{
		Type: "user_question.created",
		Payload: map[string]any{"payload": map[string]any{
			"id":         "q1",
			"session_id": "s1",
			"prompt":     "Pick a dataset.",
			"status":     "pending",
			"kind":       "choice",
			"source":     "orchestrator",
			"options": []any{
				map[string]any{"label": "CSV", "value": "csv"},
				map[string]any{"label": "Parquet", "value": "parquet"},
			},
		}},
	})

	if !a.askUser.open || a.askUser.question.ID != "q1" {
		t.Fatalf("ask user modal not opened: open=%v question=%#v", a.askUser.open, a.askUser.question)
	}
	if len(a.conversation.messages) != 1 || len(a.conversation.messages[0].Parts) != 1 || a.conversation.messages[0].Parts[0].Question == nil {
		t.Fatalf("question SSE should add transcript question part: %#v", a.conversation.messages)
	}
	if got := len(questionOptions(*a.conversation.messages[0].Parts[0].Question)); got != 2 {
		t.Fatalf("question options = %d, want 2", got)
	}

	a.conversation.applySSE(client.SSEEvent{
		Type: "user_question.answered",
		Payload: map[string]any{"payload": map[string]any{
			"id":               "q1",
			"session_id":       "s1",
			"prompt":           "Pick a dataset.",
			"status":           "answered",
			"selected_options": []any{"csv"},
		}},
	})

	if a.askUser.open {
		t.Fatal("answered question should close modal")
	}
	if got := a.conversation.messages[0].Parts[0].Question.Status; got != "answered" {
		t.Fatalf("question status = %q, want answered", got)
	}

	a.askUser.open = true
	a.askUser.question = gact.AgentQuestion{ID: "q2", Prompt: "Continue?", Status: "pending"}
	a.conversation.messages = append(a.conversation.messages, gact.Message{
		ID:   "msg_q2",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:       "part_q2",
			Type:     gact.PartTypeAgentQuestion,
			Question: &gact.AgentQuestion{ID: "q2", Prompt: "Continue?", Status: "pending"},
		}},
	})
	a.conversation.applySSE(client.SSEEvent{
		Type: "user_question.cancelled",
		Payload: map[string]any{"payload": map[string]any{
			"id":         "q2",
			"session_id": "s1",
			"prompt":     "Continue?",
			"status":     "cancelled",
		}},
	})
	if a.askUser.open {
		t.Fatal("cancelled question should close modal")
	}
	if got := a.conversation.messages[1].Parts[0].Question.Status; got != "cancelled" {
		t.Fatalf("cancelled question status = %q, want cancelled", got)
	}

	a.askUser.open = true
	a.askUser.question = gact.AgentQuestion{ID: "q3", Prompt: "Still needed?", Status: "pending"}
	a.conversation.messages = append(a.conversation.messages, gact.Message{
		ID:   "msg_q3",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:       "part_q3",
			Type:     gact.PartTypeAgentQuestion,
			Question: &gact.AgentQuestion{ID: "q3", Prompt: "Still needed?", Status: "pending"},
		}},
	})
	a.conversation.applySSE(client.SSEEvent{
		Type: "user_question.expired",
		Payload: map[string]any{"payload": map[string]any{
			"id":         "q3",
			"session_id": "s1",
			"prompt":     "Still needed?",
			"status":     "expired",
		}},
	})
	if a.askUser.open {
		t.Fatal("expired question should close modal")
	}
	if got := a.conversation.messages[2].Parts[0].Question.Status; got != "expired" {
		t.Fatalf("expired question status = %q, want expired", got)
	}
}

func TestAskUserModalUsesOperatorFacingSourceCopy(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 140
	a.height = 36
	a.askUser.open = true
	a.askUser.question = gact.AgentQuestion{
		ID:     "q1",
		Prompt: "Which dataset should I inspect?",
		Source: "planner",
	}

	out := ansi.Strip(a.askUser.view())
	for _, want := range []string{"Answer agent question", "Which dataset should I inspect?", "Asked by planner"} {
		if !strings.Contains(out, want) {
			t.Fatalf("ask-user modal missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "source: planner") {
		t.Fatalf("ask-user modal leaked raw source label:\n%s", out)
	}
}

func TestAskUserPasteRoutesToModalDraft(t *testing.T) {
	a := New("http://unused")
	a.askUser.open = true
	a.askUser.question = gact.AgentQuestion{ID: "q1", Prompt: "Which dataset?"}
	a.askUser.input.SetValue("Use ")
	a.askUser.input.SetCursor(len([]rune(a.askUser.input.Value())))

	_, _ = a.Update(tea.PasteMsg{Content: "CSV\r\nfor the benchmark"})

	if got := a.askUser.input.Value(); got != "Use CSV for the benchmark" {
		t.Fatalf("ask user draft = %q", got)
	}
	if a.askUser.input.Cursor() != len([]rune(a.askUser.input.Value())) {
		t.Fatalf("ask user cursor = %d, want end %d", a.askUser.input.Cursor(), len([]rune(a.askUser.input.Value())))
	}
}

func TestCancelAskUserQuestionSendsBackendCancel(t *testing.T) {
	cancelled := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/sessions/s1/questions/q1/cancel" {
			http.NotFound(w, r)
			return
		}
		cancelled = true
		_ = json.NewEncoder(w).Encode(gact.UserQuestion{ID: "q1", SessionID: "s1", Status: "cancelled"})
	}))
	defer srv.Close()

	a := New(srv.URL)
	a.c = client.New(srv.URL)
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.askUser.open = true
	a.askUser.question = gact.AgentQuestion{ID: "q1", Prompt: "Continue?", Status: "pending"}

	cmd := a.askUser.cancel()
	if cmd == nil {
		t.Fatal("cancelAskUserQuestion returned nil command")
	}
	msg := cmd()
	cancelMsg, ok := msg.(agentQuestionCancelledMsg)
	if !ok {
		t.Fatalf("cmd msg = %T, want agentQuestionCancelledMsg", msg)
	}
	if cancelMsg.err != nil {
		t.Fatalf("cancel command error: %v", cancelMsg.err)
	}
	if !cancelled {
		t.Fatal("server did not receive cancel request")
	}
	if a.askUser.open {
		t.Fatal("cancelAskUserQuestion should close the modal optimistically")
	}
}

func TestAskUserCtrlXCancelsQuestion(t *testing.T) {
	cancelled := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/sessions/s1/questions/q1/cancel" {
			http.NotFound(w, r)
			return
		}
		cancelled = true
		_ = json.NewEncoder(w).Encode(gact.UserQuestion{ID: "q1", SessionID: "s1", Status: "cancelled"})
	}))
	defer srv.Close()

	a := New(srv.URL)
	a.c = client.New(srv.URL)
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.askUser.open = true
	a.askUser.question = gact.AgentQuestion{ID: "q1", Prompt: "Continue?", Status: "pending"}

	_, cmd := a.askUser.handleKey(tea.KeyPressMsg{Code: 'x', Mod: tea.ModCtrl})
	if cmd == nil {
		t.Fatal("Ctrl+X should dispatch a cancel command")
	}
	msg := cmd()
	cancelMsg, ok := msg.(agentQuestionCancelledMsg)
	if !ok {
		t.Fatalf("cmd msg = %T, want agentQuestionCancelledMsg", msg)
	}
	if cancelMsg.err != nil {
		t.Fatalf("cancel command error: %v", cancelMsg.err)
	}
	if !cancelled {
		t.Fatal("server did not receive cancel request")
	}
}
