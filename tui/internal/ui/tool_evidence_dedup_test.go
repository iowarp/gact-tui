package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

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
