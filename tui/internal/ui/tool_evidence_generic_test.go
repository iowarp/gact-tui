package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestGenericPointFilterToolResultRendersReadableSummary(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{
				Type:     gact.PartTypeToolCall,
				CallID:   "call_geo_filter",
				ToolName: "geo_filter_points_by_radius",
				Input: map[string]any{
					"data_path":  "/tmp/earthscope_stations_clean.csv",
					"center_lat": 39.5261788,
					"center_lon": -119.812658,
					"radius_km":  50,
					"id_column":  "Site",
				},
			},
			{
				Type:     gact.PartTypeToolResult,
				CallID:   "call_geo_filter",
				ToolName: "geo_filter_points_by_radius",
				Content: []gact.Part{{
					Type: gact.PartTypeText,
					Text: `{"preview":"{\"ok\":true,\"count\":3,\"within_radius_count\":3,\"total_points\":1101,\"skipped_invalid\":0,\"center\":{\"lat\":39.5261788,\"lon\":-119.812658},\"radius_km\":50,\"points\":[{\"Site\":\"MTA1\",\"Latitude\":\"34.05522077\",\"(deg)\":\"-118.24550778\",\"distance_km\":0.3045,\"id\":\"MTA1\"},{\"Site\":\"PKRD\",\"Latitude\":\"34.07156214\",\"(deg)\":\"-118.23290960\",\"distance_km\":2.1848,\"id\":\"PKRD\"},{\"Site\":\"ELSC\",\"Latitude\":\"34.02973561\",\"(deg)\":\"-118.20843865\",\"distance_km\":4.1351,\"id\":\"ELSC\"}]}","truncated":true}`,
				}},
			},
		},
	}

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 120, nil))
	for _, want := range []string{
		"Filter points by radius",
		"radius km: 50",
		"location: 39.53, -119.8 · radius 50 km",
		"input: 1101",
		"matched: 3",
		"records: 3",
		"sample: MTA1 (0.3045 km), PKRD (2.185 km), ELSC (4.135 km)",
		"detail: raw · Ctrl+E expand",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("generic point-filter render missing %q:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{`"preview"`, `within_radius_count`, `total_points`, `GeoFilterPointsByRadius`} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("generic point-filter render leaked raw detail %q:\n%s", unwanted, out)
		}
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
	toolIdx := strings.Index(out, "Shell command")
	resultIdx := strings.Index(out, "Saturday, May 23")
	answerIdx := strings.Index(out, "It is 3 PM.")
	if toolIdx < 0 || resultIdx < 0 || answerIdx < 0 || !(toolIdx < resultIdx && resultIdx < answerIdx) {
		t.Fatalf("rendered order should be tool call -> result -> answer:\n%s", out)
	}
}

func TestStructuredToolResultsUseGenericEvidenceSummaries(t *testing.T) {
	cases := []struct {
		name     string
		toolName string
		input    map[string]any
		result   string
		want     []string
		bad      []string
	}{
		{
			name:     "coordinate filter",
			toolName: "geofilterpoints_by_radius",
			input:    map[string]any{"region": "Los Angeles", "radius_km": 100},
			result:   `{"status":"filtered","center":{"lat":34.0536909,"lon":-118.242766},"radius_km":100,"input_count":155,"matched_count":72,"points":[{"station":"MTA1","distance_km":0.3749},{"station":"PKRD","distance_km":2.3714},{"station":"ELSC","distance_km":4.0982}]}`,
			want: []string{
				"Filter points by radius",
				"structured result:",
				"status: filtered",
				"location: 34.05, -118.2",
				"radius 100 km",
				"input: 155",
				"matched: 72",
				"MTA1",
			},
			bad: []string{`"points"`, `{"status"`, `"matched_count"`},
		},
		{
			name:     "record list",
			toolName: "facility_lookup_records",
			input:    map[string]any{"dataset": "beamline-incidents"},
			result:   `{"status":"ok","record_count":2,"records":[{"id":"INC-7","title":"cooling loop warning","severity":"medium"},{"id":"INC-8","title":"pump recovery","severity":"low"}]}`,
			want: []string{
				"FacilityLookupRecords",
				"records result:",
				"status: ok",
				"records: 2",
				"INC-7",
				"INC-8",
			},
			bad: []string{`"records"`, `{"status"`, `"record_count"`},
		},
		{
			name:     "artifact result",
			toolName: "write_report_artifact",
			input:    map[string]any{"format": "markdown"},
			result:   `{"status":"ready","artifact_path":"/tmp/clio-report/final_summary.md","summary":"Wrote collaborator handoff report with retained evidence and caveats.","rows":18}`,
			want: []string{
				"WriteReportArtifact",
				"structured result:",
				"status: ready",
				"artifact: /tmp/clio-report/final_summary.md",
				"summary: Wrote collaborator handoff report",
				"rows: 18",
			},
			bad: []string{`"artifact_path"`, `{"status"`, `"summary"`},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			msg := gact.Message{
				Role: gact.RoleAssistant,
				Parts: []gact.Part{
					{
						Type:     gact.PartTypeToolCall,
						CallID:   "call_structured",
						ToolName: tc.toolName,
						Input:    tc.input,
					},
					{
						Type:     gact.PartTypeToolResult,
						CallID:   "call_structured",
						ToolName: tc.toolName,
						Content: []gact.Part{{
							Type: gact.PartTypeText,
							Text: tc.result,
						}},
					},
				},
			}

			out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 120, nil))
			for _, want := range tc.want {
				if !strings.Contains(out, want) {
					t.Fatalf("structured result missing %q:\n%s", want, out)
				}
			}
			for _, bad := range tc.bad {
				if strings.Contains(out, bad) {
					t.Fatalf("structured result leaked raw JSON %q:\n%s", bad, out)
				}
			}
			if got := strings.Count(out, "\n"); got > 20 {
				t.Fatalf("structured result should stay compact, got %d lines:\n%s", got+1, out)
			}
		})
	}
}
