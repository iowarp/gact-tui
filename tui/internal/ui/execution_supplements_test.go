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
