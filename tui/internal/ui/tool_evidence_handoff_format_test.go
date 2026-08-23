package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

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
		"analysis returned evidence to main",
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

func TestExpertHandoffSummarizesEmbeddedRegionJSON(t *testing.T) {
	part := gact.Part{
		Type: gact.PartTypeExpertHandoff,
		Text: `{"REGION_LABEL":"Los Angeles, CA, USA","CENTER_LAT":34.0522,"CENTER_LON":-118.2437,"RADIUS_KM":50,"CONFIDENCE":"high","PROVENANCE":"model_geographic_prior","WARNINGS":[]} CLIO durable typed workflow state: Retained typed workflow state: {"workflow_state":{"geospatial":{"center_lat":34.0522,"center_lon":-118.2437,"radius_km":50}}}`,
		Metadata: map[string]any{
			"agent_id":       "geospatial",
			"parent_id":      "main",
			"stage":          "delegate.completed",
			"status":         "completed",
			"output_summary": `{"REGION_LABEL":"Los Angeles, CA, USA","CENTER_LAT":34.0522,"CENTER_LON":-118.2437,"RADIUS_KM":50,"CONFIDENCE":"high","PROVENANCE":"model_geographic_prior","WARNINGS":[]} CLIO durable typed workflow state: Retained typed workflow state: {"workflow_state":{"geospatial":{"center_lat":34.0522,"center_lon":-118.2437,"radius_km":50}}}`,
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 132))
	normalized := strings.Join(strings.Fields(out), " ")
	for _, want := range []string{"geospatial returned evidence to main", "resolved region: Los Angeles, CA, USA", "center 34.05", "radius 50 km", "confidence high"} {
		if !strings.Contains(normalized, want) {
			t.Fatalf("region handoff summary missing %q:\n%s", want, out)
		}
	}
	for _, raw := range []string{"REGION_LABEL", "CENTER_LAT", "workflow_state", "CLIO durable typed workflow state", `"PROVENANCE"`} {
		if strings.Contains(out, raw) {
			t.Fatalf("region handoff leaked raw JSON/control text %q:\n%s", raw, out)
		}
	}
}

func TestExpertHandoffStripsRealCLIOWorkflowStateBlock(t *testing.T) {
	summary := `**Resolved geography**: San Diego, CA (bbox=[31.8157, -118.2311, 33.6157, -116.0911]) - status **resolved**.
**Dataset discovery**: No EarthScope GNSS station CSV resources intersect this bbox - catalog status **no_candidates**.
**Resource selection**: No candidate could be selected - resource_candidate status **missing**.

CLIO durable typed workflow state:

Retained typed workflow state:
{"workflow_state":{"catalog":{"candidate_count":0,"status":"no_candidates"},"geospatial":{"bbox":[31.8157,-118.2311,33.6157,-116.0911],"label":"San Diego, CA","status":"resolved"},"resource_candidate":{"status":"missing"}}}`
	part := gact.Part{
		Type: gact.PartTypeExpertHandoff,
		Text: summary,
		Metadata: map[string]any{
			"agent_id":       "data",
			"parent_id":      "main",
			"stage":          "delegate.completed",
			"status":         "completed",
			"output_summary": summary,
			"workflow_state": map[string]any{
				"catalog":            map[string]any{"candidate_count": 0.0, "status": "no_candidates"},
				"geospatial":         map[string]any{"label": "San Diego, CA", "status": "resolved"},
				"resource_candidate": map[string]any{"status": "missing"},
			},
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 132))
	normalized := strings.Join(strings.Fields(out), " ")
	for _, want := range []string{"data returned evidence to main", "Resolved geography", "San Diego, CA", "Dataset discovery", "Resource selection"} {
		if !strings.Contains(normalized, want) {
			t.Fatalf("real CLIO handoff summary missing %q:\n%s", want, out)
		}
	}
	for _, raw := range []string{"workflow_state", "CLIO durable typed workflow state", "Retained typed workflow state", `"catalog"`, `"bbox"`} {
		if strings.Contains(out, raw) {
			t.Fatalf("real CLIO handoff leaked typed-state dump %q:\n%s", raw, out)
		}
	}
}

func TestExpertHandoffRendersMarkdownTableSummary(t *testing.T) {
	summary := `## EarthScope GNSS check

| Station | Motion | Trust |
| --- | ---: | --- |
| P472 | 2.4 mm east | medium |
| P467 | 0.8 mm north | high |

- Recent window: 7 days
- Caveat: check maintenance flags before treating the signal as tectonic.`
	part := gact.Part{
		Type: gact.PartTypeExpertHandoff,
		Text: summary,
		Metadata: map[string]any{
			"agent_id":       "earthscope_catalog",
			"parent_id":      "main",
			"stage":          "delegate.completed",
			"status":         "completed",
			"output_summary": summary,
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 120))
	for _, want := range []string{"EarthScope GNSS check", "Station", "Motion", "Trust", "P472", "Recent window"} {
		if !strings.Contains(out, want) {
			t.Fatalf("markdown handoff render missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "| Station | Motion | Trust |") || strings.Count(out, "\n") < 6 {
		t.Fatalf("markdown table should render as structured rows, not flattened pipe text:\n%s", out)
	}
}

func TestExpertHandoffRecoversCompressedMarkdownTable(t *testing.T) {
	summary := `Ranked EarthScope GNSS stations within 50 km of Los Angeles (nearest -> farthest) | Rank | Station ID | Distance (km) | |------|------------|---------------| | 1 | MTA1 | 0.3749 | | 2 | PKRD | 2.3714 | | 3 | ELSC | 4.0982 |`
	part := gact.Part{
		Type: gact.PartTypeExpertHandoff,
		Text: summary,
		Metadata: map[string]any{
			"agent_id":       "earthscope_station_catalog",
			"parent_id":      "data",
			"stage":          "delegate.completed",
			"status":         "completed",
			"output_summary": summary,
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 120))
	for _, want := range []string{"Ranked EarthScope GNSS stations", "Rank", "Station ID", "Distance", "MTA1", "PKRD", "ELSC"} {
		if !strings.Contains(out, want) {
			t.Fatalf("compressed markdown table render missing %q:\n%s", want, out)
		}
	}
	for _, bad := range []string{"| |------|", "| 1 | MTA1 | 0.3749 | | 2 |"} {
		if strings.Contains(out, bad) {
			t.Fatalf("compressed table should not remain flattened inline %q:\n%s", bad, out)
		}
	}
}

func TestExpertHandoffSummarizesTypedWorkflowStateJSONOnly(t *testing.T) {
	summary := `CLIO typed workflow state:
{"workflow_state":{"acquisition":{"analysis_ready":true,"local_path":"/tmp/grind-es-1uvay5fx/MTA1.CI.LY_.30.csv","status":"staged"},"artifact":{"kind":"gnss_timeseries_plot","path":"/tmp/grind-es-1uvay5fx/MTA1.CI.LY_.30_plot.png","status":"ready"},"station_catalog":{"candidate_count":72,"status":"ranked"}}}`
	part := gact.Part{
		Type: gact.PartTypeExpertHandoff,
		Text: summary,
		Metadata: map[string]any{
			"agent_id":       "data",
			"parent_id":      "main",
			"stage":          "delegate.completed",
			"status":         "completed",
			"output_summary": summary,
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 120))
	normalized := strings.Join(strings.Fields(out), " ")
	for _, want := range []string{"data returned evidence to main", "state:", "acquisition staged", "artifact ready", "station catalog ranked"} {
		if !strings.Contains(normalized, want) {
			t.Fatalf("typed workflow state render missing %q:\n%s", want, out)
		}
	}
	for _, want := range []string{"• acquisition staged", "• artifact ready", "• station catalog ranked"} {
		if !strings.Contains(out, want) {
			t.Fatalf("typed workflow state should render separate rows, missing %q:\n%s", want, out)
		}
	}
	for _, raw := range []string{"workflow_state", `"local_path"`, `"station_catalog"`, "/tmp/grind-es-1uvay5fx"} {
		if strings.Contains(out, raw) {
			t.Fatalf("typed workflow state leaked raw payload %q:\n%s", raw, out)
		}
	}
}

func TestNormalizeExpertHandoffsDropsParentResumedNoise(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Metadata: map[string]any{"expert_handoffs": []any{
			map[string]any{
				"agent_id": "data", "parent_id": "main", "stage": "delegate.started", "status": "running",
				"summary": "main delegated sync work to data.",
			},
			map[string]any{
				"agent_id": "main", "parent_id": "data", "stage": "parent.resumed", "status": "completed",
				"summary": "main resumed after data.",
			},
			map[string]any{
				"agent_id": "data", "parent_id": "main", "stage": "delegate.completed", "status": "completed",
				"output_summary": "Resolved Region (Los Angeles)\n\n- Center: 34.0522, -118.2437",
			},
		}},
	}

	normalizeMessagePresentation(&msg)
	out := ansi.Strip(DefaultTheme().renderMessage(msg, 120))
	if strings.Contains(out, "resumed after data") || strings.Contains(out, "parent resumed") {
		t.Fatalf("parent resumed lifecycle noise should not render:\n%s", out)
	}
	for _, want := range []string{"main handed work to data", "data returned evidence to main", "Resolved Region"} {
		if !strings.Contains(out, want) {
			t.Fatalf("filtered handoff render missing %q:\n%s", want, out)
		}
	}
}
