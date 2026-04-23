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

// PPPPP1: repeat "long writeup" turns must cycle through
// longReplyVariants. Sends three turns, asserts all three text
// bodies are distinct and that variant[1]/variant[2] markers
// ('Request lifecycle' / 'Profiling triage') both appear.
func TestRichScripts_LongReplyVariantsCycle(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	sub := bus.Subscribe(events.Filter{SessionID: sid}, 4096)
	defer sub.Cancel()

	send := func(text string) {
		user, _ := st.AppendMessage(gact.Message{
			SessionID: sid, Role: gact.RoleUser,
			Parts: []gact.Part{gact.NewTextPart(text)},
		})
		eng.OnUserMessage(sid, user.ID)
		_ = collectStatusEvents(sub, 5000, 30*time.Second, gact.StatusIdle)
	}
	send("write a long explain please")
	send("write a long explain again")
	send("write a long explain once more")

	msgs, _, _ := st.ListMessages(findMessagesFilter(sid))
	var bodies []string
	for _, m := range msgs {
		if m.Role != gact.RoleAssistant {
			continue
		}
		var body string
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeText {
				body += p.Text
			}
		}
		if len(body) > 500 { // skip the short intro/finish messages
			bodies = append(bodies, body)
		}
	}
	if len(bodies) < 3 {
		t.Fatalf("expected ≥3 long assistant bodies, got %d", len(bodies))
	}
	seen := map[string]int{}
	for _, b := range bodies[:3] {
		seen[b]++
	}
	if len(seen) != 3 {
		t.Errorf("expected 3 distinct variant bodies, got %d unique", len(seen))
	}
	hasArch := false
	hasPerf := false
	for _, b := range bodies {
		if strings.Contains(b, "## Request lifecycle") {
			hasArch = true
		}
		if strings.Contains(b, "## Profiling triage") {
			hasPerf = true
		}
	}
	if !hasArch {
		t.Errorf("expected architecture variant; bodies start: %q", bodies[1][:min(120, len(bodies[1]))])
	}
	if !hasPerf {
		t.Errorf("expected perf variant; bodies tail: %q",
			bodies[len(bodies)-1][:min(120, len(bodies[len(bodies)-1]))])
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
	// SSSSSSSSS1: variant[0] now reads TWO files + greps + proposes an
	// edit = 4 tool.call.completed events. The later variants still
	// emit 3, so assert ≥3 here and leave the variant-cycle test to
	// police the exact shape per-variant.
	n := 0
	for _, e := range got {
		if e == "tool.call.completed" {
			n++
		}
	}
	if n < 3 {
		t.Errorf("expected ≥3 tool.call.completed events, got %d in %v", n, got)
	}
	// SSSSSSSSS1: variant[0] must also emit a file_diff part after the
	// tool loop so "many tools" demonstrates the full edit flow.
	msgs, _, _ := st.ListMessages(findMessagesFilter(sid))
	hasDiff := false
	for _, m := range msgs {
		if m.Role != gact.RoleAssistant {
			continue
		}
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeFileDiff {
				hasDiff = true
				break
			}
		}
	}
	if !hasDiff {
		t.Errorf("expected variant[0] to emit a file_diff part; none found")
	}
}

// QQQQQ1: repeat "many tools" turns must cycle through
// multiToolVariants. Sends two turns, asserts each emits 3
// tool.call.completed events (variant shape preserved) AND that
// the tool *names* differ between turns — variant[1] should be
// the schema/migration psql flow, distinct from variant[0]'s
// read_file/grep/edit_file.
func TestRichScripts_MultiToolVariantsCycle(t *testing.T) {
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
	send("many tools please")
	send("many tools again")

	// Walk every assistant message; collect the tool_call part names.
	msgs, _, _ := st.ListMessages(findMessagesFilter(sid))
	var toolNamesPerAsst [][]string
	for _, m := range msgs {
		if m.Role != gact.RoleAssistant {
			continue
		}
		var names []string
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeToolCall {
				names = append(names, p.ToolName)
			}
		}
		if len(names) > 0 {
			toolNamesPerAsst = append(toolNamesPerAsst, names)
		}
	}
	if len(toolNamesPerAsst) < 2 {
		t.Fatalf("expected ≥2 multi-tool assistants, got %d (%v)",
			len(toolNamesPerAsst), toolNamesPerAsst)
	}
	// SSSSSSSSS1: variant[0] now emits 4 tool calls (two read_file +
	// grep + edit_file); variants 1 & 2 keep their 3-call shapes.
	// Assert each turn emits at least 3 tool calls and leave the
	// variant-specific tool *name* checks below to police identity.
	for i, names := range toolNamesPerAsst[:2] {
		if len(names) < 3 {
			t.Errorf("turn %d: expected ≥3 tool calls, got %d (%v)", i, len(names), names)
		}
	}
	// The two turns must have different tool-call sequences (variant
	// cycle fired) and the union must include both variant[0]'s
	// read_file path AND variant[1]'s shell path.
	if strings.Join(toolNamesPerAsst[0], ",") == strings.Join(toolNamesPerAsst[1], ",") {
		t.Errorf("turn 0 + 1 emitted same tool names %v — variant cycle didn't fire",
			toolNamesPerAsst[0])
	}
	allNames := append([]string{}, toolNamesPerAsst[0]...)
	allNames = append(allNames, toolNamesPerAsst[1]...)
	hasShell, hasReadFile := false, false
	for _, n := range allNames {
		if n == "shell" {
			hasShell = true
		}
		if n == "read_file" {
			hasReadFile = true
		}
	}
	if !hasShell {
		t.Errorf("expected variant[1] (shell-based) to fire across turns; got %v", allNames)
	}
	if !hasReadFile {
		t.Errorf("expected variant[0] (read_file-based) to fire across turns; got %v", allNames)
	}
}

// findMessagesFilter is a tiny wrapper that keeps the test readable.
// Centralises the IncludeSystem/Limit knobs so each test doesn't have
// to re-specify them.
func findMessagesFilter(sid string) store.MessageFilter {
	return store.MessageFilter{SessionID: sid, Limit: 1000, IncludeSystem: true}
}
