package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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

func TestRenderRetryAttemptPart(t *testing.T) {
	msg := gact.Message{
		ID:   "msg_retry",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:   "part_retry",
			Type: gact.PartTypeRetryAttempt,
			RetryAttempt: &gact.RetryAttempt{
				ID:                "attempt_2",
				OriginalMessageID: "msg_original",
				Status:            "started",
				Notes:             "Use the CSV instead of the Parquet file.",
				Model:             &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-sonnet"},
				Warning:           "Retrying with a different model may recompute provider-side KV cache.",
			},
		}},
	}

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 90, nil))
	for _, want := range []string{
		"retry attempt",
		"started",
		"anthropic/claude-sonnet",
		"Use the CSV instead",
		"recompute provider-side KV cache",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("retry render missing %q:\n%s", want, out)
		}
	}
}

func TestAgentQuestionAndRetryAttemptDetails(t *testing.T) {
	question := gact.Part{
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
	retry := gact.Part{
		ID:   "part_retry",
		Type: gact.PartTypeRetryAttempt,
		RetryAttempt: &gact.RetryAttempt{
			ID:                "attempt_1",
			OriginalMessageID: "msg_1",
			Status:            "queued",
			Notes:             "Try again with notes.",
		},
	}

	for _, tc := range []struct {
		name string
		part gact.Part
		want []string
	}{
		{"question", question, []string{"question_id: q1", "source: planner", "prompt: Pick a path."}},
		{"retry", retry, []string{"attempt_id: attempt_1", "source_message_id: msg_1", "notes: Try again with notes."}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			text := partDetailText(tc.part)
			for _, want := range tc.want {
				if !strings.Contains(text, want) {
					t.Fatalf("detail missing %q:\n%s", want, text)
				}
			}
		})
	}
}

func TestRetryModelModalWarnsBeforeCommit(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.retryModelOpen = true
	a.retryModelMsgID = "msg_1"
	a.retryModelDraft = "openai/gpt-4.1"
	a.retryModelCursor = len(a.retryModelDraft)

	out := ansi.Strip(a.viewRetryModel())
	for _, want := range []string{
		"Retry with model",
		"provider/model override",
		"recompute provider-side KV cache",
		"time-to-first-token",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("retry model modal missing %q:\n%s", want, out)
		}
	}
}

func TestCommitRetryModelSendsExplicitOverrideAndWarningAck(t *testing.T) {
	var got gact.RetryTurnRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/sessions/s1/messages/m1/retry" {
			http.NotFound(w, r)
			return
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode retry model request: %v", err)
		}
		_ = json.NewEncoder(w).Encode(gact.TurnAttempt{ID: "attempt_model", Status: "queued"})
	}))
	defer srv.Close()

	a := New(srv.URL)
	a.c = client.New(srv.URL)
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0
	a.retryModelOpen = true
	a.retryModelMsgID = "m1"
	a.retryModelDraft = "anthropic/claude-sonnet"
	a.retryModelCursor = len(a.retryModelDraft)

	_, cmd := a.commitRetryModel()
	if cmd == nil {
		t.Fatal("commitRetryModel returned nil command")
	}
	msg := cmd()
	retryMsg, ok := msg.(retryTurnStartedMsg)
	if !ok {
		t.Fatalf("cmd msg = %T, want retryTurnStartedMsg", msg)
	}
	if retryMsg.err != nil {
		t.Fatalf("retry command error: %v", retryMsg.err)
	}
	if !got.Execute || got.ProviderID != "anthropic" || got.ModelID != "claude-sonnet" || got.Model == nil {
		t.Fatalf("retry request = %#v, want execute with model override", got)
	}
	if got.Metadata["retry_mode"] != "model" || got.Metadata["warning_ack"] != true {
		t.Fatalf("retry metadata = %#v, want model warning ack", got.Metadata)
	}
}

func TestCommitRetryModelRejectsUnstructuredModel(t *testing.T) {
	a := New("http://unused")
	a.sessions = []gact.Session{{ID: "s1"}}
	a.selected = 0
	a.retryModelOpen = true
	a.retryModelMsgID = "m1"
	a.retryModelDraft = "claude-sonnet"

	_, cmd := a.commitRetryModel()
	if cmd != nil {
		t.Fatal("invalid retry model should not dispatch a command")
	}
	if !strings.Contains(a.transientHint, "provider/model") {
		t.Fatalf("hint = %q, want provider/model guidance", a.transientHint)
	}
}
