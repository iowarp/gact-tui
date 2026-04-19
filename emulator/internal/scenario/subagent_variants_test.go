package scenario

import (
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// SSSSS1: repeated "spawn a subagent" turns must cycle through
// subagentVariants. Different agent_id per variant means three
// turns spawn three differently-named subsessions — the user can
// see in the sidebar that they delegated to code_reviewer +
// security_auditor + perf_profiler, not the same reviewer thrice.
func TestRichScripts_SubagentVariantsCycle(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	sub := bus.Subscribe(events.Filter{}, 4096)
	defer sub.Cancel()

	send := func(text string) {
		user, _ := st.AppendMessage(gact.Message{
			SessionID: sid, Role: gact.RoleUser,
			Parts: []gact.Part{gact.NewTextPart(text)},
		})
		eng.OnUserMessage(sid, user.ID)
		_ = collectStatusEvents(sub, 5000, 30*time.Second, gact.StatusIdle)
	}
	send("split this with a sub-agent")
	send("split with help again")
	send("spawn another subagent")

	// Walk every assistant message on the parent session for
	// subagent_call parts and pull the agent_id out of each.
	msgs, _, _ := st.ListMessages(findMessagesFilter(sid))
	var agentIDs []string
	for _, m := range msgs {
		if m.Role != gact.RoleAssistant {
			continue
		}
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeSubagentCall {
				agentIDs = append(agentIDs, p.AgentID)
			}
		}
	}
	if len(agentIDs) < 3 {
		t.Fatalf("expected ≥3 subagent_call parts, got %d (%v)",
			len(agentIDs), agentIDs)
	}
	uniq := map[string]int{}
	for _, id := range agentIDs[:3] {
		uniq[id]++
	}
	if len(uniq) != 3 {
		t.Errorf("expected 3 distinct agent ids, got %d unique: %+v", len(uniq), uniq)
	}
	// Spot-check both security_auditor + perf_profiler fire across
	// the run (variant[1] + variant[2]). Order-agnostic since
	// ListMessages is newest-first.
	hasSec, hasPerf := false, false
	for _, id := range agentIDs {
		if id == "security_auditor" {
			hasSec = true
		}
		if id == "perf_profiler" {
			hasPerf = true
		}
	}
	if !hasSec {
		t.Errorf("expected security_auditor variant to fire; got %v", agentIDs)
	}
	if !hasPerf {
		t.Errorf("expected perf_profiler variant to fire; got %v", agentIDs)
	}
}
