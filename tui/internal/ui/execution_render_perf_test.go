package ui

import (
	"time"

	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// benchmarkProjectedExecutionApp builds a long multi-agent session whose
// conversation render goes through the EXECUTION-PROJECTION branch
// (renderConversation) — the path real clio sessions take. `turns` user
// messages each carry a full geo→data→ndp delegation ledger, so the projection
// + timeline render is exercised at scale, the way it is on every frame /
// keystroke / SSE token during a streaming turn.
func benchmarkProjectedExecutionApp(width, height, turns int) *App {
	app := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	app.width = width
	app.height = height
	app.stage = StageReady
	app.focus = FocusBody
	app.conversation.stickyToBottom = true
	app.session.sessions = []gact.Session{{
		ID:        "sess_perf",
		Title:     "large projected execution",
		Status:    gact.StatusIdle,
		CreatedAt: time.Date(2026, 6, 11, 9, 0, 0, 0, time.UTC),
		UpdatedAt: time.Date(2026, 6, 11, 9, 5, 0, 0, time.UTC),
	}}
	app.session.selected = 0
	app.session.currentStatus = gact.StatusIdle

	base := executionTimelineFixtureMainGeoDataNDP()
	var msgs []gact.Message
	var ledger []executionTimelineEvent
	seq := 0
	for tn := 0; tn < turns; tn++ {
		msgs = append(msgs, gact.Message{
			ID:        "u" + itoa(tn),
			SessionID: "sess_perf",
			Role:      gact.RoleUser,
			Parts:     []gact.Part{{ID: "pu" + itoa(tn), Type: gact.PartTypeText, Text: "Find and analyze the nearest station."}},
		})
		for _, e := range base {
			seq++
			ce := e
			ce.Sequence = seq
			ce.SessionID = "sess_perf"
			ledger = append(ledger, ce)
		}
	}
	app.conversation.messages = msgs
	app.execution.executionEventsBySession = map[string][]executionTimelineEvent{"sess_perf": ledger}
	app.conversation.bodySelMsgIdx = turns - 1
	app.conversation.bodySelPartIdx = 0
	return app
}

// BenchmarkRenderProjectedExecutionTranscript measures a WARM conversation
// render on the execution-projection path (the multi-agent clio hot path). A
// warm frame should hit the render cache and not re-project / re-render the
// whole transcript.
func BenchmarkRenderProjectedExecutionTranscript(b *testing.B) {
	app := benchmarkProjectedExecutionApp(160, 48, 24)
	// Sanity: confirm we are actually on the projection branch.
	if !app.execution.currentSessionHasProjected() {
		b.Fatal("benchmark must exercise the projected-execution render path")
	}
	_ = app.conversation.render(app.width-40, app.height-3)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = app.conversation.render(app.width-40, app.height-3)
	}
}

// BenchmarkStreamingProjectedExecutionTranscript measures a single SSE-token
// frame: one event is appended to the active turn's ledger and the conversation
// is re-rendered, the way it happens on every streamed token. With per-turn
// caching only the active turn re-renders; every prior turn is reused.
func BenchmarkStreamingProjectedExecutionTranscript(b *testing.B) {
	app := benchmarkProjectedExecutionApp(160, 48, 24)
	sid := "sess_perf"
	tick := deltaEvent(0, "streaming token of assistant prose being appended to the active turn …")
	// Warm the caches for the established transcript.
	_ = app.conversation.render(app.width-40, app.height-3)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ev := tick
		ev.Sequence = 100000 + i
		ev.SessionID = sid
		app.execution.executionEventsBySession[sid] = append(app.execution.executionEventsBySession[sid], ev)
		_ = app.conversation.render(app.width-40, app.height-3)
	}
}
