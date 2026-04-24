package scenario

import (
	"context"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// runRoutingScript demonstrates the v0.2 multi-tier agent routing
// primitive (SPEC §4.3.1). Triggered by prompts like "analyze ...",
// "profile ...", "search the web for ...", or "route this to ...".
//
// What it emits (in order):
//
//   1. session.status_changed → running
//   2. routing_decision part as the FIRST part of the assistant
//      message — selected_agent matched by keyword against the
//      catalog's tier-2 entries (code_expert / research_expert /
//      data_expert). heuristic = true, confidence = 0.85.
//   3. session.agent_routed event carrying selected_agent + rationale.
//   4. A text part answering with the picked agent's voice.
//   5. message.completed.
//
// This is the end-to-end path a TUI consumer exercises for badge
// rendering + routing rationale display. Pairs with
// TestRoutingScript_EmitsRoutingDecision in the scenario tests.
//
// CLIO-BBBBBBBBBB3.
func runRoutingScript(ctx context.Context, e *Engine, sessionID string, userMsg *gact.Message) {
	e.publishStatus(sessionID, gact.StatusRunning)
	text := strings.ToLower(extractFirstText(userMsg))

	selectedAgent, rationale := pickTier2Agent(text)

	asst, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}

	// 1. Routing decision as the first part of the assistant message.
	routingPart := gact.NewRoutingDecisionPart(selectedAgent, rationale, 0.85, true)
	if _, err := e.addPart(sessionID, asst.ID, routingPart); err != nil {
		return
	}

	// 2. session.agent_routed SSE event. Carries message_id so the
	//    TUI can associate the routing with a specific turn.
	e.bus.Publish(events.Event{
		Type:      "session.agent_routed",
		SessionID: sessionID,
		Payload: map[string]any{
			"session_id":     sessionID,
			"message_id":     asst.ID,
			"selected_agent": selectedAgent,
			"rationale":      rationale,
			"confidence":     0.85,
			"heuristic":      true,
		},
	})

	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	// 3. Answer text in the picked agent's voice.
	answer := answerFor(selectedAgent, text)
	body, err := e.addPart(sessionID, asst.ID, gact.NewTextPart(""))
	if err != nil {
		return
	}
	if err := e.streamText(ctx, sessionID, asst.ID, body.ID, answer, "text"); err != nil {
		return
	}
	e.completePart(sessionID, asst.ID, body.ID)
	e.completeMessage(sessionID, asst.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}

// pickTier2Agent is the emulator's heuristic router — same shape as
// CLIO's own keyword match. Returns (agent_id, rationale).
func pickTier2Agent(text string) (id, rationale string) {
	switch {
	case containsAny(text, "edit", "refactor", "fix", "review", "patch"):
		return "code_expert", "Intent matched code-editing keywords (edit / refactor / fix / review)."
	case containsAny(text, "search", "find", "look up", "research", "citations", "web"):
		return "research_expert", "Intent matched knowledge-retrieval keywords (search / look up / research)."
	case containsAny(text, "analyze", "profile", "inspect", "csv", "parquet", "data"):
		return "data_expert", "Intent matched data-analysis keywords (analyze / profile / inspect)."
	default:
		return "data_expert", "No strong keyword match — defaulting to data_expert as the catch-all specialist."
	}
}

// answerFor is a short in-character reply per agent. Deliberately
// terse — the test + TUI care about the routing_decision + event
// shapes, not the answer content.
func answerFor(agentID, prompt string) string {
	switch agentID {
	case "code_expert":
		return "Routing to the code_expert. I'd start by reading the file, grepping for the symbol, and proposing a patch with the edit_file tool."
	case "research_expert":
		return "Routing to the research_expert. I'd run a web_search, then cite the top three sources inline."
	case "data_expert":
		return "Routing to the data_expert. I'd sample the file with read_file, profile its schema, and summarise columns + types."
	default:
		return "Routing to a tier-2 specialist."
	}
}
