package ui

import (
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestConversationRenderCacheTracksChangedPartTextWithoutGlobalInvalidation(t *testing.T) {
	app := benchmarkLargeSemanticTranscriptApp(120, 34, 1)
	app.conversation.messages[1].Parts[len(app.conversation.messages[1].Parts)-1].Text = "Final answer: first version."
	first := ansi.Strip(app.conversation.cachedMessageRender(app.Theme, themeRenderSignature(app.Theme), app.conversation.messages[1], &app.conversation.messages[0], 80, nil, "").row)
	if !strings.Contains(first, "first version") {
		t.Fatalf("initial render missing first version:\n%s", first)
	}

	app.conversation.messages[1].Parts[len(app.conversation.messages[1].Parts)-1].Text = "Final answer: changed version."
	second := ansi.Strip(app.conversation.cachedMessageRender(app.Theme, themeRenderSignature(app.Theme), app.conversation.messages[1], &app.conversation.messages[0], 80, nil, "").row)
	if !strings.Contains(second, "changed version") {
		t.Fatalf("cached render did not reflect changed text:\n%s", second)
	}
	if strings.Contains(second, "first version") {
		t.Fatalf("cached render leaked stale text:\n%s", second)
	}
}

func TestConversationRenderCacheTracksPartAddedWithoutGlobalInvalidation(t *testing.T) {
	app := benchmarkLargeSemanticTranscriptApp(120, 34, 1)
	app.conversation.messages[1].Parts = app.conversation.messages[1].Parts[:1]
	first := ansi.Strip(app.conversation.cachedMessageRender(app.Theme, themeRenderSignature(app.Theme), app.conversation.messages[1], &app.conversation.messages[0], 80, nil, "").row)
	if strings.Contains(first, "late evidence") {
		t.Fatalf("initial render unexpectedly had late part:\n%s", first)
	}

	app.conversation.messages[1].Parts = append(app.conversation.messages[1].Parts, gact.Part{
		ID:   "late_part",
		Type: gact.PartTypeText,
		Text: "late evidence arrived while streaming",
	})
	second := ansi.Strip(app.conversation.cachedMessageRender(app.Theme, themeRenderSignature(app.Theme), app.conversation.messages[1], &app.conversation.messages[0], 80, nil, "").row)
	if !strings.Contains(second, "late evidence arrived while streaming") {
		t.Fatalf("cached render did not reflect appended part:\n%s", second)
	}
}

func TestConversationRenderCacheTracksPartDeltaWithoutGlobalInvalidation(t *testing.T) {
	app := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	app.conversation.messages = []gact.Message{{
		ID:   "msg_1",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:   "part_1",
			Type: gact.PartTypeText,
			Text: "streaming",
		}},
	}}
	first := ansi.Strip(app.conversation.cachedMessageRender(app.Theme, themeRenderSignature(app.Theme), app.conversation.messages[0], nil, 80, nil, "").row)
	if !strings.Contains(first, "streaming") {
		t.Fatalf("initial render missing streamed text:\n%s", first)
	}

	app.conversation.applyPartDelta(client.SSEEvent{
		Type: "message.part.delta",
		Payload: map[string]any{"payload": map[string]any{
			"message_id": "msg_1",
			"part_id":    "part_1",
			"delta":      map[string]any{"text_append": " update"},
		}},
	})
	second := ansi.Strip(app.conversation.cachedMessageRender(app.Theme, themeRenderSignature(app.Theme), app.conversation.messages[0], nil, 80, nil, "").row)
	if !strings.Contains(second, "streaming update") {
		t.Fatalf("cached render did not reflect text delta:\n%s", second)
	}
}

// conversationContentSignal is the cheap structural/length companion to the
// per-message epoch. It must change when a part's render-affecting structure or
// text length changes, and must NOT depend on metadata (that is the epoch's
// job, bumped by the SSE handlers) so unrelated metadata churn doesn't force a
// spurious re-render.
func TestConversationContentSignalTracksStructureAndLengthNotMetadata(t *testing.T) {
	msg := benchmarkAssistantSemanticMessage(0, time.Date(2026, 6, 11, 9, 0, 0, 0, time.UTC))
	original := conversationContentSignal(msg)

	// Metadata churn alone must not move the structural signal.
	msg.Metadata["raw_event"] = map[string]any{"debug": "different raw payload"}
	msg.Metadata["workflow_state"] = map[string]any{"status": "changed"}
	if got := conversationContentSignal(msg); got != original {
		t.Fatalf("metadata change must not affect the content signal: got %x want %x", got, original)
	}

	// A text-length change must move the signal.
	last := len(msg.Parts) - 1
	msg.Parts[last].Text += " more"
	if got := conversationContentSignal(msg); got == original {
		t.Fatalf("text-length change should move the content signal")
	}

	// Appending a part must move the signal.
	grown := conversationContentSignal(msg)
	msg.Parts = append(msg.Parts, gact.Part{ID: "extra", Type: gact.PartTypeText, Text: "x"})
	if got := conversationContentSignal(msg); got == grown {
		t.Fatalf("appended part should move the content signal")
	}
}

// The epoch is the invalidation primitive for metadata/flag/value changes the
// cheap content signal deliberately ignores. A different epoch must produce a
// different cache key (so the entry is re-rendered), and an unchanged epoch
// must be stable (so warm frames keep hitting).
func TestConversationRenderCacheKeyRespondsToEpoch(t *testing.T) {
	theme := ThemeForMode(ModeDark)
	m := gact.Message{
		ID:    "m1",
		Role:  gact.RoleAssistant,
		Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "hello"}},
	}
	sig := themeRenderSignature(theme)
	k0 := conversationRenderCacheKey(0, sig, m, 0, nil, 80, nil, "")
	if got := conversationRenderCacheKey(0, sig, m, 0, nil, 80, nil, ""); got != k0 {
		t.Fatalf("identical inputs must produce a stable cache key: %x vs %x", got, k0)
	}
	if got := conversationRenderCacheKey(0, sig, m, 1, nil, 80, nil, ""); got == k0 {
		t.Fatalf("a bumped epoch must change the cache key")
	}
	if got := conversationRenderCacheKey(0, sig+1, m, 0, nil, 80, nil, ""); got == k0 {
		t.Fatalf("a different theme signature must change the cache key")
	}
}

// The per-part render memo must be output-transparent: a cached render equals
// a fresh one, and a content change (e.g. a handoff flipping running ->
// completed) produces a different render rather than a stale hit.
func TestCachedPurePartRenderIsTransparentAndContentKeyed(t *testing.T) {
	theme := ThemeForMode(ModeDark)
	sig := themeRenderSignature(theme)
	p := gact.Part{
		ID:   "h1",
		Type: gact.PartTypeExpertHandoff,
		Text: "delegating to data",
		Metadata: map[string]any{
			"agent_id": "data", "parent_id": "main",
			"stage": "delegate.started", "status": "running",
		},
	}
	direct := theme.renderPart(p, 80)
	cached1 := theme.cachedPurePartRender(sig, p, 80)
	cached2 := theme.cachedPurePartRender(sig, p, 80)
	if cached1 != direct || cached2 != direct {
		t.Fatalf("cached part render must equal the direct render")
	}

	p.Metadata["status"] = "completed"
	p.Metadata["stage"] = "delegate.completed"
	if got := theme.cachedPurePartRender(sig, p, 80); got == cached1 {
		t.Fatalf("a content change must produce a different cached render, not a stale hit")
	}
	if got, want := theme.cachedPurePartRender(sig, p, 80), theme.renderPart(p, 80); got != want {
		t.Fatalf("post-change cached render must still equal the direct render")
	}
}

// Contract guard: every SSE handler that mutates a message's render-affecting
// content MUST bump that message's epoch. If a future change adds a mutation
// path (or drops a bump), this fails loudly rather than silently serving stale
// renders for same-length metadata/flag changes the content signal can't see.
func TestSSEMutationHandlersBumpMessageEpoch(t *testing.T) {
	newApp := func() *App {
		app := NewWithTheme("http://unused", ThemeForMode(ModeDark))
		app.conversation.messages = []gact.Message{{
			ID:    "m1",
			Role:  gact.RoleAssistant,
			Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "x"}},
		}}
		return app
	}
	ev := func(payload map[string]any) client.SSEEvent {
		return client.SSEEvent{Payload: map[string]any{"payload": payload}}
	}
	cases := []struct {
		name string
		fire func(a *App)
	}{
		{"applyPartDelta", func(a *App) {
			a.conversation.applyPartDelta(ev(map[string]any{
				"message_id": "m1", "part_id": "p1",
				"delta": map[string]any{"text_append": " y"},
			}))
		}},
		{"applyPartAdded", func(a *App) {
			a.conversation.applyPartAdded(ev(map[string]any{
				"message_id": "m1",
				"part":       map[string]any{"id": "p2", "type": "text", "text": "added"},
			}))
		}},
		{"applyPartCompleted", func(a *App) {
			a.conversation.applyPartCompleted(ev(map[string]any{
				"message_id": "m1", "part_id": "p1",
				"final_text": "final",
			}))
		}},
		{"applyMessageCompleted", func(a *App) {
			a.conversation.applyMessageCompleted(ev(map[string]any{
				"message_id": "m1",
				"metadata":   map[string]any{"tools_called": []any{}},
			}))
		}},
		{"applyMessageCreated", func(a *App) {
			a.conversation.applyMessageCreated(ev(map[string]any{
				"id": "m1", "role": "assistant",
				"parts": []any{map[string]any{"id": "p1", "type": "text", "text": "replaced"}},
			}))
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := newApp()
			before := app.conversation.msgRenderEpoch["m1"]
			tc.fire(app)
			if app.conversation.msgRenderEpoch["m1"] <= before {
				t.Fatalf("%s did not bump the message epoch (before=%d after=%d)", tc.name, before, app.conversation.msgRenderEpoch["m1"])
			}
		})
	}
}
