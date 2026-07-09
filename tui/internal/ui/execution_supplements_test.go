package ui

import (
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestExecutionAssistantSupplementsUseCurrentTurnArtifactText(t *testing.T) {
	a := &App{conversation: conversationComponent{appConversationState: appConversationState{
		messages: []gact.Message{
			{ID: "msg_user_1", Role: gact.RoleUser},
			{
				ID:   "msg_assistant_1",
				Role: gact.RoleAssistant,
				Parts: []gact.Part{{
					Type: gact.PartTypeText,
					Text: "Plot written to /tmp/station_axis.png",
				}},
			},
		},
	}}}
	a.execution.app = a
	a.conversation.app = a

	nodes := a.execution.assistantSupplementNodesByTurn()["msg_user_1"]
	if len(nodes) != 1 {
		t.Fatalf("supplement count = %d, want 1: %#v", len(nodes), nodes)
	}
	if nodes[0].Kind != executionNodeAssistantText || nodes[0].Agent != "main" {
		t.Fatalf("unexpected supplement node: %#v", nodes[0])
	}
	if nodes[0].Text != "Plot written to /tmp/station_axis.png" {
		t.Fatalf("supplement text = %q", nodes[0].Text)
	}
}

func TestExecutionDedupSupplementNodesSkipsExistingEvidence(t *testing.T) {
	existing := []executionTimelineNode{{
		Kind: executionNodeExpertReport,
		Text: "Plot written to /tmp/station_axis.png",
	}}
	supplements := []executionTimelineNode{
		{
			Kind: executionNodeAssistantText,
			Text: "Plot written to /tmp/station_axis.png",
		},
		{
			Kind: executionNodeAssistantText,
			Text: "Preview available at /tmp/station_axis_preview.png",
		},
	}

	got := executionDedupSupplementNodes(existing, supplements)
	if len(got) != 1 {
		t.Fatalf("deduped supplement count = %d, want 1: %#v", len(got), got)
	}
	if got[0].Text != "Preview available at /tmp/station_axis_preview.png" {
		t.Fatalf("kept supplement text = %q", got[0].Text)
	}
}

// TestExecutionPlaceholderNarrowedToWebParity documents the intentional #233 change:
// the TUI no longer hides a row merely because it CONTAINS a bare, un-parenthesized
// domain phrase like "awaiting data acquisition" (the former overfit heuristic). The
// web doesn't hide those either — its isOrchestrationPlaceholder is a hasPriorAnswerRow
// gate, never a hide. Only text that cleans ENTIRELY to chrome (a whole-line
// parenthetical) is hidden.
func TestExecutionPlaceholderNarrowedToWebParity(t *testing.T) {
	for _, hidden := range []string{
		"(Awaiting synthesis before finishing.)",
		"(Delegating to the data expert for acquisition.)",
	} {
		if !executionPlaceholderAssistantText(hidden) {
			t.Errorf("expected parenthesized chrome to be hidden: %q", hidden)
		}
	}
	// Bare, un-parenthesized prose → NOT hidden (web parity; was hidden by the old
	// domain-substring heuristic, intentionally retired).
	for _, shown := range []string{
		"Awaiting data acquisition to complete before ranking the candidate stations.",
		"The geospatial expert is now awaiting synthesis of the resolved coordinates.",
	} {
		if executionPlaceholderAssistantText(shown) {
			t.Errorf("expected bare prose to survive (web parity): %q", shown)
		}
	}
}
