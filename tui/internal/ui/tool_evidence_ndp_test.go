package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

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
	foundRaw := false
	for _, part := range msg.Parts {
		if part.Type == gact.PartTypeToolResult && part.Metadata["raw_result"] != nil {
			foundRaw = true
		}
	}
	if !foundRaw {
		t.Fatal("raw NDP result should remain available in tool detail metadata")
	}
	if !strings.Contains(out, "detail: raw · Ctrl+E expand") {
		t.Fatalf("inline NDP summary should advertise raw detail expansion:\n%s", out)
	}
	if strings.Contains(out, "trace metadata") {
		t.Fatalf("inline NDP transcript should not duplicate provenance labels:\n%s", out)
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
		"detail: raw · Ctrl+E expand",
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
		"Ctrl+E expand",
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
