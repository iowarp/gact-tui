package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestRenderAssistantToolEvidenceFromMetadata(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{Type: gact.PartTypeText, Text: "I inspected the file."},
		},
		Metadata: map[string]any{
			"tools_called": []any{
				map[string]any{
					"name":             "hdf5_list_datasets",
					"args":             map[string]any{"path": "run.h5"},
					"result":           []any{"/entry/current", "/entry/voltage"},
					"ok":               true,
					"duration_ms":      18.0,
					"telemetry_source": "live_observer",
				},
			},
		},
	}

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 100, nil))
	for _, want := range []string{
		"HDF5 data analysis(path: run.h5)",
		`["/entry/current","/entry/voltage"]`,
		"detail: raw · Ctrl+E expand",
		"I inspected the file.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("rendered tool evidence missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "trace metadata") {
		t.Fatalf("tool transcript should not duplicate provenance labels; details keep provenance:\n%s", out)
	}
}

func TestStructuredToolCallsDoNotRenderDuplicateToolEvidence(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{
				Type:     gact.PartTypeToolCall,
				CallID:   "call_1",
				ToolName: "hdf5_list_datasets",
				Input:    map[string]any{"path": "run.h5"},
			},
		},
		Metadata: map[string]any{
			"tools_called": []any{
				map[string]any{"name": "hdf5_list_datasets"},
			},
		},
	}

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 100, nil))
	if strings.Contains(out, "Tool evidence") {
		t.Fatalf("structured tool call should not duplicate metadata evidence:\n%s", out)
	}
	if !strings.Contains(out, "HDF5 data analysis") {
		t.Fatalf("structured tool call itself should still render:\n%s", out)
	}
}

func TestMessageCompletedMergesToolEvidenceMetadata(t *testing.T) {
	a := &App{
		conversation: conversationComponent{appConversationState: appConversationState{
			messages: []gact.Message{
				{
					ID:    "asst_1",
					Role:  gact.RoleAssistant,
					Parts: []gact.Part{{Type: gact.PartTypeText, Text: "done"}},
				},
			},
		}},
	}
	a.execution.app = a
	a.conversation.app = a

	a.conversation.applySSE(client.SSEEvent{
		Type: "message.completed",
		Payload: map[string]any{
			"payload": map[string]any{
				"message_id": "asst_1",
				"metadata": map[string]any{
					"tools_called": []any{
						map[string]any{
							"name":             "parquet_compute_statistics",
							"telemetry_source": "agent_trace",
						},
					},
				},
			},
		},
	})

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(a.conversation.messages[0], nil, 100, nil))
	if strings.Contains(out, "Tool evidence") {
		t.Fatalf("metadata tool evidence should be promoted to structured parts, not rendered as a footer:\n%s", out)
	}
	if !strings.Contains(out, "Parquet data analysis") {
		t.Fatalf("message.completed metadata was not promoted to a tool call:\n%s", out)
	}
}

func TestPartAddedReplacesExistingLivePartByID(t *testing.T) {
	a := &App{
		conversation: conversationComponent{appConversationState: appConversationState{
			messages: []gact.Message{
				{
					ID:   "asst_1",
					Role: gact.RoleAssistant,
					Parts: []gact.Part{{
						ID:       "part_1",
						Type:     gact.PartTypeToolResult,
						CallID:   "call_1",
						ToolName: "ndp_search",
						Content:  []gact.Part{{Type: gact.PartTypeText, Text: "completed"}},
					}},
				},
			},
		}},
	}
	a.execution.app = a
	a.conversation.app = a

	a.conversation.applySSE(client.SSEEvent{
		Type: "message.part.added",
		Payload: map[string]any{
			"payload": map[string]any{
				"message_id": "asst_1",
				"part": map[string]any{
					"id":        "part_1",
					"type":      gact.PartTypeToolResult,
					"call_id":   "call_1",
					"tool_name": "ndp_search",
					"content": []any{map[string]any{
						"type": "text",
						"text": "dataset result",
					}},
				},
			},
		},
	})

	if len(a.conversation.messages[0].Parts) != 1 {
		t.Fatalf("parts len = %d, want replacement not append", len(a.conversation.messages[0].Parts))
	}
	if got := a.conversation.messages[0].Parts[0].Content[0].Text; got != "dataset result" {
		t.Fatalf("replacement text = %q", got)
	}
}

func TestLiveStructuredToolResultUsesSemanticPreview(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{
				Type:     gact.PartTypeToolCall,
				CallID:   "call_1",
				ToolName: "ndp_search_datasets",
				Input:    map[string]any{"search_terms": "seismic", "limit": 5},
			},
			{
				Type:     gact.PartTypeToolResult,
				CallID:   "call_1",
				ToolName: "ndp_search_datasets",
				Content: []gact.Part{{
					Type: gact.PartTypeText,
					Text: `{"_meta":{"status":"success","tool":"search_datasets"},"count":5,"datasets":{"count":4,"items":[{"id":"salton-sea","name":"Salton Sea Seismic Data","notes":"MiniSEED waveform data recorded by CI network stations in the Salton Sea region.","resources":[{"url":"osdf:///ndp/public/ucr_seis/Data_Salton"}]}]}}`,
				}},
			},
		},
	}

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 100, nil))
	for _, want := range []string{
		"NDP catalog search(search: seismic",
		"status: success",
		"count: 5",
		"Salton Sea Seismic Data",
		"detail: raw · Ctrl+E expand",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("live structured result missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, `"_meta"`) || strings.Contains(out, `"datasets":`) {
		t.Fatalf("live structured result should not render raw JSON inline:\n%s", out)
	}
}
