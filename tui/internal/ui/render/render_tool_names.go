package render

// render_tool_names.go formats tool display names.

import "strings"

// CapitalizeToolName renders the tool name in CamelCase for the
// Claude-Code-style header (e.g. "bash" -> "Bash", "read_file" ->
// "ReadFile", "web_search" -> "WebSearch"). Matches how Claude Code
// displays tool calls so users who've seen both UIs get consistent
// visual vocabulary.
func CapitalizeToolName(name string) string {
	if name == "" {
		return "Tool"
	}
	parts := strings.Split(name, "_")
	for i, w := range parts {
		if w == "" {
			continue
		}
		parts[i] = strings.ToUpper(w[:1]) + w[1:]
	}
	return strings.Join(parts, "")
}

func ToolDisplayName(name string) string {
	tool := strings.ToLower(strings.TrimSpace(name))
	switch {
	case strings.Contains(tool, "geo_geocode") || strings.Contains(tool, "geocode"):
		return "Geocode location"
	case strings.Contains(tool, "filter_points") || strings.Contains(tool, "points_by_radius"):
		return "Filter points by radius"
	case tool == "shell_bash":
		return "Shell command"
	case strings.HasPrefix(tool, "sac_discover_earthscope"):
		return "EarthScope waveform discovery"
	case strings.Contains(tool, "sac_compute") && strings.Contains(tool, "stat"):
		return "SAC trace statistics"
	case strings.Contains(tool, "sac_plot") || strings.Contains(tool, "plot_sac"):
		return "SAC waveform visualization"
	case strings.Contains(tool, "sac_inspect"):
		return "SAC trace inspection"
	case tool == "plot_plot_timeseries" || strings.Contains(tool, "plot_timeseries"):
		return "Plot timeseries"
	case strings.HasPrefix(tool, "ndp_search"):
		return "NDP catalog search"
	case strings.HasPrefix(tool, "ndp_stage"):
		return "NDP resource staging"
	case strings.HasPrefix(tool, "ndp_get"):
		return "NDP dataset lookup"
	case strings.HasPrefix(tool, "ndp_query") || strings.Contains(tool, "arcgis"):
		return "NDP feature query"
	case strings.Contains(tool, "parquet"):
		return "Parquet data analysis"
	case strings.Contains(tool, "hdf5") || strings.Contains(tool, "h5"):
		return "HDF5 data analysis"
	case strings.Contains(tool, "adios") || strings.Contains(tool, "bp5") || strings.Contains(tool, "bp4"):
		return "ADIOS data analysis"
	case strings.Contains(tool, "csv"):
		return "CSV data analysis"
	}
	return CapitalizeToolName(name)
}
