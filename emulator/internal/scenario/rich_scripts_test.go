package scenario

import (
	"strings"
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// Each of these tests asserts that the target script runs end-to-end,
// produces a non-trivial set of events, and settles into idle. Uses
// the same "drain until status.idle via payload, not store" pattern
// that J4 established for race-free scenario tests.

func TestRichScripts_LongReply(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	sub := bus.Subscribe(events.Filter{SessionID: sid}, 512)
	defer sub.Cancel()

	user, _ := st.AppendMessage(gact.Message{
		SessionID: sid, Role: gact.RoleUser,
		Parts: []gact.Part{gact.NewTextPart("please do a long writeup")},
	})
	eng.OnUserMessage(sid, user.ID)

	got := collectStatusEvents(sub, 5000, 30*time.Second, gact.StatusIdle)
	mustContain(t, got, "message.completed")
	// Long reply is the whole point — verify the final assistant message
	// carries substantial text.
	msgs, _, _ := st.ListMessages(findMessagesFilter(sid))
	var lastAsst *gact.Message
	for i := len(msgs) - 1; i >= 0; i-- {
		if msgs[i].Role == gact.RoleAssistant {
			m := msgs[i]
			lastAsst = &m
			break
		}
	}
	if lastAsst == nil {
		t.Fatal("no assistant message emitted")
	}
	totalText := 0
	for _, p := range lastAsst.Parts {
		if p.Type == gact.PartTypeText {
			totalText += len(p.Text)
		}
	}
	if totalText < 1000 {
		t.Errorf("long reply should be substantial; got %d chars", totalText)
	}
}

func TestRichScripts_BigToolOutput(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	sub := bus.Subscribe(events.Filter{SessionID: sid}, 512)
	defer sub.Cancel()

	user, _ := st.AppendMessage(gact.Message{
		SessionID: sid, Role: gact.RoleUser,
		Parts: []gact.Part{gact.NewTextPart("dump the log")},
	})
	eng.OnUserMessage(sid, user.ID)

	got := collectStatusEvents(sub, 5000, 30*time.Second, gact.StatusIdle)
	mustContain(t, got, "tool.call.completed")
	// Find the tool_result message and verify its content is big.
	msgs, _, _ := st.ListMessages(findMessagesFilter(sid))
	var toolText string
	for _, m := range msgs {
		if m.Role != gact.RoleTool {
			continue
		}
		for _, p := range m.Parts {
			if p.Type != gact.PartTypeToolResult {
				continue
			}
			for _, sub := range p.Content {
				if sub.Type == gact.PartTypeText {
					toolText += sub.Text
				}
			}
		}
	}
	// 80 lines × ~60 chars → several thousand chars. Threshold at 2000
	// so a shrunk fixture still passes, but a broken path (empty
	// result) fails.
	if len(toolText) < 2000 {
		t.Errorf("big tool output too short: %d chars", len(toolText))
	}
	if !strings.Contains(toolText, "panic recovered") {
		t.Errorf("expected the synthetic panic line in the tool output; got prefix=%q",
			toolText[:min(200, len(toolText))])
	}
}

// GGGGG1: repeated "dump the log" turns must cycle through
// bigLogVariants so multiple bulky tool_results are addressable
// individually via the cursor-aware Ctrl+E (FFFFF1). Asserts the
// 2nd turn's tool_result contains the python traceback marker that
// only appears in variant[1], not variant[0].
func TestRichScripts_BigToolVariantsCycle(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	sub := bus.Subscribe(events.Filter{SessionID: sid}, 2048)
	defer sub.Cancel()

	send := func(text string) {
		user, _ := st.AppendMessage(gact.Message{
			SessionID: sid, Role: gact.RoleUser,
			Parts: []gact.Part{gact.NewTextPart(text)},
		})
		eng.OnUserMessage(sid, user.ID)
		_ = collectStatusEvents(sub, 5000, 30*time.Second, gact.StatusIdle)
	}

	// First turn → variant[0] (server logs); second → variant[1]
	// (python traceback); third → variant[2] (nginx access).
	send("dump the log")
	send("dump the log again")
	send("dump the log once more")

	msgs, _, _ := st.ListMessages(findMessagesFilter(sid))
	bodies := []string{}
	for _, m := range msgs {
		if m.Role != gact.RoleTool {
			continue
		}
		for _, p := range m.Parts {
			if p.Type != gact.PartTypeToolResult {
				continue
			}
			var body string
			for _, sub := range p.Content {
				if sub.Type == gact.PartTypeText {
					body += sub.Text
				}
			}
			bodies = append(bodies, body)
		}
	}
	if len(bodies) < 3 {
		t.Fatalf("expected ≥3 tool_result bodies for 3 turns, got %d", len(bodies))
	}
	// All three should be distinct (no two identical bodies).
	seen := map[string]int{}
	for _, b := range bodies[:3] {
		seen[b]++
	}
	if len(seen) != 3 {
		t.Errorf("expected 3 distinct variant bodies, got %d unique strings", len(seen))
	}
	// Variant[1] (python traceback) must surface a Traceback marker.
	hasTraceback := false
	for _, b := range bodies {
		if strings.Contains(b, "Traceback (most recent call last)") {
			hasTraceback = true
			break
		}
	}
	if !hasTraceback {
		t.Errorf("expected python-traceback variant to fire; got bodies starting %q",
			bodies[1][:min(120, len(bodies[1]))])
	}
	// Variant[2] (nginx access) must surface an access-log marker.
	hasNginx := false
	for _, b := range bodies {
		if strings.Contains(b, "GET /api/v2/search") {
			hasNginx = true
			break
		}
	}
	if !hasNginx {
		t.Errorf("expected nginx-access variant to fire; got tail %q",
			bodies[len(bodies)-1][:min(120, len(bodies[len(bodies)-1]))])
	}
}

func TestRichScripts_MultiTool(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	sub := bus.Subscribe(events.Filter{SessionID: sid}, 512)
	defer sub.Cancel()

	user, _ := st.AppendMessage(gact.Message{
		SessionID: sid, Role: gact.RoleUser,
		Parts: []gact.Part{gact.NewTextPart("many tools please")},
	})
	eng.OnUserMessage(sid, user.ID)

	got := collectStatusEvents(sub, 5000, 30*time.Second, gact.StatusIdle)
	// Three tool.call.completed events expected (read_file, grep, edit_file).
	n := 0
	for _, e := range got {
		if e == "tool.call.completed" {
			n++
		}
	}
	if n != 3 {
		t.Errorf("expected 3 tool.call.completed events, got %d in %v", n, got)
	}
}

// findMessagesFilter is a tiny wrapper that keeps the test readable.
// Centralises the IncludeSystem/Limit knobs so each test doesn't have
// to re-specify them.
func findMessagesFilter(sid string) store.MessageFilter {
	return store.MessageFilter{SessionID: sid, Limit: 1000, IncludeSystem: true}
}
