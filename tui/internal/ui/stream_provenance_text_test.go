package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestApplyPartDeltaPreservesStreamProvenance(t *testing.T) {
	a := New("http://unused")
	a.conversation.messages = []gact.Message{{
		ID: "msg_1",
		Parts: []gact.Part{{
			ID:   "part_1",
			Type: gact.PartTypeText,
		}},
	}}

	a.conversation.applyPartDelta(client.SSEEvent{
		Type: "message.part.delta",
		Payload: map[string]any{
			"payload": map[string]any{
				"message_id":      "msg_1",
				"part_id":         "part_1",
				"stream_source":   "synthetic_posthoc",
				"stream_fallback": map[string]any{"reason": "sync_execution_path"},
				"delta":           map[string]any{"text_append": "hello"},
			},
		},
	})

	part := a.conversation.messages[0].Parts[0]
	if part.Text != "hello" {
		t.Fatalf("text = %q, want hello", part.Text)
	}
	if part.Metadata["stream_source"] != "synthetic_posthoc" {
		t.Fatalf("stream_source = %#v", part.Metadata["stream_source"])
	}
	fallback, ok := part.Metadata["stream_fallback"].(map[string]any)
	if !ok || fallback["reason"] != "sync_execution_path" {
		t.Fatalf("stream_fallback = %#v", part.Metadata["stream_fallback"])
	}
}

func TestApplyPartAddedPreservesPosthocTextProvenance(t *testing.T) {
	a := New("http://unused")
	a.conversation.messages = []gact.Message{{ID: "msg_1"}}

	a.conversation.applyPartAdded(client.SSEEvent{
		Type: "message.part.added",
		Payload: map[string]any{
			"payload": map[string]any{
				"message_id": "msg_1",
				"part": map[string]any{
					"id":   "part_1",
					"type": "text",
					"text": "complete answer text",
					"metadata": map[string]any{
						"stream_source":   "synthetic_posthoc",
						"stream_fallback": map[string]any{"reason": "stream_completed_without_chunks"},
					},
				},
			},
		},
	})

	part := a.conversation.messages[0].Parts[0]
	if part.Text != "complete answer text" {
		t.Fatalf("text = %q, want completed answer text", part.Text)
	}
	if part.Metadata["stream_source"] != "synthetic_posthoc" {
		t.Fatalf("stream_source = %#v", part.Metadata["stream_source"])
	}
	fallback, ok := part.Metadata["stream_fallback"].(map[string]any)
	if !ok || fallback["reason"] != "stream_completed_without_chunks" {
		t.Fatalf("stream_fallback = %#v", part.Metadata["stream_fallback"])
	}
}

func TestRenderPartShowsPosthocTextProvenance(t *testing.T) {
	part := gact.Part{
		Type: gact.PartTypeText,
		Text: "real answer text",
		Metadata: map[string]any{
			"stream_source":   "synthetic_posthoc",
			"stream_fallback": map[string]any{"reason": "agent_not_streamable"},
		},
	}

	got := DefaultTheme().renderPart(part, 80)
	if !strings.Contains(got, "post-hoc text: agent_not_streamable") {
		t.Fatalf("rendered part did not expose post-hoc provenance: %q", got)
	}
	if !strings.Contains(got, "real answer text") {
		t.Fatalf("rendered part lost answer text: %q", got)
	}
}

func TestRenderPartDoesNotBadgeLiveStream(t *testing.T) {
	part := gact.Part{
		Type: gact.PartTypeText,
		Text: "live answer text",
		Metadata: map[string]any{
			"stream_source": "live",
		},
	}

	got := DefaultTheme().renderPart(part, 80)
	if strings.Contains(got, "post-hoc text") {
		t.Fatalf("live stream should not render post-hoc badge: %q", got)
	}
}

func TestRenderBodySuppressesEmptyAssistantShells(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 32
	a.stage = StageReady
	a.session.sessions = []gact.Session{{ID: "s1", Title: "demo", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{
			ID:        "m_empty",
			SessionID: "s1",
			Role:      gact.RoleAssistant,
		},
		{
			ID:        "m_answer",
			SessionID: "s1",
			Role:      gact.RoleAssistant,
			Parts:     []gact.Part{{ID: "p_answer", Type: gact.PartTypeText, Text: "real answer"}},
		},
	}

	out := ansi.Strip(a.View().Content)
	if strings.Contains(out, "(no parts)") {
		t.Fatalf("empty assistant shell should be hidden:\n%s", out)
	}
	if !strings.Contains(out, "real answer") {
		t.Fatalf("non-empty answer should still render:\n%s", out)
	}
}
