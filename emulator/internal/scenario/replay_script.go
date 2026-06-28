package scenario

// replay_script.go streams a captured backend SSE wire file back onto the bus,
// so the TUI / web / desktop frontends can be driven against a real recorded
// turn (e.g. the cleaned-up 4-atom ReAct stream) for visual verification.

import (
	"bufio"
	"context"
	"encoding/json"
	"os"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
)

// replayWireEvent is one decoded SSE frame from a capture file.
type replayWireEvent struct {
	Type    string
	Payload map[string]any
}

// these wire event types are owned/emitted by the server itself on connect, so
// the replay skips them to avoid duplicate or conflicting envelopes.
var replaySkipTypes = map[string]bool{
	"server.connected":    true,
	"server.heartbeat":    true,
	"session.snapshot":    true,
	"lm.provider.changed": true,
}

// NewReplayScript returns a Script that, on each user message, streams the
// events in the given capture file to the active session (rewriting the wire's
// session id to the live one so the frontends accept the frames).
func NewReplayScript(path string) Script {
	return func(ctx context.Context, e *Engine, sessionID, userMessageID string) {
		evts, err := loadReplayWire(path)
		if err != nil || len(evts) == 0 {
			e.publishStatus(sessionID, "idle")
			return
		}
		e.publishStatus(sessionID, "running")
		defer e.publishStatus(sessionID, "idle")
		// Give the just-created session's per-session SSE subscriber time to
		// attach before we start publishing — the bus has no replay buffer, so
		// frames sent before the client subscribes are lost. The TUI/web post
		// the user message and open the events stream near-simultaneously; a
		// short lead-in removes that race for deterministic replays.
		_ = sleep(ctx, 1500*time.Millisecond)
		for _, ev := range evts {
			if ctx.Err() != nil {
				return
			}
			if replaySkipTypes[ev.Type] {
				continue
			}
			pl := ev.Payload
			if pl == nil {
				pl = map[string]any{}
			}
			// Route the frame to the live session both for bus filtering and
			// for the frontends' own session_id checks.
			pl["session_id"] = sessionID
			e.Bus().Publish(events.Event{
				Type:      ev.Type,
				SessionID: sessionID,
				Payload:   pl,
			})
			if d := e.Timing().BetweenParts; d > 0 {
				_ = sleep(ctx, d)
			}
		}
	}
}

// loadReplayWire parses an SSE capture file into ordered events.
func loadReplayWire(path string) ([]replayWireEvent, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var out []replayWireEvent
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 1<<20), 8<<20)
	var typ string
	var data []byte
	flush := func() {
		if typ == "" && len(data) == 0 {
			return
		}
		var envelope map[string]any
		if len(data) > 0 {
			_ = json.Unmarshal(data, &envelope)
		}
		if typ == "" {
			typ, _ = envelope["type"].(string)
		}
		payload, _ := envelope["payload"].(map[string]any)
		out = append(out, replayWireEvent{Type: typ, Payload: payload})
		typ = ""
		data = nil
	}
	for sc.Scan() {
		line := sc.Text()
		switch {
		case line == "":
			flush()
		case strings.HasPrefix(line, "event:"):
			typ = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		case strings.HasPrefix(line, "data:"):
			data = []byte(strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
	}
	flush()
	return out, sc.Err()
}
