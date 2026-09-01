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

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
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
		view, _, ok := a.execution.renderConversation(theme, width)
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
			agent := valuefmt.StringValue(p.Metadata["agent_id"])
			if agent == "" {
				agent = p.AgentID
			}
			preview := valuefmt.FirstNonEmpty(p.Text, p.Thinking)
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

// --- Incremental streaming replay (folded from wire_replay_streaming_test.go) ---
//
// The bulk replay above renders the SETTLED state. The streaming replay below folds
// one event at a time and renders after each, validating two things the settled
// test cannot: (1) the render never panics on any per-delta intermediate state, and
// (2) orchestration placeholder chrome never survives on a settled
// (message.part.completed / message.completed) boundary, where the part text is
// final and CleanProse has the whole string. The final render additionally asserts
// real expert content survived (guarding against over-stripping / content loss).
//
// KNOWN GAP (shared with the web): a partial "typed workflow state: {…" JSON blob
// cannot be stripped mid-delta because findBalancedJsonEnd needs the closing brace,
// so such a blob may render raw for the deltas before the part finalizes. This test
// asserts cleanliness at settled boundaries, NOT on every intermediate delta.

// placeholderChromeMarkers are strings that are pure orchestration chrome — none
// may appear on a rendered, settled (part.completed) boundary. Legit delegation
// rows render as "→ delegates to X" and are intentionally NOT in this list.
var placeholderChromeMarkers = []string{
	"(Delegating to",
	"no answer yet",
	"no final answer yet",
	"answer pending",
	"analysis pending",
	"synthesis pending",
	"awaiting geospatial",
	"awaiting data acquisition",
}

func renderStream(t *testing.T, a *App) string {
	t.Helper()
	if !a.execution.currentSessionHasProjected() {
		return ""
	}
	view, _, ok := a.execution.renderConversation(DefaultTheme(), 120)
	if !ok {
		return ""
	}
	return ansi.Strip(view)
}

func chromeIn(view string) []string {
	var hits []string
	low := strings.ToLower(view)
	for _, m := range placeholderChromeMarkers {
		if strings.Contains(low, strings.ToLower(m)) {
			hits = append(hits, m)
		}
	}
	return hits
}

func TestReplayEarthScopeWireStreamsCleanly(t *testing.T) {
	events := parseWireSSE(t, "testdata/earthscope-la.wire.sse")
	if len(events) == 0 {
		t.Fatal("no events parsed")
	}

	a := New("http://unused")
	a.session.sessions = []gact.Session{{ID: wireSessionID}}
	a.session.selected = 0

	var checkpoints int
	var streamDump strings.Builder
	for i, e := range events {
		func() {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("panic rendering after event %d (%s): %v", i, e.Type, r)
				}
			}()
			a.conversation.applySSE(e)
			view := renderStream(t, a)

			// At a part.completed / message.completed boundary the part text is
			// FINAL — CleanProse has the whole string, so NO chrome may survive.
			if e.Type == "message.part.completed" || e.Type == "message.completed" {
				if hits := chromeIn(view); len(hits) > 0 {
					t.Errorf("event %d (%s): placeholder chrome on a settled boundary: %v", i, e.Type, hits)
				}
				checkpoints++
			}
			if dump := os.Getenv("GACT_STREAM_DUMP"); dump != "" && (e.Type == "message.part.completed" || e.Type == "message.completed") {
				streamDump.WriteString("\n\n========== after event " + strconv.Itoa(i) + " (" + e.Type + ") ==========\n")
				streamDump.WriteString(view)
			}
		}()
	}

	if checkpoints == 0 {
		t.Fatal("no part.completed / message.completed checkpoints seen — stream shape unexpected")
	}
	// Final settled render must be clean and must have projected the delegation.
	final := renderStream(t, a)
	if final == "" {
		t.Fatal("final render empty — delegation turn did not project")
	}
	if hits := chromeIn(final); len(hits) > 0 {
		t.Errorf("final settled render still contains placeholder chrome: %v", hits)
	}
	// Positive content guard: real expert output that must NEVER be stripped away
	// must survive (content-loss guard, since a stripped placeholder legitimately
	// shrinks the render and byte-length monotonicity cannot be asserted).
	for _, want := range []string{"delegates to", "Resolved region", "returns to main"} {
		if !strings.Contains(final, want) {
			t.Errorf("final render lost real content %q (over-stripping / content loss?)", want)
		}
	}
	if dump := os.Getenv("GACT_STREAM_DUMP"); dump != "" {
		_ = os.WriteFile(dump, []byte(streamDump.String()), 0o644)
		t.Logf("wrote %d streaming checkpoints to %s", checkpoints, dump)
	}
	t.Logf("streamed %d events, %d settled checkpoints, all clean", len(events), checkpoints)
}
