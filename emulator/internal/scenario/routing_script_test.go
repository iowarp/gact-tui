package scenario

import (
	"strings"
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// CLIO-BBBBBBBBBB3: runRoutingScript emits a routing_decision part
// as the FIRST part of the assistant message + a session.agent_routed
// event with session_id, message_id, selected_agent.
func TestRoutingScript_EmitsRoutingDecisionPart(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	sub := bus.Subscribe(events.Filter{SessionID: sid}, 512)
	defer sub.Cancel()

	user, _ := st.AppendMessage(gact.Message{
		SessionID: sid, Role: gact.RoleUser,
		Parts: []gact.Part{gact.NewTextPart("please analyze /tmp/data.csv")},
	})
	eng.OnUserMessage(sid, user.ID)

	got := collectStatusEvents(sub, 5000, 30*time.Second, gact.StatusIdle)
	mustContain(t, got, "session.agent_routed")
	mustContain(t, got, "message.completed")

	// Pull the assistant message and verify the first part is a
	// routing_decision pointing at data_expert.
	msgs, _, _ := st.ListMessages(store.MessageFilter{SessionID: sid, Limit: 100, IncludeSystem: true})
	var asst *gact.Message
	for i := len(msgs) - 1; i >= 0; i-- {
		if msgs[i].Role == gact.RoleAssistant {
			m := msgs[i]
			asst = &m
			break
		}
	}
	if asst == nil {
		t.Fatal("no assistant message emitted")
	}
	if len(asst.Parts) == 0 {
		t.Fatalf("assistant message has no parts")
	}
	first := asst.Parts[0]
	if first.Type != gact.PartTypeRoutingDecision {
		t.Fatalf("first part type = %q, want %q",
			first.Type, gact.PartTypeRoutingDecision)
	}
	if first.SelectedAgent != "data_expert" {
		t.Errorf("selected_agent = %q, want data_expert (analyze keyword matched)",
			first.SelectedAgent)
	}
	if !first.Heuristic {
		t.Errorf("heuristic = false, want true (keyword-matched routing)")
	}
	if first.Confidence <= 0 {
		t.Errorf("confidence = %v, want > 0", first.Confidence)
	}
	// Text answer follows the routing decision.
	var bodyText string
	for _, p := range asst.Parts {
		if p.Type == gact.PartTypeText {
			bodyText = p.Text
			break
		}
	}
	if !strings.Contains(bodyText, "data_expert") {
		t.Errorf("assistant text didn't mention data_expert: %q", bodyText)
	}
}

// CLIO-BBBBBBBBBB3: routing picks different tier-2 agents from
// distinct keyword hints.
func TestRoutingScript_PicksByKeyword(t *testing.T) {
	cases := []struct {
		prompt        string
		wantAgent     string
	}{
		{"please refactor this function", "code_expert"},
		{"can you search the web for pandas", "research_expert"},
		{"profile my parquet file", "data_expert"},
		{"route this however you want", "data_expert"}, // default fallback
	}
	for _, tc := range cases {
		t.Run(tc.wantAgent+"_"+tc.prompt[:8], func(t *testing.T) {
			eng, st, bus, sid := newRig(t)
			sub := bus.Subscribe(events.Filter{SessionID: sid}, 256)
			defer sub.Cancel()

			user, _ := st.AppendMessage(gact.Message{
				SessionID: sid, Role: gact.RoleUser,
				Parts: []gact.Part{gact.NewTextPart(tc.prompt)},
			})
			eng.OnUserMessage(sid, user.ID)
			_ = collectStatusEvents(sub, 5000, 30*time.Second, gact.StatusIdle)

			msgs, _, _ := st.ListMessages(store.MessageFilter{SessionID: sid, Limit: 100, IncludeSystem: true})
			var routingAgent string
			for _, m := range msgs {
				if m.Role != gact.RoleAssistant {
					continue
				}
				for _, p := range m.Parts {
					if p.Type == gact.PartTypeRoutingDecision {
						routingAgent = p.SelectedAgent
						break
					}
				}
			}
			if routingAgent != tc.wantAgent {
				t.Errorf("prompt %q → routed to %q, want %q", tc.prompt, routingAgent, tc.wantAgent)
			}
		})
	}
}
