package scenario

import (
	"strings"
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// RRRRR1: repeated "propose an edit" turns must cycle through
// diffVariants. Sends three turns, asserts each emitted file_diff
// targets a different (path, language) pair so the user can address
// each pending diff individually via the FFFFF1 cursor-aware Ctrl+E.
func TestRichScripts_DiffVariantsCycle(t *testing.T) {
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
	send("propose an edit to main.go")
	send("propose another edit")
	send("propose one more diff")

	msgs, _, _ := st.ListMessages(findMessagesFilter(sid))
	type seen struct {
		path string
		lang string
	}
	var diffs []seen
	for _, m := range msgs {
		if m.Role != gact.RoleAssistant {
			continue
		}
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeFileDiff {
				diffs = append(diffs, seen{path: p.Path, lang: p.Language})
			}
		}
	}
	if len(diffs) < 3 {
		t.Fatalf("expected ≥3 file_diff parts after 3 turns, got %d (%+v)",
			len(diffs), diffs)
	}
	// All three (path, language) pairs must differ.
	uniq := map[seen]int{}
	for _, d := range diffs[:3] {
		uniq[d]++
	}
	if len(uniq) != 3 {
		t.Errorf("expected 3 distinct diff targets, got %d unique: %+v", len(uniq), uniq)
	}
	// Spot-check that both Python (variant[1]) and JS (variant[2]) fire
	// across the run — order-agnostic since ListMessages is newest-first.
	hasPython, hasJS := false, false
	for _, d := range diffs {
		if strings.HasSuffix(d.path, ".py") || d.lang == "python" {
			hasPython = true
		}
		if strings.HasSuffix(d.path, ".js") || d.lang == "javascript" {
			hasJS = true
		}
	}
	if !hasPython {
		t.Errorf("expected python diff variant to fire across 3 turns; got %+v", diffs)
	}
	if !hasJS {
		t.Errorf("expected javascript diff variant to fire across 3 turns; got %+v", diffs)
	}
}
