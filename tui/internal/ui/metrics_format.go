package ui

// metrics_format.go formats metrics activity, latency, and operation-label text.

import (
	"fmt"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func (c *metricsComponent) slowestTUIInteractionText() string {
	summaries := c.tuiInteractionSummaries(1)
	if len(summaries) == 0 {
		return "no TUI interaction samples"
	}
	st := summaries[0]
	return tuiInteractionDisplayTitle(st) + " · " + tuiInteractionOperatorText(st)
}

func sortedKeys(m map[string]int) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func metricsSessionActivityText(s gact.MetricsSessions) string {
	parts := []string{fmt.Sprintf("%d total", s.Total), fmt.Sprintf("%d active", s.Active)}
	for _, status := range sortedKeys(s.ByStatus) {
		parts = append(parts, fmt.Sprintf("%s %d", status, s.ByStatus[status]))
	}
	return strings.Join(parts, " · ")
}

func metricsMessageActivityText(m gact.MetricsMessages) string {
	parts := []string{fmt.Sprintf("%d total", m.Total)}
	for _, role := range sortedKeys(m.ByRole) {
		parts = append(parts, fmt.Sprintf("%s %d", role, m.ByRole[role]))
	}
	return strings.Join(parts, " · ")
}

func sortedFloatKeys(m map[string]float64) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// topLatencyRoutes returns up to n route patterns ordered by descending
// p95 — these are the slowest endpoints, which is what an operator
// debugging the backend cares about.
func topLatencyRoutes(m map[string]gact.MetricsLatencyStat, n int) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		return m[keys[i]].P95Ms > m[keys[j]].P95Ms
	})
	if len(keys) > n {
		keys = keys[:n]
	}
	return keys
}

func metricsSlowestRouteText(m map[string]gact.MetricsLatencyStat) string {
	routes := topLatencyRoutes(m, 1)
	if len(routes) == 0 {
		return "no latency samples"
	}
	route := routes[0]
	st := m[route]
	return metricsOperationLabel(route) + " · " + metricsLatencyOperatorText(st)
}

func metricsLatencyOperatorText(st gact.MetricsLatencyStat) string {
	samples := "no samples"
	if st.Count == 1 {
		samples = "1 sample"
	} else if st.Count > 1 {
		samples = fmt.Sprintf("%d samples", st.Count)
	}
	return fmt.Sprintf("usually %.1fms · worst %.1fms · %s", st.P95Ms, st.MaxMs, samples)
}

func metricsOperationLabel(route string) string {
	route = strings.TrimSpace(route)
	if route == "" {
		return "operation"
	}
	parts := strings.Fields(route)
	if len(parts) >= 2 {
		method := strings.ToUpper(parts[0])
		path := strings.TrimPrefix(parts[1], "/v1/")
		path = strings.TrimPrefix(path, "v1/")
		path = strings.TrimPrefix(path, "/")
		if label := knownMetricsOperationLabel(method, path); label != "" {
			return label
		}
		if path != "" {
			return strings.ReplaceAll(path, "/", " ")
		}
	}
	return route
}

func knownMetricsOperationLabel(method, path string) string {
	switch method + " " + path {
	case "GET sessions":
		return "session list"
	case "GET sessions/{id}":
		return "session load"
	case "GET sessions/{id}/messages":
		return "message history load"
	case "GET sessions/{id}/context/files":
		return "workspace context load"
	case "GET sessions/{id}/tasks":
		return "session task load"
	case "GET capabilities":
		return "capability catalog load"
	case "GET providers/lm":
		return "model provider load"
	case "GET commands":
		return "command catalog load"
	case "GET memory/stats":
		return "memory status load"
	case "GET agents":
		return "agent catalog load"
	case "GET agents/{id}":
		return "agent detail load"
	}
	return ""
}
