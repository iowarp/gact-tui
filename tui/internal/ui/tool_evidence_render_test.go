package ui

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/render"
	"strings"
	"testing"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

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
	inline, _ := render.PairToolResults(messages)

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
	inline, _ := render.PairToolResults(messages)

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
