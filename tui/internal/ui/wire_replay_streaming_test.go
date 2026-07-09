package ui

// wire_replay_streaming_test.go replays a real captured backend SSE stream
// INCREMENTALLY — folding one event at a time and rendering the conversation after
// each. It validates two things the bulk-replay settled-state test cannot: (1) the
// render never panics on any per-delta intermediate state, and (2) orchestration
// placeholder chrome never survives on a settled (part.completed / message.completed)
// boundary, where the part text is final and cleanProse has the whole string. The
// final render is additionally asserted to retain real expert content (guarding
// against over-stripping / content loss).
//
// KNOWN GAP (shared with the web): a partial "typed workflow state: {…" JSON blob
// cannot be stripped mid-delta because findBalancedJsonEnd needs the closing brace,
// so such a blob may render raw for the deltas before the part finalizes. This test
// asserts cleanliness at settled boundaries, NOT on every intermediate delta.

import (
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

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
			// FINAL — cleanProse has the whole string, so NO chrome may survive.
			if e.Type == "message.part.completed" || e.Type == "message.completed" {
				// At a settled boundary the part text is FINAL — cleanProse has the
				// whole string, so NO orchestration chrome may survive. (Byte-length
				// monotonicity is intentionally NOT asserted: a placeholder that
				// streamed partial and is stripped at finalization legitimately
				// shrinks the render — content-loss is caught by the positive final
				// assertions instead.)
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
	// Positive content guard (finding: byte-length monotonicity could mask a large
	// content loss): real expert output that must NEVER be stripped away must survive.
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
