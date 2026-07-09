package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/presentation"
)

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
	lines := strings.Split(out, "\n")
	paragraphBreak := false
	for i, line := range lines {
		if strings.Contains(line, "data.tar.") {
			seenBlank := false
			for j := i + 1; j < len(lines); j++ {
				switch {
				case strings.TrimSpace(lines[j]) == "":
					seenBlank = true
				case strings.Contains(lines[j], "AS01 SCP") && paragraphBreak:
					goto checkedParagraph
				case strings.Contains(lines[j], "AS01 SCP") && seenBlank:
					paragraphBreak = true
					goto checkedParagraph
				case strings.Contains(lines[j], "AS01 SCP"):
					goto checkedParagraph
				}
			}
		}
	}
checkedParagraph:
	if !paragraphBreak {
		t.Fatalf("assistant inline text should preserve paragraph breaks:\n%s", out)
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
			want: []string{"SAC evidence:", "station: SALTON", "channel: BHZ", "sample_rate_hz: 100"},
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
				"SAC evidence:",
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
				"SAC evidence:",
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
			summary := presentation.SummarizeToolResult(tc.tool, tc.raw)
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
		"SAC evidence:",
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
