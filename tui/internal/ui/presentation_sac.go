package ui

// presentation_sac.go detects and summarizes SAC tool results.

import "strings"

func looksLikeSACResult(result map[string]any) bool {
	if firstStringValue(result, "archive_path", "sac_path", "sac_file", "kstnm", "kcmpnm") != "" {
		return true
	}
	if firstStringValue(result, "network", "network_code", "station", "channel") != "" &&
		firstStringValue(result, "start_time", "event_time", "origin_time") != "" {
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
	if artifact := firstStringValue(result, "output_path", "artifact_path", "artifact", "value"); artifact != "" {
		rows = append(rows, "artifact: "+shortenPathForInline(artifact))
	}
	if stats := summarizeNumericFields(result, []string{
		"sac_trace_count", "trace_count", "traces_plotted", "traces_analyzed", "traces", "events", "event_count", "station_count", "npts", "sample_rate_hz", "sampling_rate", "delta", "duration_s", "duration", "magnitude", "min_magnitude", "min", "max", "mean",
	}); stats != "" {
		rows = append(rows, stats)
	}
	if path := firstStringValue(result, "path", "file", "file_path", "filepath", "archive_path", "sac_path", "sac_file"); path != "" {
		rows = append(rows, "file: "+shortenPathForInline(path))
	}
	if network := firstStringValue(result, "network", "network_code"); network != "" {
		rows = append(rows, "network: "+network)
	}
	if station := firstStringValue(result, "station", "kstnm"); station != "" {
		rows = append(rows, "station: "+station)
	}
	if channel := firstStringValue(result, "channel", "kcmpnm", "component"); channel != "" {
		rows = append(rows, "channel: "+channel)
	}
	if location := firstStringValue(result, "location", "location_code"); location != "" {
		rows = append(rows, "location: "+location)
	}
	if start := firstStringValue(result, "start_time", "start", "time_start"); start != "" {
		rows = append(rows, "start: "+start)
	}
	if end := firstStringValue(result, "end_time", "end", "time_end"); end != "" {
		rows = append(rows, "end: "+end)
	}
	if eventTime := firstStringValue(result, "event_time", "origin_time", "time"); eventTime != "" {
		rows = append(rows, "event_time: "+eventTime)
	}
	if members := summarizeNamedItems(result, "members", "sample_members", "files", "trace_files", "selected_traces", "traces_sampled"); members != "" {
		rows = append(rows, "members: "+shortenKnownPaths(members))
	}
	if len(rows) == 0 {
		return ""
	}
	rows = append([]string{"SAC evidence:"}, rows...)
	return strings.Join(rows, "\n")
}
