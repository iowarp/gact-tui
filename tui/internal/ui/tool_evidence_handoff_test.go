package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

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
		"Plot written.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("rendered promoted handoff missing %q:\n%s", want, out)
		}
	}
}

func TestStartedHandoffRendersRealInputNotSyntheticStatusBody(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{ID: "intro", Type: gact.PartTypeText, Text: "I will resolve the location first."},
			{
				ID:   "geo_started",
				Type: gact.PartTypeExpertHandoff,
				Text: "main -> geospatial | running | delegate.started",
				Metadata: map[string]any{
					"agent_id":  "geospatial",
					"parent_id": "main",
					"stage":     "delegate.started",
					"status":    "running",
				},
			},
			{
				ID:   "data_started",
				Type: gact.PartTypeExpertHandoff,
				Text: "main -> data | running | delegate.started",
				Metadata: map[string]any{
					"agent_id":      "data",
					"parent_id":     "main",
					"stage":         "delegate.started",
					"status":        "running",
					"input_summary": "Find and stage the nearest EarthScope station metadata catalog.",
				},
			},
		},
	}

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 120, nil))
	if strings.Contains(out, "main -> geospatial | running | delegate.started") {
		t.Fatalf("started handoff should not render synthetic status body as content:\n%s", out)
	}
	if !strings.Contains(out, "Find and stage the nearest EarthScope station metadata catalog.") {
		t.Fatalf("started handoff should render real delegated input text:\n%s", out)
	}
}

func TestNormalizeMessagePresentationParsesAdapterSections(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:   "adapter",
			Type: gact.PartTypeText,
			Text: strings.Join([]string{
				"[[ ## reasoning ## ]]",
				"The user asked for a GNSS plot. I should use the staged CSV and preserve caveats.",
				"",
				"[[ ## answer ## ]]",
				"The requested time-series plot has been generated.",
				"- **Artifact Path**: `gnss_timeseries_P475.png`",
				"",
				"[[ ## workflow_state ## ]]",
				`{"artifact":{"path":"gnss_timeseries_P475.png","status":"ready"},"profile":{"status":"complete"},"station_catalog":{"candidate_count":42,"status":"ranked"}}`,
				"",
				"[[ ## evidence ## ]]",
				"- Station: P475",
				"- Data Points: 2,000",
				"",
				"[[ ## errors ## ]]",
				"none",
				"",
				"[[ ## completed ## ]]",
			}, "\n"),
		}},
	}

	normalizeMessagePresentation(&msg)

	kinds := make([]string, 0, len(msg.Parts))
	for _, part := range msg.Parts {
		kinds = append(kinds, part.Type)
	}
	if strings.Join(kinds, ",") != "thinking,text,expert_handoff,text" {
		t.Fatalf("adapter sections should become thinking/text/state/evidence, got %#v", kinds)
	}
	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 120, nil))
	for _, want := range []string{
		"thinking available",
		"The requested time-series plot has been generated.",
		"artifact ready",
		"station catalog ranked",
		"Evidence",
		"Station: P475",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("adapter-section render missing %q:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{"[[ ##", "workflow_state", `"candidate_count"`, "completed ##", "errors ##"} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("adapter-section render leaked raw adapter text %q:\n%s", unwanted, out)
		}
	}
}

func TestExpertHandoffPrefersLocalEvidenceOverWorkflowStateBlob(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			Type: gact.PartTypeExpertHandoff,
			Text: "main -> visualization | completed | delegate.completed | Retained typed workflow state: {\"workflow_state\":{\"artifact\":{\"path\":\"/tmp/MTA1_timeseries.png\",\"status\":\"ready\"}}}",
			Metadata: map[string]any{
				"agent_id":             "visualization",
				"parent_id":            "main",
				"stage":                "delegate.completed",
				"status":               "completed",
				"output_summary":       "Retained typed workflow state:\n{\"workflow_state\":{\"acquisition\":{\"analysis_ready\":true,\"local_path\":\"/tmp/MTA1.CI.LY_.30.csv\",\"status\":\"staged\"},\"artifact\":{\"columns\":[\"east\",\"north\",\"up\"],\"kind\":\"gnss_timeseries_plot\",\"path\":\"/tmp/MTA1_timeseries.png\",\"status\":\"ready\"},\"station_catalog\":{\"candidate_count\":155,\"station_ids\":[\"MTA1\",\"PKRD\",\"ELSC\"]}}}",
				"local_output_summary": "PNG artifact path: /tmp/MTA1_timeseries.png\nSize: 2000 plotted rows\nPlotted columns: ['time', 'east', 'north', 'up']\nCaveats: scan-limited profile.\n\nCLIO typed workflow state:\n\nRetained typed workflow state:\n{\"workflow_state\":{\"artifact\":{\"path\":\"/tmp/MTA1_timeseries.png\",\"status\":\"ready\"}}}",
			},
		}},
	}

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 120, nil))
	for _, want := range []string{
		"visualization returned evidence to main",
		"PNG artifact path",
		"2000 plotted rows",
		"Plotted columns",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("handoff render missing local evidence %q:\n%s", want, out)
		}
	}
	for _, bad := range []string{`"workflow_state"`, "Retained typed workflow state", "local_output_summary"} {
		if strings.Contains(out, bad) {
			t.Fatalf("handoff render leaked workflow transport %q:\n%s", bad, out)
		}
	}
}

func TestExpertHandoffRendersNestedHierarchyIndentation(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{
				Type: gact.PartTypeExpertHandoff,
				Text: "main delegated work to data.",
				Metadata: map[string]any{
					"agent_id":  "data",
					"parent_id": "main",
					"stage":     "delegate.started",
					"status":    "running",
				},
			},
			{
				Type: gact.PartTypeExpertHandoff,
				Text: "data delegated work to ndp_catalog.",
				Metadata: map[string]any{
					"agent_id":  "ndp_catalog",
					"parent_id": "data",
					"stage":     "delegate.started",
					"status":    "running",
				},
			},
			{
				Type: gact.PartTypeExpertHandoff,
				Text: "ndp_catalog returned records.",
				Metadata: map[string]any{
					"agent_id":  "ndp_catalog",
					"parent_id": "data",
					"stage":     "delegate.completed",
					"status":    "completed",
					"depth":     3.0,
				},
			},
		},
	}

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 120, nil))
	dataIndent := leadingSpacesForLineContaining(out, "main handed work to data")
	ndpStartedIndent := leadingSpacesForLineContaining(out, "data handed work to ndp_catalog")
	ndpReturnedIndent := leadingSpacesForLineContaining(out, "ndp_catalog returned evidence to data")
	if dataIndent < 2 {
		t.Fatalf("child handoff should be indented below root, indent=%d:\n%s", dataIndent, out)
	}
	if ndpStartedIndent <= dataIndent {
		t.Fatalf("grandchild handoff should be deeper than child, child=%d grandchild=%d:\n%s", dataIndent, ndpStartedIndent, out)
	}
	if ndpReturnedIndent <= ndpStartedIndent {
		t.Fatalf("explicit depth should be honored, started=%d returned=%d:\n%s", ndpStartedIndent, ndpReturnedIndent, out)
	}
}

func leadingSpacesForLineContaining(text, needle string) int {
	for _, line := range strings.Split(text, "\n") {
		if !strings.Contains(line, needle) {
			continue
		}
		return len(line) - len(strings.TrimLeft(line, " "))
	}
	return -1
}

func TestAssistantWorkflowStateTextRendersAsSummary(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			Type: gact.PartTypeText,
			Text: "CLIO typed workflow state: {\"workflow_state\":{\"acquisition\":{\"analysis_ready\":true,\"local_path\":\"/tmp/MTA1.CI.LY_.30.csv\",\"status\":\"staged\"},\"artifact\":{\"columns\":[\"east\",\"north\",\"up\"],\"path\":\"/tmp/MTA1_timeseries.png\",\"status\":\"ready\"},\"geospatial\":{\"center_lat\":34.0536909,\"center_lon\":-118.242766,\"radius_km\":100,\"region_name\":\"Los Angeles\",\"status\":\"resolved\"},\"station_catalog\":{\"candidate_count\":155,\"station_ids\":[\"MTA1\",\"PKRD\",\"ELSC\"]}}}",
		}},
	}

	out := ansi.Strip(DefaultTheme().renderMessageInContextWithResults(msg, nil, 120, nil))
	for _, want := range []string{"state:", "acquisition staged", "artifact ready", "geospatial resolved", "station catalog candidates 155"} {
		if !strings.Contains(out, want) {
			t.Fatalf("workflow state text missing summary %q:\n%s", want, out)
		}
	}
	for _, want := range []string{"• acquisition staged", "• artifact ready", "• station catalog candidates 155"} {
		if !strings.Contains(out, want) {
			t.Fatalf("workflow state text should render separate rows, missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, `"workflow_state"`) || strings.Contains(out, "CLIO typed workflow state") {
		t.Fatalf("workflow state text should not leak raw JSON inline:\n%s", out)
	}
}
