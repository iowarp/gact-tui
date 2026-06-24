package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestLastAssistantText_EmptySlice(t *testing.T) {
	if got, ok := lastAssistantText(nil); ok || got != "" {
		t.Errorf("empty msgs = %q ok=%v, want '' false", got, ok)
	}
}

func TestLastAssistantText_NoAssistantInSlice(t *testing.T) {
	msgs := []gact.Message{
		{Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "hi"}}},
		{Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "again"}}},
	}
	if _, ok := lastAssistantText(msgs); ok {
		t.Error("all-user slice should not yield copyable text")
	}
}

func TestLastAssistantText_TakesMostRecentAssistantOnly(t *testing.T) {
	msgs := []gact.Message{
		{Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "first reply"}}},
		{Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "follow-up"}}},
		{Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "second reply"}}},
	}
	got, ok := lastAssistantText(msgs)
	if !ok || got != "second reply" {
		t.Errorf("got %q ok=%v, want 'second reply' true", got, ok)
	}
}

func TestLastAssistantText_JoinsMultipleTextParts(t *testing.T) {
	msgs := []gact.Message{{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{Type: gact.PartTypeText, Text: "intro paragraph"},
			{Type: gact.PartTypeText, Text: "follow-up paragraph"},
		},
	}}
	got, _ := lastAssistantText(msgs)
	if !strings.Contains(got, "intro paragraph\n\nfollow-up paragraph") {
		t.Errorf("got %q, want both parts separated by blank line", got)
	}
}

func TestLastAssistantText_FencesThinking(t *testing.T) {
	msgs := []gact.Message{{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{Type: gact.PartTypeThinking, Thinking: "considering options"},
			{Type: gact.PartTypeText, Text: "the answer"},
		},
	}}
	got, _ := lastAssistantText(msgs)
	if !strings.Contains(got, "<thinking>\nconsidering options\n</thinking>") {
		t.Errorf("thinking not fenced: %q", got)
	}
	if !strings.Contains(got, "the answer") {
		t.Error("text part lost")
	}
}

func TestLastAssistantText_SkipsToolCallParts(t *testing.T) {
	// Tool calls are structured, not free text — omitting them keeps
	// the clipboard content clean for "I just want to paste what Claude
	// said" use cases.
	msgs := []gact.Message{{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{Type: gact.PartTypeToolCall, ToolName: "bash"},
			{Type: gact.PartTypeText, Text: "running a command"},
		},
	}}
	got, _ := lastAssistantText(msgs)
	if strings.Contains(got, "bash") {
		t.Errorf("tool_call leaked into copy: %q", got)
	}
	if !strings.Contains(got, "running a command") {
		t.Errorf("text part missing: %q", got)
	}
}

func TestLastAssistantText_AssistantWithOnlyToolCallYieldsFalse(t *testing.T) {
	msgs := []gact.Message{{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{Type: gact.PartTypeToolCall, ToolName: "bash"},
		},
	}}
	if _, ok := lastAssistantText(msgs); ok {
		t.Error("assistant-only-tool-call should not report copyable text")
	}
}

func TestSelectedHandoffCopyUsesPlainSemanticText(t *testing.T) {
	msgs := []gact.Message{{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			Type: gact.PartTypeExpertHandoff,
			Text: "data returned evidence to main.",
			Metadata: map[string]any{
				"agent_id":       "data",
				"parent_id":      "main",
				"stage":          "delegate.completed",
				"status":         "completed",
				"duration_ms":    1778.0,
				"output_summary": "Resolved Region (Los Angeles)\n\n- Center: 34.0522, -118.2437",
			},
		}},
	}}

	got, ok := selectedConversationBlockText(msgs, 0, 0)
	if !ok {
		t.Fatal("handoff block should be copyable")
	}
	for _, want := range []string{"data returned evidence to main", "completed - returned - 1778ms", "Resolved Region"} {
		if !strings.Contains(got, want) {
			t.Fatalf("handoff copy missing %q:\n%s", want, got)
		}
	}
	for _, bad := range []string{"↳", "│", "·", "┬╖", "Γå", "ΓÇ"} {
		if strings.Contains(got, bad) {
			t.Fatalf("handoff copy should not include terminal UI glyph/mojibake %q:\n%s", bad, got)
		}
	}
}

func TestSelectedScientificToolResultCopyUsesSemanticSummary(t *testing.T) {
	msgs := []gact.Message{{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			Type:     gact.PartTypeToolResult,
			ToolName: "shell_bash",
			Content: []gact.Part{{
				Type: gact.PartTypeText,
				Text: `{"exit_code":0,"stdout":"Site,Latitude,(deg)\nMTA1,34.0522,-118.2437\nPKRD,34.0500,-118.2600\nELSC,34.0300,-118.2400"}`,
			}},
		}},
	}}

	got, ok := selectedConversationBlockText(msgs, 0, 0)
	if !ok {
		t.Fatal("tool result should be copyable")
	}
	for _, want := range []string{"exit_code: 0", "stdout: Site,Latitude,(deg) MTA1"} {
		if !strings.Contains(got, want) {
			t.Fatalf("tool result copy missing semantic summary %q:\n%s", want, got)
		}
	}
	if strings.Contains(got, `{"exit_code"`) || strings.Contains(got, `\n`) {
		t.Fatalf("tool result copy should not paste raw JSON/newline escapes:\n%s", got)
	}
}

func TestFullConversationCopyIncludesToolEvidence(t *testing.T) {
	msgs := []gact.Message{
		{
			Role: gact.RoleUser,
			Parts: []gact.Part{{
				Type: gact.PartTypeText,
				Text: "Inspect San Diego waveforms.",
			}},
		},
		{
			Role: gact.RoleAssistant,
			Parts: []gact.Part{
				{
					Type:     gact.PartTypeToolCall,
					CallID:   "call_sac",
					ToolName: "sac_discover_earthscope_region_waveform",
					Input: map[string]any{
						"location":  "San Diego, CA",
						"days_back": 7.0,
					},
				},
				{
					Type: gact.PartTypeText,
					Text: "I am querying EarthScope.",
				},
			},
		},
		{
			Role: gact.RoleTool,
			Parts: []gact.Part{{
				Type:     gact.PartTypeToolResult,
				CallID:   "call_sac",
				ToolName: "sac_discover_earthscope_region_waveform",
				Content: []gact.Part{{
					Type: gact.PartTypeText,
					Text: `{"archive_path":"earthscope_CI_BAR_--_BHZ_2026-05-29T021201.sac","trace_count":1}`,
				}},
			}},
		},
		{
			Role: gact.RoleAssistant,
			Parts: []gact.Part{{
				Type: gact.PartTypeText,
				Text: "SAC trace staged.",
			}},
		},
	}

	got, ok := fullConversationText(msgs)
	if !ok {
		t.Fatal("full conversation should be copyable")
	}
	for _, want := range []string{
		"## user:",
		"Inspect San Diego waveforms.",
		"## assistant:",
		"Tool call",
		"EarthScope waveform discovery",
		"tool: sac_discover_earthscope_region_waveform",
		"Args: location: San Diego, CA · window: last 7 days",
		"I am querying EarthScope.",
		"## tool:",
		"earthscope_CI_BAR_--_BHZ_2026-05-29T021201.sac",
		"SAC trace staged.",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("full conversation copy missing %q:\n%s", want, got)
		}
	}
}

func TestFullConversationCopyCacheInvalidatesOnMessageContentChange(t *testing.T) {
	a := New("http://unused")
	a.conversation.messages = []gact.Message{{
		ID:   "msg_1",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:   "part_1",
			Type: gact.PartTypeText,
			Text: "first answer",
		}},
	}}

	first, ok := a.clipboard.fullTranscriptTextCached()
	if !ok {
		t.Fatal("first copy should be copyable")
	}
	second, ok := a.clipboard.fullTranscriptTextCached()
	if !ok {
		t.Fatal("cached copy should be copyable")
	}
	if second != first {
		t.Fatalf("cached copy changed unexpectedly:\nfirst=%q\nsecond=%q", first, second)
	}

	a.conversation.messages[0].Parts[0].Text = "streamed update"
	updated, ok := a.clipboard.fullTranscriptTextCached()
	if !ok {
		t.Fatal("updated copy should be copyable")
	}
	if !strings.Contains(updated, "streamed update") {
		t.Fatalf("copy cache returned stale text:\n%s", updated)
	}
	if strings.Contains(updated, "first answer") {
		t.Fatalf("copy cache retained old text:\n%s", updated)
	}
}

func TestFullConversationCopyCacheInvalidatesOnExpertHandoffMetadataChange(t *testing.T) {
	a := New("http://unused")
	a.conversation.messages = []gact.Message{{
		ID:   "msg_1",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:   "handoff_1",
			Type: gact.PartTypeExpertHandoff,
			Metadata: map[string]any{
				"parent_id":      "main",
				"agent_id":       "data",
				"stage":          "delegate.completed",
				"status":         "completed",
				"output_summary": "first evidence",
			},
		}},
	}}

	first, ok := a.clipboard.fullTranscriptTextCached()
	if !ok || !strings.Contains(first, "first evidence") {
		t.Fatalf("first copy missing handoff evidence, ok=%v:\n%s", ok, first)
	}
	a.conversation.messages[0].Parts[0].Metadata["output_summary"] = "updated evidence"
	updated, ok := a.clipboard.fullTranscriptTextCached()
	if !ok {
		t.Fatal("updated copy should be copyable")
	}
	if !strings.Contains(updated, "updated evidence") || strings.Contains(updated, "first evidence") {
		t.Fatalf("copy cache did not invalidate on metadata update:\n%s", updated)
	}
}
