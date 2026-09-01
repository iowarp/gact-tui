package ui

import (
	"os"
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestRenoEarthScopeWorkflowRendersAgentProseAndSemanticTools(t *testing.T) {
	parts := []gact.Part{
		{
			Type: gact.PartTypeExpertHandoff,
			Text: "main delegated sync work to geospatial.",
			Metadata: map[string]any{
				"agent_id":  "geospatial",
				"parent_id": "main",
				"stage":     "delegate.started",
				"status":    "running",
				"input":     "Resolve \"Reno, Nevada\" into grounded coordinates and define a search radius for EarthScope GNSS station discovery.\n\nParent evidence available for this delegated task:\n\nThe user asked for the nearest station and plot.",
			},
		},
		gact.Part{
			Type:          gact.PartTypeRoutingDecision,
			SelectedAgent: "geo",
			Rationale:     "The geospatial expert can resolve Reno before station ranking.",
			Metadata:      map[string]any{"parent_id": "orchestrator"},
		},
		{
			Type:     gact.PartTypeToolCall,
			CallID:   "geo_1",
			ToolName: "geo_geocode",
			Input: map[string]any{
				"query":        "Reno, Nevada",
				"countrycodes": "us",
				"limit":        1.0,
			},
			Metadata: map[string]any{"status": "running", "agent_id": "geo", "parent_id": "geospatial"},
		},
		{
			Type:     gact.PartTypeToolResult,
			CallID:   "geo_1",
			ToolName: "geo_geocode",
			Metadata: map[string]any{"agent_id": "geo", "parent_id": "geospatial"},
			Content: []gact.Part{{
				Type: gact.PartTypeText,
				Text: "[{'display_name': 'Reno, Washoe County, Nevada, United States', 'lat': 39.5261788, 'lon': -119.812658, 'bbox': [-120.002317, 39.392426, -119.6912347, 39.723436], 'type': 'administrative', 'importance': 0.61651822736575, 'provenance': 'osm_nominatim'}]",
			}},
		},
		{
			Type: gact.PartTypeExpertHandoff,
			Text: "geospatial returned a compact result to main.",
			Metadata: map[string]any{
				"agent_id":       "geospatial",
				"parent_id":      "main",
				"stage":          "delegate.completed",
				"status":         "completed",
				"duration_ms":    11684.0,
				"output_summary": "Resolved Region (Reno, Nevada)\n\n- Center: 39.5261788, -119.812658\n- Radius: 50km\n- Confidence: high\n\nCLIO typed workflow state:\n\nRetained typed workflow state:\n{\"workflow_state\":{\"geospatial\":{\"center_lat\":39.5261788,\"center_lon\":-119.812658,\"radius_km\":50,\"status\":\"resolved\"}}}",
			},
		},
		{
			Type: gact.PartTypeExpertHandoff,
			Text: "main delegated sync work to data.",
			Metadata: map[string]any{
				"agent_id":      "data",
				"parent_id":     "main",
				"stage":         "delegate.started",
				"status":        "running",
				"input_summary": "Using the resolved Reno region, discover EarthScope GNSS station resources, rank the nearest station, stage the CSV, and keep enough evidence for plotting east, north, and up displacement.",
			},
		},
		{
			Type:     gact.PartTypeToolCall,
			CallID:   "ndp_1",
			ToolName: "ndp_search_datasets",
			Metadata: map[string]any{"agent_id": "ndp_dataset_discovery", "parent_id": "data"},
			Input: map[string]any{
				"search_terms": "earthscope, converted",
				"limit":        10.0,
			},
		},
		{
			Type:     gact.PartTypeToolResult,
			CallID:   "ndp_1",
			ToolName: "ndp_search_datasets",
			Metadata: map[string]any{"agent_id": "ndp_dataset_discovery", "parent_id": "data"},
			Content: []gact.Part{{
				Type: gact.PartTypeText,
				Text: `{"status":"success","count":1}`,
			}},
		},
		{
			Type:     gact.PartTypeToolCall,
			CallID:   "geo_filter_1",
			ToolName: "geo_filter_points_by_radius",
			Metadata: map[string]any{"agent_id": "geospatial", "parent_id": "data"},
			Input: map[string]any{
				"data_path":  "/home/jcernuda/demo-clio/earthscope_stations_clean.csv",
				"center_lat": 39.5261788,
				"center_lon": -119.812658,
				"radius_km":  50.0,
				"id_column":  "Site",
			},
		},
		{
			Type:     gact.PartTypeToolResult,
			CallID:   "geo_filter_1",
			ToolName: "geo_filter_points_by_radius",
			Metadata: map[string]any{"agent_id": "geospatial", "parent_id": "data"},
			Content: []gact.Part{{
				Type: gact.PartTypeText,
				Text: `{"preview":"{\"ok\":true,\"count\":3,\"within_radius_count\":3,\"total_points\":1101,\"skipped_invalid\":0,\"center\":{\"lat\":39.5261788,\"lon\":-119.812658},\"radius_km\":50,\"points\":[{\"Site\":\"RENO\",\"Latitude\":\"39.526\",\"(deg)\":\"-119.812\",\"distance_km\":0.1,\"id\":\"RENO\"},{\"Site\":\"SPKS\",\"Latitude\":\"39.53\",\"(deg)\":\"-119.75\",\"distance_km\":5.2,\"id\":\"SPKS\"},{\"Site\":\"CARV\",\"Latitude\":\"39.16\",\"(deg)\":\"-119.76\",\"distance_km\":40.6,\"id\":\"CARV\"}]}","truncated":true}`,
			}},
		},
		{
			Type:     gact.PartTypeToolCall,
			CallID:   "shell_1",
			ToolName: "shell_bash",
			Metadata: map[string]any{"agent_id": "utility", "parent_id": "data"},
			Input: map[string]any{
				"command": "cut -d, -f1-3 '/home/jcernuda/demo-clio/earthscope_converted_data.csv' > '/home/jcernuda/demo-clio/earthscope_stations_clean.csv'",
			},
		},
		{
			Type:     gact.PartTypeToolResult,
			CallID:   "shell_1",
			ToolName: "shell_bash",
			Metadata: map[string]any{"agent_id": "utility", "parent_id": "data"},
			Content: []gact.Part{{
				Type: gact.PartTypeText,
				Text: `{"exit_code":0}`,
			}},
		},
		{
			Type: gact.PartTypeExpertHandoff,
			Text: "data returned a compact result to main.",
			Metadata: map[string]any{
				"agent_id":       "data",
				"parent_id":      "main",
				"stage":          "delegate.completed",
				"status":         "completed",
				"output_summary": "The EarthScope GNSS data acquisition for the Reno region is complete.\n\n- **Resolved Region**: Reno (Center: 39.5261788, -119.812658; Radius: 50km).\n- **Station Selection**: nearest candidate selected from the staged station catalog.\n- **Staged Resource**: a concrete time-series CSV has been staged for analysis.\n\nCLIO typed workflow state:\n\nRetained typed workflow state:\n{\"workflow_state\":{\"acquisition\":{\"status\":\"staged\",\"local_path\":\"/home/jcernuda/demo-clio/RENO.csv\"},\"station_catalog\":{\"candidate_count\":12,\"status\":\"ranked\"}}}",
			},
		},
	}

	out := ansi.Strip(DefaultTheme().renderPartsForRoleWithResultsSelected(parts, 140, gact.RoleAssistant, nil, ""))
	if exportPath := strings.TrimSpace(os.Getenv("GACT_TUI_RENO_RENDER_AUDIT_OUT")); exportPath != "" {
		if err := os.WriteFile(exportPath, []byte(out+"\n"), 0o644); err != nil {
			t.Fatalf("write render audit: %v", err)
		}
	}
	for _, want := range []string{
		"main handed work to geospatial",
		"Resolve \"Reno, Nevada\" into grounded coordinates",
		"orchestrator selected geo",
		"Geocode location",
		"Reno, Washoe County, Nevada, United States",
		"center: 39.5261788, -119.812658",
		"geospatial returned evidence to main",
		"Resolved Region (Reno, Nevada)",
		"main handed work to data",
		"discover EarthScope GNSS station resources",
		"NDP catalog search",
		"Filter points by radius",
		"sample: RENO (0.1 km), SPKS (5.2 km), CARV (40.6 km)",
		"Shell command(prepare",
		"data returned evidence to main",
		"The EarthScope GNSS data acquisition for the Reno region is complete.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("Reno workflow render missing %q:\n%s", want, out)
		}
	}
	for _, bad := range []string{
		"GeoGeocode({",
		"GeoFilterPointsByRadius",
		"[{'display_name'",
		"within_radius_count",
		"cut -d, -f1-3",
		"workflow_state",
		"Retained typed workflow state",
		"CLIO typed workflow state",
	} {
		if strings.Contains(out, bad) {
			t.Fatalf("Reno workflow render leaked %q:\n%s", bad, out)
		}
	}
}
