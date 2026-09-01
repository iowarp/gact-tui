package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

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

func TestRetryAttemptDetails(t *testing.T) {
	part := gact.Part{
		ID:   "part_retry",
		Type: gact.PartTypeRetryAttempt,
		RetryAttempt: &gact.RetryAttempt{
			ID:                "attempt_1",
			OriginalMessageID: "msg_1",
			Status:            "queued",
			Notes:             "Try again with notes.",
		},
	}

	text := partDetailText(part)
	for _, want := range []string{"attempt: attempt_1", "source message: msg_1", "notes: Try again with notes."} {
		if !strings.Contains(text, want) {
			t.Fatalf("retry detail missing %q:\n%s", want, text)
		}
	}
	for _, raw := range []string{"attempt_id:", "source_message_id:", "attempt_message_id:"} {
		if strings.Contains(text, raw) {
			t.Fatalf("retry detail should avoid raw label %q:\n%s", raw, text)
		}
	}
}

func TestRetryModelModalWarnsBeforeCommit(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.retryModel.open = true
	a.retryModel.msgID = "msg_1"
	a.retryModel.input.SetValue("openai/gpt-4.1")
	a.retryModel.input.SetCursor(len(a.retryModel.input.Value()))

	out := ansi.Strip(a.retryModel.view())
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

func TestRetryPasteRoutesToOpenModalDraft(t *testing.T) {
	t.Run("notes", func(t *testing.T) {
		a := New("http://unused")
		a.retryNotes.open = true
		a.retryNotes.messageID = "m1"
		a.retryNotes.input.SetValue("Try ")
		a.retryNotes.input.SetCursor(len([]rune(a.retryNotes.input.Value())))

		_, _ = a.Update(tea.PasteMsg{Content: "CSV\r\ninstead"})

		if got := a.retryNotes.input.Value(); got != "Try CSV instead" {
			t.Fatalf("retry notes draft = %q", got)
		}
		if a.retryNotes.input.Cursor() != len([]rune(a.retryNotes.input.Value())) {
			t.Fatalf("retry notes cursor = %d, want end %d", a.retryNotes.input.Cursor(), len([]rune(a.retryNotes.input.Value())))
		}
	})

	t.Run("model", func(t *testing.T) {
		a := New("http://unused")
		a.retryModel.open = true
		a.retryModel.msgID = "m1"

		_, _ = a.Update(tea.PasteMsg{Content: " anthropic /\r\nclaude-sonnet "})

		if got := a.retryModel.input.Value(); got != "anthropic/claude-sonnet" {
			t.Fatalf("retry model draft = %q", got)
		}
		if a.retryModel.input.Cursor() != len([]rune(a.retryModel.input.Value())) {
			t.Fatalf("retry model cursor = %d, want end %d", a.retryModel.input.Cursor(), len([]rune(a.retryModel.input.Value())))
		}
	})
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
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.retryModel.open = true
	a.retryModel.msgID = "m1"
	a.retryModel.input.SetValue("anthropic/claude-sonnet")
	a.retryModel.input.SetCursor(len(a.retryModel.input.Value()))

	_, cmd := a.retryModel.commit()
	if cmd == nil {
		t.Fatal("retryModel.commit returned nil command")
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
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.retryModel.open = true
	a.retryModel.msgID = "m1"
	a.retryModel.input.SetValue("claude-sonnet")

	_, cmd := a.retryModel.commit()
	if cmd != nil {
		t.Fatal("invalid retry model should not dispatch a command")
	}
	if !strings.Contains(a.transientHint, "provider/model") {
		t.Fatalf("hint = %q, want provider/model guidance", a.transientHint)
	}
}
