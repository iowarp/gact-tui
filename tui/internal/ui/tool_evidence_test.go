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
		"HDF5 data analysis(path: run.h5)",
		"trace metadata",
		`["/entry/current","/entry/voltage"]`,
		"raw detail",
		"Ctrl+E",
		"I inspected the file.",
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
	if !strings.Contains(out, "HDF5 data analysis") {
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
	if !strings.Contains(out, "Parquet data analysis") {
		t.Fatalf("message.completed metadata was not promoted to a tool call:\n%s", out)
	}
}

func TestPartAddedReplacesExistingLivePartByID(t *testing.T) {
	a := &App{
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
	}

	a.applySSE(client.SSEEvent{
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

	if len(a.messages[0].Parts) != 1 {
		t.Fatalf("parts len = %d, want replacement not append", len(a.messages[0].Parts))
	}
	if got := a.messages[0].Parts[0].Content[0].Text; got != "dataset result" {
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
		"raw detail",
		"Ctrl+E",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("live structured result missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, `"_meta"`) || strings.Contains(out, `"datasets":`) {
		t.Fatalf("live structured result should not render raw JSON inline:\n%s", out)
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
	if msg.Parts[2].ToolName != "shell_bash" {
		t.Fatalf("tool result should retain tool name for detail views: %#v", msg.Parts[2])
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
		"handoff metadata",
		"found NDP waveform archive",
		"data -> ndp_catalog",
		"NDP catalog search",
		"trace metadata",
		"Plot written.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("rendered promoted handoff missing %q:\n%s", want, out)
		}
	}
}

func TestNormalizeMessagePresentationSkipsRedundantDirectToolSuccessHandoffs(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{ID: "route", Type: gact.PartTypeRoutingDecision, SelectedAgent: "analysis"},
			{ID: "answer", Type: gact.PartTypeText, Text: "Stats are ready."},
		},
		Metadata: map[string]any{
			"expert_handoffs": []any{
				map[string]any{
					"agent_id":       "analysis",
					"stage":          "direct_tool",
					"status":         "success",
					"input_summary":  "parquet_compute_statistics(column, filepath)",
					"duration_ms":    5.0,
					"output_summary": "",
				},
				map[string]any{
					"agent_id":       "analysis",
					"stage":          "direct_tool",
					"status":         "failure",
					"error":          "column missing",
					"duration_ms":    4.0,
					"output_summary": "",
				},
				map[string]any{
					"agent_id":       "analysis",
					"stage":          "planner_dispatch",
					"status":         "success",
					"output_summary": "computed parquet statistics",
				},
			},
			"tools_called": []any{
				map[string]any{
					"name": "parquet_compute_statistics",
					"args": map[string]any{
						"filepath": "facility_measurements.parquet",
						"column":   "temperature_k",
					},
					"result": map[string]any{
						"column":     "temperature_k",
						"dtype":      "double",
						"null_count": 0,
						"mean":       293.98,
						"ok":         true,
					},
					"ok": true,
				},
			},
		},
	}

	normalizeMessagePresentation(&msg)

	got := []string{}
	for _, part := range msg.Parts {
		got = append(got, part.Type)
	}
	if strings.Join(got, ",") != "routing_decision,expert_handoff,expert_handoff,tool_call,tool_result,text" {
		t.Fatalf("unexpected filtered part order: %#v", got)
	}
	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 130, nil))
	if strings.Contains(out, "success · direct_tool") {
		t.Fatalf("empty successful direct_tool handoff duplicates promoted tool evidence:\n%s", out)
	}
	for _, want := range []string{
		"failure",
		"direct_tool",
		"computed parquet statistics",
		"Parquet data analysis",
		"Stats are ready.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("filtered render missing %q:\n%s", want, out)
		}
	}
}

func TestNormalizeMessagePresentationFiltersExistingRedundantDirectToolHandoffs(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{ID: "route", Type: gact.PartTypeRoutingDecision, SelectedAgent: "analysis"},
			{
				ID:   "handoff_direct",
				Type: gact.PartTypeExpertHandoff,
				Text: "analysis | success | direct_tool",
				Metadata: map[string]any{
					"agent_id":    "analysis",
					"stage":       "direct_tool",
					"status":      "success",
					"duration_ms": 5.0,
				},
			},
			{
				ID:   "handoff_planner",
				Type: gact.PartTypeExpertHandoff,
				Text: "analysis | success | planner_dispatch | inspected parquet",
				Metadata: map[string]any{
					"agent_id":       "analysis",
					"stage":          "planner_dispatch",
					"status":         "success",
					"output_summary": "inspected parquet",
				},
			},
			{ID: "answer", Type: gact.PartTypeText, Text: "Done."},
		},
		Metadata: map[string]any{
			"tools_called": []any{
				map[string]any{
					"name":   "parquet_compute_statistics",
					"args":   map[string]any{"column": "pressure_pa"},
					"result": map[string]any{"column": "pressure_pa", "mean": 101231.17, "ok": true},
					"ok":     true,
				},
			},
		},
	}

	normalizeMessagePresentation(&msg)

	got := []string{}
	for _, part := range msg.Parts {
		got = append(got, part.ID)
	}
	if strings.Join(got, ",") != "route,handoff_planner,synthetic_tool_evidence_1_call,synthetic_tool_evidence_1_result,answer" {
		t.Fatalf("unexpected filtered part ids: %#v", got)
	}
	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 130, nil))
	if strings.Contains(out, "success · direct_tool") {
		t.Fatalf("existing successful direct_tool handoff duplicates promoted tool evidence:\n%s", out)
	}
	for _, want := range []string{
		"planner_dispatch",
		"inspected parquet",
		"Parquet data analysis",
		"Done.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("existing handoff filter render missing %q:\n%s", want, out)
		}
	}
}

func TestNormalizeMessagePresentationCompactsDuplicateToolEvidenceRows(t *testing.T) {
	duplicateTool := func() map[string]any {
		return map[string]any{
			"name": "parquet_compute_statistics",
			"args": map[string]any{
				"filepath": "facility_measurements.parquet",
				"column":   "temperature_k",
			},
			"result": map[string]any{
				"column":     "temperature_k",
				"dtype":      "double",
				"null_count": 0,
				"mean":       293.98,
				"ok":         true,
			},
			"ok":          true,
			"duration_ms": 5.0,
		}
	}
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{ID: "answer", Type: gact.PartTypeText, Text: "Stats are ready."},
		},
		Metadata: map[string]any{
			"tools_called": []any{
				duplicateTool(),
				map[string]any{
					"name":   "parquet_compute_statistics",
					"args":   map[string]any{"filepath": "facility_measurements.parquet", "column": "pressure_pa"},
					"result": map[string]any{"column": "pressure_pa", "dtype": "double", "mean": 101231.17, "ok": true},
					"ok":     true,
				},
				duplicateTool(),
			},
		},
	}

	normalizeMessagePresentation(&msg)

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 150, nil))
	if got := strings.Count(out, "Parquet data analysis("); got != 2 {
		t.Fatalf("expected duplicate tool evidence rows to compact to two calls, got %d:\n%s", got, out)
	}
	if !strings.Contains(out, "trace repeated 1 more time with the same call/result") {
		t.Fatalf("expected repeat notice on retained duplicate evidence:\n%s", out)
	}
	if !strings.Contains(out, "column: pressure_pa") || !strings.Contains(out, "Stats are ready.") {
		t.Fatalf("distinct evidence and final answer should remain visible:\n%s", out)
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
	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 180, nil))
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
	if !strings.Contains(out, "trace metadata · raw detail") {
		t.Fatalf("promoted tool result should advertise provenance and raw detail:\n%s", out)
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
	if !strings.Contains(out, "[trace metadata · raw detail") {
		t.Fatalf("inline NDP summary should advertise raw detail expansion:\n%s", out)
	}
}

func TestToolEvidenceVisualizationArtifactRendersReadableSummary(t *testing.T) {
	msg := gact.Message{
		Role:  gact.RoleAssistant,
		Parts: []gact.Part{{ID: "answer", Type: gact.PartTypeText, Text: "Scatter plot saved."}},
		Metadata: map[string]any{
			"tools_called": []any{
				map[string]any{
					"name": "plot_scatter",
					"args": map[string]any{
						"filepath":    "/home/jcernuda/clio-agent/tmp/clio-benchmark-data/facility_measurements.parquet",
						"output_path": "/home/jcernuda/clio-agent/tmp/clio-benchmark-data/facility_measurements_scatter.png",
						"x_column":    "vibration_mm_s",
						"y_column":    "anomaly_score",
					},
					"result": map[string]any{
						"ok":    true,
						"value": "/home/jcernuda/clio-agent/tmp/clio-benchmark-data/facility_measurements_scatter.png",
					},
					"ok": true,
				},
			},
		},
	}

	normalizeMessagePresentation(&msg)
	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 180, nil))
	for _, want := range []string{
		"PlotScatter(artifact: .../clio-benchmark-data/facility_measurements_scatter.png",
		"x column: vibration_mm_s",
		"y column: anomaly_score",
		"artifact result:",
		"artifact: .../clio-benchmark-data/facility_measurements_scatter.png",
		"raw detail",
		"Scatter plot saved.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("visualization artifact summary missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, `{"ok":true`) || strings.Contains(out, `"value":`) {
		t.Fatalf("inline visualization summary should not be raw JSON:\n%s", out)
	}
}

func TestToolEvidenceNDPFeatureCollectionRendersReadableRecords(t *testing.T) {
	msg := gact.Message{
		Role:  gact.RoleAssistant,
		Parts: []gact.Part{{ID: "answer", Type: gact.PartTypeText, Text: "Current wildfire records are ready."}},
		Metadata: map[string]any{
			"tools_called": []any{
				map[string]any{
					"name": "ndp_query_arcgis_features",
					"args": map[string]any{
						"dataset_identifier": "current-wildfires-ca",
						"where":              "STATE = 'CA'",
					},
					"result": map[string]any{
						"_meta":       map[string]any{"status": "success"},
						"source":      "California current wildfire features",
						"count":       2.0,
						"output_path": "/home/jcernuda/clio-agent/tmp/ndp-meeting-live-agent/current_wildfires_ca.json",
						"features": []any{
							map[string]any{
								"attributes": map[string]any{
									"IncidentName":     "Laguna Fire",
									"IncidentStatus":   "Active",
									"GISAcres":         1420.5,
									"PercentContained": 35.0,
									"County":           "San Diego",
									"LastUpdate":       "2026-06-05T16:10:00Z",
								},
								"geometry": map[string]any{"x": -117.02, "y": 32.71},
							},
							map[string]any{
								"attributes": map[string]any{
									"IncidentName":   "Sierra Fire",
									"IncidentStatus": "Active",
									"County":         "Fresno",
									"GISAcres":       88.0,
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
	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 180, nil))
	for _, want := range []string{
		"NDP feature query(",
		"status: success",
		"source: California current wildfire features",
		"records: 2",
		"artifact: .../ndp-meeting-live-agent/current_wildfires_ca.json",
		"sample: Laguna Fire",
		"Laguna Fire",
		"status: Active",
		"area: San Diego",
		"acres: 1420",
		"containment: 35",
		"Current wildfire records are ready.",
		"Ctrl+E to expand",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("NDP feature summary missing %q:\n%s", want, out)
		}
	}
	foundRaw := false
	for _, part := range msg.Parts {
		if part.Type == gact.PartTypeToolResult && part.Metadata["raw_result"] != nil {
			foundRaw = true
		}
	}
	if !foundRaw {
		t.Fatal("raw NDP feature result should remain available in tool detail metadata")
	}
	for _, notWant := range []string{`"features"`, `"attributes"`, `"geometry"`, `"IncidentName"`} {
		if strings.Contains(out, notWant) {
			t.Fatalf("inline NDP feature summary should not be raw JSON %q:\n%s", notWant, out)
		}
	}
}

func TestRepeatedIdenticalToolRunsCollapseInline(t *testing.T) {
	var parts []gact.Part
	for i := 0; i < 5; i++ {
		callID := "plot_" + itos(i)
		parts = append(parts,
			gact.Part{
				ID:       "call_" + itos(i),
				Type:     gact.PartTypeToolCall,
				CallID:   callID,
				ToolName: "plot_scatter",
				Input: map[string]any{
					"output_path": "/home/jcernuda/clio-agent/tmp/scatter_plot.png",
					"x_column":    "vibration_mm_s",
					"y_column":    "anomaly_score",
				},
			},
			gact.Part{
				ID:       "result_" + itos(i),
				Type:     gact.PartTypeToolResult,
				CallID:   callID,
				ToolName: "plot_scatter",
				Content: []gact.Part{{
					Type: gact.PartTypeText,
					Text: "artifact result:\nartifact: /home/jcernuda/clio-agent/tmp/scatter_plot.png",
				}},
			},
		)
	}
	parts = append(parts, gact.Part{ID: "answer", Type: gact.PartTypeText, Text: "Scatter plot saved."})

	out := ansi.Strip(DefaultTheme().renderPartsForRoleWithResultsSelected(parts, 150, gact.RoleAssistant, nil, ""))
	if got := strings.Count(out, "PlotScatter("); got != 1 {
		t.Fatalf("expected one visible repeated tool call, got %d:\n%s", got, out)
	}
	if got := strings.Count(out, "artifact result:"); got != 1 {
		t.Fatalf("expected one visible repeated tool result, got %d:\n%s", got, out)
	}
	if !strings.Contains(out, "PlotScatter repeated 4 more times") {
		t.Fatalf("expected duplicate tool notice:\n%s", out)
	}
	if !strings.Contains(out, "Scatter plot saved.") {
		t.Fatalf("final answer should remain visible after duplicate compaction:\n%s", out)
	}
}

func TestExpertHandoffInlinePreviewStaysConcise(t *testing.T) {
	part := gact.Part{
		Type: gact.PartTypeExpertHandoff,
		Text: "analysis | success | data_handoff_analysis | Computed SAC waveform statistics for " +
			"/home/jcernuda/clio-agent/tmp/clio-ndp-staging/Pachhai_etal_2023_ScP_data.tar. " +
			"The file exposes 11260 SAC traces; 6 traces were sampled for statistics. - " +
			"AS01 SCP: npts=801, delta_s=0.05, peak_abs=1, member=Pachhai_etal_2023_ScP_data/ASAR_ScP_data.dir/01-02-2013_10:39:48.540/SCP/01-02-2013_10:39:48.540.AS01.ScP.aligned.SAC - " +
			"AS02 SCP: npts=801, delta_s=0.05, peak_abs=1, member=Pachhai_etal_2023_ScP_data/ASAR_ScP_data.dir/01-02-2013_10:39:48.540/SCP/01-02-2013_10:39:48.540.AS02.ScP.aligned.SAC",
		Metadata: map[string]any{
			"agent_id":       "analysis",
			"stage":          "data_handoff_analysis",
			"status":         "success",
			"duration_ms":    886.0,
			"output_summary": "Computed SAC waveform statistics for /home/jcernuda/clio-agent/tmp/clio-ndp-staging/Pachhai_etal_2023_ScP_data.tar. The file exposes 11260 SAC traces; 6 traces were sampled for statistics. - AS01 SCP: npts=801, delta_s=0.05, peak_abs=1, member=Pachhai_etal_2023_ScP_data/ASAR_ScP_data.dir/01-02-2013_10:39:48.540/SCP/01-02-2013_10:39:48.540.AS01.ScP.aligned.SAC",
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 120))
	normalized := strings.Join(strings.Fields(out), " ")
	if !strings.Contains(normalized, "11260 SAC traces") {
		t.Fatalf("handoff preview should retain the important scientific count:\n%s", out)
	}
	if strings.Contains(out, "01-02-2013_10:39:48.540.AS01") {
		t.Fatalf("handoff preview should not inline long member paths:\n%s", out)
	}
}

func TestExpertHandoffInlineHumanizesWorkflowLifecycleStage(t *testing.T) {
	part := gact.Part{
		Type: gact.PartTypeExpertHandoff,
		Text: "analysis returned a compact result to main.",
		Metadata: map[string]any{
			"agent_id":       "analysis",
			"parent_id":      "main",
			"stage":          "delegate.completed",
			"status":         "completed",
			"duration_ms":    20353.0,
			"output_summary": "analysis returned a compact result to main.",
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 120))
	normalized := strings.Join(strings.Fields(out), " ")
	for _, want := range []string{
		"main -> analysis",
		"completed",
		"returned",
		"20353ms",
		"analysis returned a compact result",
	} {
		if !strings.Contains(normalized, want) {
			t.Fatalf("handoff lifecycle render missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "delegate.completed") {
		t.Fatalf("inline handoff should humanize backend lifecycle tokens:\n%s", out)
	}
}

func TestScientificToolCallSummaryUsesPrimaryArgs(t *testing.T) {
	part := gact.Part{
		Type:     gact.PartTypeToolCall,
		ToolName: "sac_compute_trace_statistics",
		Input: map[string]any{
			"filepath":   "/home/jcernuda/clio-agent/tmp/clio-ndp-staging/Pachhai_etal_2023_ScP_data.tar",
			"max_traces": 6.0,
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 120))
	if !strings.Contains(out, "filepath: .../clio-ndp-staging/Pachhai_etal_2023_ScP_data.tar") ||
		!strings.Contains(out, "max traces: 6") {
		t.Fatalf("scientific tool call summary should use named primary args:\n%s", out)
	}
	if strings.Contains(out, `{"filepath"`) {
		t.Fatalf("scientific tool call summary should not fall back to raw JSON:\n%s", out)
	}
}

func TestSacDiscoveryToolCallSummaryUsesWorkflowFields(t *testing.T) {
	part := gact.Part{
		Type:     gact.PartTypeToolCall,
		ToolName: "sac_discover_earthscope_region_waveform",
		Input: map[string]any{
			"days_back":     7.0,
			"duration":      120.0,
			"location":      "San Diego, CA",
			"min_magnitude": 1.0,
			"output_dir":    "/home/jcernuda/.local/share/clio/clio-agent/tmp/clio-seismic-staging",
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 120))
	if !strings.HasPrefix(out, "EarthScope waveform discovery(") {
		t.Fatalf("SAC discovery call should use an operator-facing transcript label:\n%s", out)
	}
	if strings.Contains(out, "SacDiscoverEarthscopeRegionWaveform") {
		t.Fatalf("SAC discovery call should not lead with raw backend function names:\n%s", out)
	}
	for _, want := range []string{"location: San Diego, CA", "window: last 7 days", "duration: 120s", "min magnitude: 1"} {
		if !strings.Contains(out, want) {
			t.Fatalf("SAC discovery call should summarize workflow fields %q:\n%s", want, out)
		}
	}
	for _, raw := range []string{"days_back", "min_magnitude", "output_dir", "clio-seismic-staging"} {
		if strings.Contains(out, raw) {
			t.Fatalf("SAC discovery call should not lead with backend-style field %q:\n%s", raw, out)
		}
	}
	if strings.Contains(out, "output_dir") || strings.Contains(out, "clio-seismic-staging") {
		t.Fatalf("SAC discovery call should not lead with staging implementation paths:\n%s", out)
	}
}

func TestScientificToolCallSummaryShortensParquetFilepath(t *testing.T) {
	part := gact.Part{
		Type:     gact.PartTypeToolCall,
		ToolName: "parquet_analyze_schema",
		Input: map[string]any{
			"filepath": "/home/jcernuda/clio-agent/tmp/clio-benchmark-data/facility_measurements.parquet",
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 120))
	if !strings.Contains(out, "filepath: .../clio-benchmark-data/facility_measurements.parquet") {
		t.Fatalf("Parquet tool call should summarize filepath with shortened path:\n%s", out)
	}
	if strings.Contains(out, "/home/jcernuda/clio-agent/tmp") {
		t.Fatalf("Parquet tool call should not inline full absolute path:\n%s", out)
	}
}

func TestScientificToolCallSummaryShortensHDF5Filepath(t *testing.T) {
	part := gact.Part{
		Type:     gact.PartTypeToolCall,
		ToolName: "hdf5_list_datasets",
		Input: map[string]any{
			"filepath": "/home/jcernuda/clio-agent/tmp/clio-benchmark-data/missing_fusion_run.h5",
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 120))
	if !strings.Contains(out, "filepath: .../clio-benchmark-data/missing_fusion_run.h5") {
		t.Fatalf("HDF5 tool call should summarize filepath with shortened path:\n%s", out)
	}
	if strings.Contains(out, "/home/jcernuda/clio-agent/tmp") {
		t.Fatalf("HDF5 tool call should not inline full absolute path:\n%s", out)
	}
}

func TestCompactSummaryTextPromotesToCompactionPart(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{
				ID:   "compact_1",
				Type: gact.PartTypeText,
				Text: "[compact summary]\nEvidence-Preserving Compact Memory\nkept tool evidence",
				Metadata: map[string]any{
					"synthetic": "compact_summary",
				},
			},
		},
	}

	normalizeMessagePresentation(&msg)
	part := msg.Parts[0]
	if part.Type != gact.PartTypeCompaction {
		t.Fatalf("compact summary should promote to compaction part, got %s", part.Type)
	}
	if part.Text != "" {
		t.Fatalf("promoted compaction should clear text body, got %q", part.Text)
	}
	if strings.Contains(part.Summary, "[compact summary]") ||
		!strings.Contains(part.Summary, "Evidence-Preserving Compact Memory") {
		t.Fatalf("summary should strip transport marker and preserve content: %q", part.Summary)
	}
	if got := part.Metadata["synthetic_from"]; got != "compact_summary_text" {
		t.Fatalf("promoted compaction should keep provenance, got %v", got)
	}
}

func TestCompactionSummaryPreviewCollapsesAndAdvertisesDetail(t *testing.T) {
	part := gact.Part{
		Type: gact.PartTypeCompaction,
		Summary: strings.Join([]string{
			"Evidence-Preserving Compact Memory",
			"line 1",
			"line 2",
			"line 3",
			"line 4",
			"line 5",
			"line 6",
			"line 7",
		}, "\n"),
		Metadata: map[string]any{
			"synthetic_from": "compact_summary_text",
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 100))
	if !strings.Contains(out, "compacted context summary") {
		t.Fatalf("compaction should render as a state marker:\n%s", out)
	}
	if !strings.Contains(out, "compact summary · full summary") || !strings.Contains(out, "Ctrl+E") {
		t.Fatalf("collapsed compaction should advertise detail expansion:\n%s", out)
	}
	if strings.Contains(out, "line 7") {
		t.Fatalf("long compaction summary should be collapsed inline:\n%s", out)
	}
}

func TestToolEvidenceErrorResultRendersStructuredSummary(t *testing.T) {
	msg := gact.Message{
		Role:  gact.RoleAssistant,
		Parts: []gact.Part{{Type: gact.PartTypeText, Text: "The file is unavailable."}},
		Metadata: map[string]any{
			"tools_called": []any{
				map[string]any{
					"name": "hdf5_list_datasets",
					"args": map[string]any{"filepath": "/home/jcernuda/clio-agent/tmp/clio-benchmark-data/missing_fusion_run.h5"},
					"ok":   true,
					"result": map[string]any{
						"ok": false,
						"error": map[string]any{
							"code":        "file_not_found",
							"field":       "filepath",
							"message":     "File does not exist: /home/jcernuda/clio-agent/tmp/clio-benchmark-data/missing_fusion_run.h5",
							"next_action": "Provide an existing file inside an allowed root.",
							"path":        "/home/jcernuda/clio-agent/tmp/clio-benchmark-data/missing_fusion_run.h5",
							"tool":        "hdf5_list_datasets",
						},
					},
				},
			},
		},
	}

	normalizeMessagePresentation(&msg)
	foundErrorResult := false
	for _, part := range msg.Parts {
		if part.Type == gact.PartTypeToolResult && part.IsError {
			foundErrorResult = true
		}
	}
	if !foundErrorResult {
		t.Fatal("tool evidence result with nested ok=false/error should be marked as IsError")
	}
	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 120, nil))
	for _, want := range []string{
		"(error)",
		"error result:",
		"code: file_not_found",
		"message: File does not exist:",
		"path: .../clio-benchmark-data/missing_fusion_run.h5",
		"next action: Provide an existing file",
		"Ctrl+E",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("structured error summary missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, `{"error"`) || strings.Contains(out, `"next_action"`) {
		t.Fatalf("inline error summary should not be raw JSON:\n%s", out)
	}
}

func TestMessageErrorInfoPromotesToExpandableErrorPart(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:   "answer",
			Type: gact.PartTypeText,
			Text: "Chart saved.",
		}},
		ErrorInfo: &gact.ErrorInfo{
			Error:       "tool_error",
			Message:     "Column 'event_status' not found. Available: ['event_id', 'status']",
			Recoverable: true,
			Details: map[string]any{
				"tool": "plot_bar_chart",
				"tool_error": map[string]any{
					"next_action": "Retry with the status column.",
				},
			},
		},
	}

	normalizeMessagePresentation(&msg)
	if len(msg.Parts) < 2 || msg.Parts[0].Type != gact.PartTypeError || msg.Parts[1].Type != gact.PartTypeText {
		t.Fatalf("message error_info should be inserted before final text: %#v", msg.Parts)
	}
	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 120, nil))
	for _, want := range []string{
		"✗ tool_error",
		"Column 'event_status' not found.",
		"error detail",
		"Ctrl+E",
		"partial answer after surfaced error",
		"Chart saved.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("message error_info render missing %q:\n%s", want, out)
		}
	}
	ref := partDetailRef("msg", msg.Parts[0])
	for _, want := range []string{
		"kind: error",
		"code: tool_error",
		"recoverable: true",
		"Column 'event_status' not found",
		"plot_bar_chart",
		"Retry with the status column.",
	} {
		if !strings.Contains(ref.fullText, want) {
			t.Fatalf("message error detail missing %q:\n%s", want, ref.fullText)
		}
	}
}

func TestStopReasonErrorMarksFinalTextAsPartial(t *testing.T) {
	msg := gact.Message{
		Role:       gact.RoleAssistant,
		StopReason: gact.StopReasonError,
		Parts: []gact.Part{
			{
				ID:   "handoff",
				Type: gact.PartTypeExpertHandoff,
				Text: "visualization | partial | planner",
				Metadata: map[string]any{
					"agent_id":       "visualization",
					"stage":          "planner",
					"status":         "partial",
					"output_summary": "Agent planner reached the step limit after partial observations.",
				},
			},
			{
				ID:   "answer",
				Type: gact.PartTypeText,
				Text: "Scatter plot saved.",
			},
		},
	}

	normalizeMessagePresentation(&msg)
	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 120, nil))
	if !strings.Contains(out, "partial answer after surfaced error") {
		t.Fatalf("stop_reason=error final text should be explicitly marked partial:\n%s", out)
	}
}

func TestExpertHandoffFailureShowsParsedErrorSummary(t *testing.T) {
	part := gact.Part{
		Type: gact.PartTypeExpertHandoff,
		Text: "data | failure | direct_tool",
		Metadata: map[string]any{
			"agent_id":    "data",
			"stage":       "direct_tool",
			"status":      "failure",
			"duration_ms": 4.0,
			"error":       `{"error":{"code":"file_not_found","message":"File does not exist: /home/jcernuda/clio-agent/tmp/clio-benchmark-data/missing_fusion_run.h5","next_action":"Provide an existing file inside an allowed root.","path":"/home/jcernuda/clio-agent/tmp/clio-benchmark-data/missing_fusion_run.h5","tool":"hdf5_list_datasets"}}`,
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 120))
	normalized := strings.Join(strings.Fields(out), " ")
	for _, want := range []string{
		"✗ data",
		"failure",
		"direct_tool",
		"error result:",
		"code: file_not_found",
		"next action: Provide an existing file",
	} {
		if !strings.Contains(normalized, want) {
			t.Fatalf("failed handoff should surface parsed error summary %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, `{"error"`) {
		t.Fatalf("failed handoff should not show raw error JSON inline:\n%s", out)
	}
}

func TestExpertHandoffPartialJSONShowsReadableSummary(t *testing.T) {
	part := gact.Part{
		Type: gact.PartTypeExpertHandoff,
		Text: "visualization | partial | planner",
		Metadata: map[string]any{
			"agent_id":       "visualization",
			"stage":          "planner",
			"status":         "partial",
			"output_summary": `{"error":"routing_error","message":"Agent planner reached the step limit after partial observations.","details":{"partial":true,"stage":"step_limit_after_observations","step_limit":12,"recovery_actions":["retry","reconfigure_provider","exit"]},"recoverable":true}`,
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 120))
	for _, want := range []string{
		"visualization",
		"partial",
		"status: routing_error",
		"message: Agent planner reached the step limit",
		"stage: step_limit_after_observations",
		"step limit: 12",
		"recovery: retry, reconfigure_provider, exit",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("partial handoff should surface readable summary %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, `{"error"`) || strings.Contains(out, `"recoverable"`) {
		t.Fatalf("partial handoff should not show raw JSON inline:\n%s", out)
	}
}

func TestAssistantInlineTextShortensLongScientificPaths(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:   "answer",
			Type: gact.PartTypeText,
			Text: "Analysis stage: Computed SAC waveform statistics for /home/jcernuda/clio-agent/tmp/clio-ndp-staging/Pachhai_etal_2023_ScP_data.tar.\n\n" +
				"AS01 SCP: npts=801, member=Pachhai_etal_2023_ScP_data/ASAR_ScP_data.dir/01-02-2013_10:39:48.540/SCP/01-02-2013_10:39:48.540.AS01.ScP.aligned.SAC",
		}},
	}

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 120, nil))
	for _, want := range []string{
		".../clio-ndp-staging/Pachhai_etal_2023_ScP_data.tar",
		".../SCP/01-02-2013_10:39:48.540.AS01.ScP.aligned.SAC",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("assistant inline text should retain shortened scientific path %q:\n%s", want, out)
		}
	}
	for _, notWant := range []string{
		"/home/jcernuda/clio-agent/tmp/clio-ndp-staging",
		"member=Pachhai_etal_2023_ScP_data/ASAR_ScP_data.dir",
	} {
		if strings.Contains(out, notWant) {
			t.Fatalf("assistant inline text should not expose long path %q:\n%s", notWant, out)
		}
	}
	if !strings.Contains(out, "data.tar.") || !strings.Contains(out, "\n  AS01 SCP") {
		t.Fatalf("assistant inline text should preserve paragraph breaks:\n%s", out)
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

func TestLiveParquetToolResultRendersSemanticPreview(t *testing.T) {
	assistant := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{
				ID:       "call",
				Type:     gact.PartTypeToolCall,
				CallID:   "c1",
				ToolName: "parquet_compute_statistics",
				Input:    map[string]any{"path": "facility_measurements.parquet", "column": "pressure_pa"},
			},
		},
	}
	toolMsg := gact.Message{
		Role: gact.RoleTool,
		Parts: []gact.Part{{
			ID:     "result",
			Type:   gact.PartTypeToolResult,
			CallID: "c1",
			Content: []gact.Part{{
				Type: gact.PartTypeText,
				Text: strings.Join([]string{
					`{`,
					`  "status":"success",`,
					`  "path":"facility_measurements.parquet",`,
					`  "column":"pressure_pa",`,
					`  "dtype":"double",`,
					`  "count":3000,`,
					`  "nulls":0,`,
					`  "unique":3000,`,
					`  "mean":101231.18,`,
					`  "std":766.51,`,
					`  "min":98435.39,`,
					`  "median":101229.29,`,
					`  "max":103998.63`,
					`}`,
				}, "\n"),
			}},
		}},
	}
	messages := []gact.Message{assistant, toolMsg}
	inline, _ := pairToolResults(messages)

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(assistant, nil, 120, inline[0]))
	for _, want := range []string{
		"parquet result:",
		"file: facility_measurements.parquet",
		"column: pressure_pa",
		"type: double",
		"mean: 1.012e+05",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("parquet semantic preview missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, `"status"`) || strings.Contains(out, `"pressure_pa"`) {
		t.Fatalf("inline parquet preview should not be raw JSON:\n%s", out)
	}
	ref, ok := findBulkyPartForSelected(assistant, 0, messages, 0)
	if !ok {
		t.Fatal("selected live tool result should still open detail")
	}
	if !strings.Contains(ref.fullText, `"status":"success"`) {
		t.Fatalf("detail should preserve raw tool result, got:\n%s", ref.fullText)
	}
}

func TestLiveNWSFeatureToolResultRendersSemanticPreview(t *testing.T) {
	assistant := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:       "call",
			Type:     gact.PartTypeToolCall,
			CallID:   "nws1",
			ToolName: "ndp_query_arcgis_features",
			Input:    map[string]any{"dataset_identifier": "california-nws-warnings", "where": "state = 'CA'"},
		}},
	}
	toolMsg := gact.Message{
		Role: gact.RoleTool,
		Parts: []gact.Part{{
			ID:       "result",
			Type:     gact.PartTypeToolResult,
			CallID:   "nws1",
			ToolName: "ndp_query_arcgis_features",
			Content: []gact.Part{{
				Type: gact.PartTypeText,
				Text: strings.Join([]string{
					`{`,
					`  "status": "success",`,
					`  "source": "California NWS warnings",`,
					`  "records": [`,
					`    {`,
					`      "properties": {`,
					`        "headline": "Flood Warning issued June 5",`,
					`        "event": "Flood Warning",`,
					`        "severity": "Severe",`,
					`        "areaDesc": "Los Angeles County",`,
					`        "effective": "2026-06-05T11:00:00Z",`,
					`        "expires": "2026-06-05T20:00:00Z"`,
					`      }`,
					`    }`,
					`  ],`,
					`  "output_path": "/home/jcernuda/clio-agent/tmp/ndp-meeting-live-agent/california_nws_warnings.json"`,
					`}`,
				}, "\n"),
			}},
		}},
	}
	messages := []gact.Message{assistant, toolMsg}
	inline, _ := pairToolResults(messages)

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(assistant, nil, 160, inline[0]))
	for _, want := range []string{
		"source: California NWS warnings",
		"records: 1",
		"sample: Flood Warning issued June 5",
		"Flood Warning issued June 5",
		"event: Flood Warning",
		"severity: Severe",
		"area: Los Angeles County",
		"artifact: .../ndp-meeting-live-agent/california_nws_warnings.json",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("live NWS feature preview missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, `"records"`) || strings.Contains(out, `"properties"`) {
		t.Fatalf("live NWS feature preview should not render raw JSON inline:\n%s", out)
	}
	ref, ok := findBulkyPartForSelected(assistant, 0, messages, 0)
	if !ok {
		t.Fatal("selected live feature tool result should still open detail")
	}
	if !strings.Contains(ref.fullText, `"records"`) {
		t.Fatalf("detail should preserve raw feature result, got:\n%s", ref.fullText)
	}
}

func TestScientificToolEvidenceSummariesCoverCommonFormats(t *testing.T) {
	cases := []struct {
		name string
		tool string
		raw  any
		want []string
	}{
		{
			name: "csv",
			tool: "csv_read_schema",
			raw: map[string]any{
				"status": "success",
				"path":   "measurements.csv",
				"rows":   12.0,
				"columns": []any{
					map[string]any{"name": "time", "dtype": "string"},
					map[string]any{"name": "pressure_pa", "dtype": "float64"},
				},
			},
			want: []string{"csv result:", "rows: 12", "columns: time string, pressure_pa float64"},
		},
		{
			name: "hdf5",
			tool: "hdf5_analyze_file",
			raw: map[string]any{
				"file":     "run.h5",
				"datasets": []any{"/entry/current", "/entry/voltage"},
			},
			want: []string{"hdf5 result:", "file: run.h5", "datasets: /entry/current, /entry/voltage"},
		},
		{
			name: "sac",
			tool: "sac_inspect",
			raw: map[string]any{
				"path":           "waveform.sac",
				"station":        "SALTON",
				"channel":        "BHZ",
				"npts":           4000.0,
				"sample_rate_hz": 100.0,
				"duration_s":     40.0,
			},
			want: []string{"sac result:", "station: SALTON", "channel: BHZ", "sample_rate_hz: 100"},
		},
		{
			name: "sac plot",
			tool: "sac_plot_traces",
			raw: map[string]any{
				"filepath":        "/home/jcernuda/clio-agent/tmp/clio-ndp-staging/Pachhai_etal_2023_ScP_data.tar",
				"output_path":     "/home/jcernuda/clio-agent/.clio-agent-artifacts/charts/sac_traces_Pachhai_etal_2023_ScP_data.png",
				"sac_trace_count": 11260.0,
				"traces_plotted":  3.0,
				"members": map[string]any{
					"items": []any{
						"Pachhai_etal_2023_ScP_data/ASAR_ScP_data.dir/01-02-2013_10:39:48.540/SCP/01-02-2013_10:39:48.540.AS01.ScP.aligned.SAC",
					},
				},
				"_meta": map[string]any{"status": "success"},
			},
			want: []string{
				"sac result:",
				"status: success",
				"artifact: .../charts/sac_traces_Pachhai_etal_2023_ScP_data.png",
				"sac_trace_count: 11260",
				"traces_plotted: 3",
				"file: .../clio-ndp-staging/Pachhai_etal_2023_ScP_data.tar",
				".../SCP/01-02-2013_10:39:48.540.AS01.ScP.aligned.SAC",
			},
		},
		{
			name: "earthscope waveform discovery",
			tool: "sac_discover_earthscope_region_waveform",
			raw: map[string]any{
				"archive_path": "/home/jcernuda/.local/share/clio/clio-agent/tmp/clio-seismic-staging/earthscope_CI_BAR_--_BHZ_2026-05-29T021201.sac",
				"network":      "CI",
				"station":      "BAR",
				"location":     "--",
				"channel":      "BHZ",
				"event_count":  4.0,
				"trace_count":  1.0,
				"start_time":   "2026-05-29T02:12:01Z",
				"end_time":     "2026-05-29T02:14:01Z",
				"magnitude":    2.7,
				"_meta":        map[string]any{"status": "success"},
			},
			want: []string{
				"sac result:",
				"status: success",
				"trace_count: 1",
				"event_count: 4",
				"magnitude: 2.7",
				"file: .../clio-seismic-staging/earthscope_CI_BAR_--_BHZ_2026-05-29T021201.sac",
				"network: CI",
				"station: BAR",
				"location: --",
				"channel: BHZ",
				"start: 2026-05-29T02:12:01Z",
				"end: 2026-05-29T02:14:01Z",
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			summary := summarizeToolResult(tc.tool, tc.raw)
			for _, want := range tc.want {
				if !strings.Contains(summary, want) {
					t.Fatalf("summary missing %q:\n%s", want, summary)
				}
			}
		})
	}
}

func TestSummarizeDetachedSACResultWithoutToolName(t *testing.T) {
	raw := `{"_meta":{"status":"success"},"archive_path":"/home/jcernuda/.local/share/clio/clio-agent/tmp/clio-seismic-staging/earthscope_CI_BAR_--_BHZ_2026-05-29T021201.sac","network":"CI","station":"BAR","location":"--","channel":"BHZ","trace_count":1,"event_count":4,"start_time":"2026-05-29T02:12:01Z"}`
	got := summarizeToolResultText("", raw)
	for _, want := range []string{
		"sac result:",
		"status: success",
		"trace_count: 1",
		"event_count: 4",
		"file: .../clio-seismic-staging/earthscope_CI_BAR_--_BHZ_2026-05-29T021201.sac",
		"network: CI",
		"station: BAR",
		"channel: BHZ",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("summary missing %q\nsummary:\n%s", want, got)
		}
	}
}
