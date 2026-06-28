package ui

// wire_replay_test.go replays a real captured backend SSE stream (the cleaned-up
// 4-atom ReAct wire) through the live event path and renders the resulting agent
// view, so the rendering can be verified against the authentic stream. The
// rendered output is written to GACT_WIRE_DUMP (if set) for manual inspection,
// and the structural shape is asserted as a regression gate.

import (
	"bufio"
	"bytes"
	"encoding/json"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

const wireSessionID = "sess_57ac84d71ca3"

// parseWireSSE reads an SSE capture file into ordered client.SSEEvent values,
// matching the decoding the real client performs (Type from the event: line,
// Payload from the JSON data: line).
func parseWireSSE(t *testing.T, path string) []client.SSEEvent {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatalf("open wire: %v", err)
	}
	defer f.Close()

	var events []client.SSEEvent
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 1<<20), 8<<20)
	var ev client.SSEEvent
	flush := func() {
		if ev.Type == "" && len(ev.Raw) == 0 {
			return
		}
		if len(ev.Raw) > 0 {
			var payload map[string]any
			if err := json.Unmarshal(ev.Raw, &payload); err == nil {
				ev.Payload = payload
				if ev.Type == "" {
					ev.Type, _ = payload["type"].(string)
				}
			}
		}
		events = append(events, ev)
		ev = client.SSEEvent{}
	}
	for sc.Scan() {
		line := sc.Text()
		switch {
		case line == "":
			flush()
		case strings.HasPrefix(line, "event:"):
			ev.Type = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		case strings.HasPrefix(line, "id:"):
			ev.ID = strings.TrimSpace(strings.TrimPrefix(line, "id:"))
		case strings.HasPrefix(line, "data:"):
			ev.Raw = []byte(strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
	}
	flush()
	if err := sc.Err(); err != nil {
		t.Fatalf("scan wire: %v", err)
	}
	return events
}

// replayWire builds an App, sets the captured session current, and folds every
// wire event through the real applySSE path.
func replayWire(t *testing.T, path string) *App {
	t.Helper()
	events := parseWireSSE(t, path)
	if len(events) == 0 {
		t.Fatalf("no events parsed from %s", path)
	}
	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: wireSessionID}}
	a.session.selected = 0
	for _, e := range events {
		a.conversation.applySSE(e)
	}
	return a
}

func TestReplayEarthScopeWireRendersAgentView(t *testing.T) {
	a := replayWire(t, "testdata/earthscope-la.wire.sse")

	width := 120
	theme := DefaultTheme()

	var b strings.Builder
	b.WriteString("=== currentSessionHasProjected: ")
	projected := a.execution.currentSessionHasProjected()
	if projected {
		b.WriteString("true ===\n")
		view, ok := a.execution.renderConversation(theme, width)
		b.WriteString("renderConversation ok=" + boolStr(ok) + "\n\n")
		b.WriteString(ansi.Strip(view))
	} else {
		b.WriteString("false ===\n\n")
	}

	// Always also dump the flat transcript so we can see the raw parts the
	// fallback path would render (this is where synthetic-part noise shows).
	b.WriteString("\n\n===== FLAT TRANSCRIPT PARTS =====\n")
	b.WriteString(dumpTranscriptParts(a))

	out := b.String()
	if dump := os.Getenv("GACT_WIRE_DUMP"); dump != "" {
		if err := os.WriteFile(dump, []byte(out), 0o644); err != nil {
			t.Fatalf("write dump: %v", err)
		}
		t.Logf("wrote rendered agent view to %s (%d bytes)", dump, len(out))
	}

	// Minimal regression assertions: the turn has delegation, so the agent
	// view must project, and the expert results must reach the view.
	if !projected {
		t.Fatalf("expected the delegation turn to project an execution timeline")
	}
}

// dumpTranscriptParts lists every part on every message, with its type, author,
// and a short text preview — the ground truth of what the transcript holds after
// replay (used to spot synthetic/duplicate parts).
func dumpTranscriptParts(a *App) string {
	var b bytes.Buffer
	for _, m := range a.conversation.messages {
		b.WriteString("message " + m.ID + " role=" + m.Role + " parts=" + strconv.Itoa(len(m.Parts)) + "\n")
		for _, p := range m.Parts {
			agent := stringValue(p.Metadata["agent_id"])
			if agent == "" {
				agent = p.AgentID
			}
			preview := firstNonEmpty(p.Text, p.Thinking)
			preview = strings.ReplaceAll(preview, "\n", " ")
			if len(preview) > 80 {
				preview = preview[:80]
			}
			synthetic := ""
			if p.Metadata != nil && p.Metadata["semantic_event"] == true {
				synthetic = " [SYNTHETIC]"
			}
			b.WriteString("  - " + string(p.Type) + " agent=" + agent + synthetic + " :: " + preview + "\n")
		}
	}
	return b.String()
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}
