package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
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
