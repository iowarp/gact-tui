package presentation

// presentation_sac.go detects and summarizes SAC tool results.

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"strings"
)

func looksLikeSACResult(result map[string]any) bool {
	if FirstStringValue(result, "archive_path", "sac_path", "sac_file", "kstnm", "kcmpnm") != "" {
		return true
	}
	if FirstStringValue(result, "network", "network_code", "station", "channel") != "" &&
		FirstStringValue(result, "start_time", "event_time", "origin_time") != "" {
		return true
	}
	for _, key := range []string{"trace_count", "sac_trace_count", "traces_analyzed", "traces_plotted"} {
		if _, ok := result[key]; ok {
			return true
		}
	}
	return false
}

func summarizeSACResult(result map[string]any) string {
	rows := summarizeStatusRows(result)
	if artifact := FirstStringValue(result, "output_path", "artifact_path", "artifact", "value"); artifact != "" {
		rows = append(rows, "artifact: "+valuefmt.ShortenPathForInline(artifact))
	}
	if stats := summarizeNumericFields(result, []string{
		"sac_trace_count", "trace_count", "traces_plotted", "traces_analyzed", "traces", "events", "event_count", "station_count", "npts", "sample_rate_hz", "sampling_rate", "delta", "duration_s", "duration", "magnitude", "min_magnitude", "min", "max", "mean",
	}); stats != "" {
		rows = append(rows, stats)
	}
	if path := FirstStringValue(result, "path", "file", "file_path", "filepath", "archive_path", "sac_path", "sac_file"); path != "" {
		rows = append(rows, "file: "+valuefmt.ShortenPathForInline(path))
	}
	if network := FirstStringValue(result, "network", "network_code"); network != "" {
		rows = append(rows, "network: "+network)
	}
	if station := FirstStringValue(result, "station", "kstnm"); station != "" {
		rows = append(rows, "station: "+station)
	}
	if channel := FirstStringValue(result, "channel", "kcmpnm", "component"); channel != "" {
		rows = append(rows, "channel: "+channel)
	}
	if location := FirstStringValue(result, "location", "location_code"); location != "" {
		rows = append(rows, "location: "+location)
	}
	if start := FirstStringValue(result, "start_time", "start", "time_start"); start != "" {
		rows = append(rows, "start: "+start)
	}
	if end := FirstStringValue(result, "end_time", "end", "time_end"); end != "" {
		rows = append(rows, "end: "+end)
	}
	if eventTime := FirstStringValue(result, "event_time", "origin_time", "time"); eventTime != "" {
		rows = append(rows, "event_time: "+eventTime)
	}
	if members := SummarizeNamedItems(result, "members", "sample_members", "files", "trace_files", "selected_traces", "traces_sampled"); members != "" {
		rows = append(rows, "members: "+valuefmt.ShortenKnownPaths(members))
	}
	if len(rows) == 0 {
		return ""
	}
	rows = append([]string{"SAC evidence:"}, rows...)
	return strings.Join(rows, "\n")
}
