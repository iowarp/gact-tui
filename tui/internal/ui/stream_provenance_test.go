package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestApplyPartDeltaPreservesStreamProvenance(t *testing.T) {
	a := New("http://unused")
	a.messages = []gact.Message{{
		ID: "msg_1",
		Parts: []gact.Part{{
			ID:   "part_1",
			Type: gact.PartTypeText,
		}},
	}}

	a.applyPartDelta(client.SSEEvent{
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

	part := a.messages[0].Parts[0]
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

func TestRenderPartShowsSyntheticStreamProvenance(t *testing.T) {
	part := gact.Part{
		Type: gact.PartTypeText,
		Text: "real answer text",
		Metadata: map[string]any{
			"stream_source":   "synthetic_posthoc",
			"stream_fallback": map[string]any{"reason": "agent_not_streamable"},
		},
	}

	got := DefaultTheme().renderPart(part, 80)
	if !strings.Contains(got, "synthetic stream: agent_not_streamable") {
		t.Fatalf("rendered part did not expose synthetic provenance: %q", got)
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
	if strings.Contains(got, "synthetic stream") {
		t.Fatalf("live stream should not render synthetic badge: %q", got)
	}
}
