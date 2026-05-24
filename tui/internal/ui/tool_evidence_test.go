package ui

import (
	"strings"
	"testing"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
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
		"Tool evidence",
		"summary metadata; no live tool transcript was sent",
		"hdf5_list_datasets",
		`{"path":"run.h5"}`,
		"live_observer",
		"18ms",
		`result: ["/entry/current","/entry/voltage"]`,
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("rendered tool evidence missing %q:\n%s", want, out)
		}
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
	if !strings.Contains(out, "Hdf5ListDatasets") {
		t.Fatalf("structured tool call itself should still render:\n%s", out)
	}
}

func TestMessageCompletedMergesToolEvidenceMetadata(t *testing.T) {
	a := &App{
		messages: []gact.Message{
			{
				ID:    "asst_1",
				Role:  gact.RoleAssistant,
				Parts: []gact.Part{{Type: gact.PartTypeText, Text: "done"}},
			},
		},
	}

	a.applySSE(client.SSEEvent{
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

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(a.messages[0], nil, 100, nil))
	if strings.Contains(out, "Tool evidence") {
		t.Fatalf("metadata tool evidence should be promoted to structured parts, not rendered as a footer:\n%s", out)
	}
	if !strings.Contains(out, "ParquetComputeStatistics") {
		t.Fatalf("message.completed metadata was not promoted to a tool call:\n%s", out)
	}
}

func TestNormalizeMessageToolEvidenceInsertsBeforeFinalText(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{ID: "route", Type: gact.PartTypeRoutingDecision, SelectedAgent: "utility"},
			{ID: "answer", Type: gact.PartTypeText, Text: "It is 3 PM."},
		},
		Metadata: map[string]any{
			"tools_called": []any{
				map[string]any{
					"name": "shell_bash",
					"args": map[string]any{"command": "date"},
					"result": map[string]any{
						"stdout": "\nSaturday, May 23, 2026 3:04:13 PM\n\n\n",
					},
					"ok": true,
				},
			},
		},
	}

	normalizeMessageToolEvidence(&msg)

	if got := []string{msg.Parts[0].Type, msg.Parts[1].Type, msg.Parts[2].Type, msg.Parts[3].Type}; strings.Join(got, ",") != "routing_decision,tool_call,tool_result,text" {
		t.Fatalf("tool evidence should be inserted before final text, got order %#v", got)
	}
	if msg.Parts[1].ToolName != "shell_bash" || msg.Parts[1].Input["command"] != "date" {
		t.Fatalf("tool call not populated from metadata: %#v", msg.Parts[1])
	}
	if got := msg.Parts[2].Content[0].Text; got != "Saturday, May 23, 2026 3:04:13 PM" {
		t.Fatalf("tool result should prefer stdout text, got %q", got)
	}
	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 100, nil))
	toolIdx := strings.Index(out, "ShellBash")
	resultIdx := strings.Index(out, "Saturday, May 23")
	answerIdx := strings.Index(out, "It is 3 PM.")
	if toolIdx < 0 || resultIdx < 0 || answerIdx < 0 || !(toolIdx < resultIdx && resultIdx < answerIdx) {
		t.Fatalf("rendered order should be tool call -> result -> answer:\n%s", out)
	}
}

func TestNormalizeMessagePresentationPromotesExpertHandoffsBeforeToolsAndText(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{ID: "route", Type: gact.PartTypeRoutingDecision, SelectedAgent: "visualization"},
			{ID: "answer", Type: gact.PartTypeText, Text: "Plot written."},
		},
		Metadata: map[string]any{
			"expert_handoffs": []any{
				map[string]any{
					"agent_id":       "data",
					"stage":          "planner_dispatch",
					"status":         "success",
					"output_summary": "found NDP waveform archive",
					"duration_ms":    12.0,
				},
				map[string]any{
					"agent_id":       "ndp_catalog",
					"parent_id":      "data",
					"stage":          "planner_dispatch_child",
					"status":         "success",
					"output_summary": "staged resource",
				},
			},
			"tools_called": []any{
				map[string]any{"name": "ndp_search_datasets", "ok": true},
			},
		},
	}

	normalizeMessagePresentation(&msg)

	got := []string{}
	for _, part := range msg.Parts {
		got = append(got, part.Type)
	}
	if strings.Join(got, ",") != "routing_decision,expert_handoff,expert_handoff,tool_call,tool_result,text" {
		t.Fatalf("unexpected promoted part order: %#v", got)
	}
	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 110, nil))
	for _, want := range []string{
		"↳ data",
		"found NDP waveform archive",
		"data -> ndp_catalog",
		"NdpSearchDatasets",
		"Plot written.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("rendered promoted handoff missing %q:\n%s", want, out)
		}
	}
}

func TestToolEvidenceNDPSearchRendersReadableDatasetSummary(t *testing.T) {
	msg := gact.Message{
		Role:  gact.RoleAssistant,
		Parts: []gact.Part{{ID: "answer", Type: gact.PartTypeText, Text: "Candidate found."}},
		Metadata: map[string]any{
			"tools_called": []any{
				map[string]any{
					"name": "ndp_search_datasets",
					"args": map[string]any{"search_terms": []any{"seismic"}, "limit": 5},
					"result": map[string]any{
						"_meta": map[string]any{"status": "success"},
						"count": 1.0,
						"datasets": map[string]any{
							"items": []any{
								map[string]any{
									"title":          "Salton Sea Seismic Data",
									"owner_org":      "ucr-earth-and-planetary-sciences",
									"resource_count": 1.0,
									"resource_formats": map[string]any{
										"items": []any{"MiniSEED"},
									},
									"resource_urls": map[string]any{
										"items": []any{"osdf:///ndp/public/ucr_seis/Data_Salton"},
									},
								},
							},
						},
					},
					"ok": true,
				},
			},
		},
	}

	normalizeMessagePresentation(&msg)
	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 120, nil))
	for _, want := range []string{
		"status: success",
		"datasets:",
		"Salton Sea Seismic Data",
		"org: ucr-earth-and-planetary-sciences",
		"formats: MiniSEED",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("NDP summary missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, `"_meta"`) || strings.Contains(out, `resource_urls`) {
		t.Fatalf("inline NDP summary should not be raw JSON:\n%s", out)
	}
	foundRaw := false
	for _, part := range msg.Parts {
		if part.Type == gact.PartTypeToolResult && part.Metadata["raw_result"] != nil {
			foundRaw = true
		}
	}
	if !foundRaw {
		t.Fatal("raw NDP result should remain available in tool detail metadata")
	}
}

func TestToolResultRenderHardWrapsLongUnbrokenOutput(t *testing.T) {
	longURL := "https://example.invalid/" + strings.Repeat("very-long-segment-", 20)
	part := gact.Part{
		Type: gact.PartTypeToolResult,
		Content: []gact.Part{{
			Type: gact.PartTypeText,
			Text: longURL,
		}},
	}
	out := DefaultTheme().renderPart(part, 48)
	for _, line := range strings.Split(ansi.Strip(out), "\n") {
		if w := lipgloss.Width(line); w > 52 {
			t.Fatalf("tool result line width = %d, want <= 52:\n%s", w, ansi.Strip(out))
		}
	}
}
