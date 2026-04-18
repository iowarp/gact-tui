package scenario

import (
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// TestCostAccumulatesAcrossTurns verifies that running multiple user
// turns against the default scenario rolls cost into the session
// aggregate correctly. Each turn produces 2 assistant messages
// (pre-tool-call + post-result), each charged at synthetic 1500-input
// 600-output Sonnet rates ≈ $0.0135/charge → $0.027/turn.
func TestCostAccumulatesAcrossTurns(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	sub := bus.Subscribe(events.Filter{SessionID: sid}, 256)
	defer sub.Cancel()

	const turns = 3
	for i := 0; i < turns; i++ {
		// Each user message kicks off a scenario run.
		user, _ := st.AppendMessage(gact.Message{
			SessionID: sid,
			Role:      gact.RoleUser,
			Parts:     []gact.Part{gact.NewTextPart("read main.go")},
		})
		eng.OnUserMessage(sid, user.ID)

		// Drain events until status returns to idle.
		deadline := time.After(3 * time.Second)
		settled := false
		for !settled {
			select {
			case <-deadline:
				t.Fatalf("turn %d: never settled", i)
			case e, ok := <-sub.C:
				if !ok {
					t.Fatalf("turn %d: stream closed", i)
				}
				if e.Type == "session.status_changed" {
					latest, _ := st.GetSession(sid)
					if latest != nil && latest.Status == gact.StatusIdle {
						settled = true
					}
				}
			}
		}
	}

	final, _ := st.GetSession(sid)
	const wantPerTurn = 0.027 // 2 charges × $0.0135
	wantTotal := wantPerTurn * float64(turns)
	delta := final.CostUSD - wantTotal
	if delta < -1e-6 || delta > 1e-6 {
		t.Errorf("cost = $%.6f after %d turns, want $%.6f", final.CostUSD, turns, wantTotal)
	}
	if final.Tokens.Input != 1500*2*turns {
		t.Errorf("tokens.input = %d, want %d", final.Tokens.Input, 1500*2*turns)
	}
	if final.Tokens.Output != 600*2*turns {
		t.Errorf("tokens.output = %d, want %d", final.Tokens.Output, 600*2*turns)
	}
}
