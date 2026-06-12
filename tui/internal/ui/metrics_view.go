package ui

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// metricsState is what the Metrics modal shows. Loaded fresh every time
// the modal opens; not auto-refreshed (snapshot semantics — call again
// to refresh).
type metricsState struct {
	loading bool
	err     error
	data    gact.Metrics
	scroll  int
}

// loadMetricsCmd fetches /v1/metrics.
func loadMetricsCmd(c *client.Client) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		m, err := c.Metrics(ctx)
		return metricsLoadedMsg{data: m, err: err}
	}
}

type metricsLoadedMsg struct {
	data gact.Metrics
	err  error
}

// handleMetricsKey routes keys while the Metrics modal is open. Modal is
// read-only — Esc/Ctrl+M close, anything else swallowed.
func (a *App) handleMetricsKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+t":
		a.metricsOpen = false
		return a, nil
	case "r":
		a.metrics = &metricsState{loading: true}
		return a, loadMetricsCmd(a.c)
	case "up", "k":
		if a.metrics != nil {
			a.metrics.scroll--
		}
		return a, nil
	case "down", "j":
		if a.metrics != nil {
			a.metrics.scroll++
		}
		return a, nil
	case "pgup", "ctrl+u":
		if a.metrics != nil {
			a.metrics.scroll -= a.metricsBodyPageSize()
		}
		return a, nil
	case "pgdown", "ctrl+d":
		if a.metrics != nil {
			a.metrics.scroll += a.metricsBodyPageSize()
		}
		return a, nil
	case "g", "home":
		if a.metrics != nil {
			a.metrics.scroll = 0
		}
		return a, nil
	case "G", "end":
		if a.metrics != nil {
			a.metrics.scroll = 1 << 30
		}
		return a, nil
	}
	return a, nil
}

// viewMetrics renders the modal.
func (a *App) viewMetrics() string {
	t := a.Theme
	if a.metrics == nil {
		a.metrics = &metricsState{loading: true}
	}
	w := a.modalWidth()

	buttons := []menuButton{
		{
			id:    "metrics:refresh",
			label: "refresh",
			action: func(app *App) tea.Cmd {
				app.metrics = &metricsState{loading: true}
				return loadMetricsCmd(app.c)
			},
		},
		closeMenuButton("metrics:close", func(app *App) { app.metricsOpen = false }),
	}

	rows := []string{}
	rowHits := []modalRowHit{}
	switch {
	case a.metrics.err != nil:
		rows = append(rows,
			lipgloss.NewStyle().Foreground(t.Danger).Render("Error: "+a.metrics.err.Error()))
	case a.metrics.loading:
		rows = append(rows, t.HintLabel.Render("loading…"))
	default:
		m := a.metrics.data
		rows = appendDetailSection(rows, "Operator snapshot",
			detailField{"sessions", fmt.Sprintf("%d total · %d active", m.Sessions.Total, m.Sessions.Active)},
			detailField{"messages", fmt.Sprintf("%d total", m.Messages.Total)},
			detailField{"tokens", fmt.Sprintf("%d input · %d output", m.Tokens.InputTotal, m.Tokens.OutputTotal)},
			detailField{"cost", fmt.Sprintf("$%.4f", m.Cost.TotalUSD)},
			detailField{"slowest TUI surface", a.metricsSlowestTUIInteractionText()},
			detailField{"slowest operation", metricsSlowestRouteText(m.Latencies)},
		)
		rows = appendDetailSection(rows, "Activity",
			detailField{"uptime", fmt.Sprintf("%ds", m.UptimeS)},
			detailField{"sessions", metricsSessionActivityText(m.Sessions)},
			detailField{"messages", metricsMessageActivityText(m.Messages)},
		)

		rows = appendDetailSection(rows, "Token use",
			detailField{"input/output", fmt.Sprintf("%d input · %d output", m.Tokens.InputTotal, m.Tokens.OutputTotal)},
			detailField{"cache", fmt.Sprintf("%d read · %d write", m.Tokens.CacheReadTotal, m.Tokens.CacheWriteTotal)},
		)

		costFields := []detailField{
			{"all providers", fmt.Sprintf("$%.4f", m.Cost.TotalUSD)},
		}
		costSectionStart := len(rows)
		for _, name := range sortedFloatKeys(m.Cost.ByProvider) {
			provider := name
			amount := m.Cost.ByProvider[name]
			rowHits = append(rowHits, modalRowHit{
				id:     "metrics:cost:" + provider,
				start:  metricsFieldRowStart(costSectionStart) + 1 + len(costFields) - 1,
				height: 1,
				action: func(app *App) tea.Cmd {
					app.openMetricsCostDetail(provider, amount)
					return nil
				},
			})
			costFields = append(costFields, detailField{name, fmt.Sprintf("$%.4f", m.Cost.ByProvider[name])})
		}
		rows = appendDetailSection(rows, "Spend by provider", costFields...)

		if summaries := a.tuiInteractionSummaries(0); len(summaries) > 0 {
			sections := tuiInteractionLatencySections(summaries)
			sectionFields := make([]detailField, 0, len(sections))
			sectionStart := len(rows)
			for i, section := range sections {
				st := section
				rowHits = append(rowHits, modalRowHit{
					id:     "metrics:tui-section-latency:" + st.Surface,
					start:  metricsFieldRowStart(sectionStart) + i,
					height: 1,
					action: func(app *App) tea.Cmd {
						app.openMetricsTUILatencySectionDetail(st)
						return nil
					},
				})
				sectionFields = append(sectionFields, detailField{
					truncate(tuiInteractionSectionDisplayTitle(st), 32),
					tuiInteractionSectionOperatorText(st),
				})
			}
			rows = appendDetailSection(rows, "TUI latency by section", sectionFields...)

			detailSummaries := summaries
			if len(detailSummaries) > 6 {
				detailSummaries = detailSummaries[:6]
			}
			tuiFields := make([]detailField, 0, len(detailSummaries))
			tuiSectionStart := len(rows)
			for i, summary := range detailSummaries {
				st := summary
				rowHits = append(rowHits, modalRowHit{
					id:     "metrics:tui-latency:" + st.Key,
					start:  metricsFieldRowStart(tuiSectionStart) + i,
					height: 1,
					action: func(app *App) tea.Cmd {
						app.openMetricsTUILatencyDetail(st)
						return nil
					},
				})
				tuiFields = append(tuiFields, detailField{
					truncate(tuiInteractionDisplayTitle(st), 32),
					tuiInteractionOperatorText(st),
				})
			}
			rows = appendDetailSection(rows, "TUI interaction details", tuiFields...)
		}

		// Latencies — show top 6 routes by p95 so the modal stays compact.
		// Backends running an older contract might omit this field; render
		// nothing in that case rather than an empty section.
		if len(m.Latencies) > 0 {
			latencyFields := make([]detailField, 0, 6)
			latencySectionStart := len(rows)
			for i, pat := range topLatencyRoutes(m.Latencies, 6) {
				route := pat
				st := m.Latencies[pat]
				rowHits = append(rowHits, modalRowHit{
					id:     "metrics:latency:" + route,
					start:  metricsFieldRowStart(latencySectionStart) + i,
					height: 1,
					action: func(app *App) tea.Cmd {
						app.openMetricsLatencyDetail(route, st)
						return nil
					},
				})
				latencyFields = append(latencyFields, detailField{
					truncate(metricsOperationLabel(pat), 32),
					metricsLatencyOperatorText(st),
				})
			}
			rows = appendDetailSection(rows, "Latency watchlist", latencyFields...)
		}
	}

	footerHint := scrollableModalRowDetailFooter("Up/Down scroll  r refresh  Esc close", rowHits)
	content := lipgloss.JoinVertical(lipgloss.Left, rows...)
	pageSize := compactModalBodyRows(content, a.metricsBodyPageSize(), 8)
	hintStyle := t.HintLabel
	rendered := a.renderScrollableModalFrame(scrollableModalFrameOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   "Operations Metrics",
			buttons: buttons,
		},
		content:     content,
		pageSize:    pageSize,
		scroll:      a.metricsScroll(),
		wheelID:     "metrics",
		footerHint:  footerHint,
		footerStyle: &hintStyle,
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			if app.metrics != nil {
				app.metrics.scroll = moveScrollOffsetByWheel(app.metrics.scroll, button)
			}
			return nil
		},
		scrollTo: func(app *App, scroll int) tea.Cmd {
			if app.metrics != nil {
				app.metrics.scroll = scroll
			}
			return nil
		},
	})
	if a.metrics != nil {
		a.metrics.scroll = rendered.window.scroll
	}
	a.registerScrollableModalRowHits(rendered.modalFrameRender, rendered.window, rowHits)
	return rendered.modal
}

func (a *App) metricsBodyPageSize() int {
	rows := a.height - 14
	if rows < 4 {
		rows = 4
	}
	return rows
}

func (a *App) metricsScroll() int {
	if a.metrics != nil {
		return a.metrics.scroll
	}
	return 0
}

func metricsFieldRowStart(sectionStart int) int {
	if sectionStart > 0 {
		return sectionStart + 2
	}
	return sectionStart + 1
}

func (a *App) openMetricsCostDetail(provider string, amount float64) {
	rows := appendDetailSection(nil, "Provider cost",
		detailField{"provider", provider},
		detailField{"cost", fmt.Sprintf("$%.4f", amount)},
	)
	if a.metrics != nil {
		total := a.metrics.data.Cost.TotalUSD
		if total > 0 {
			rows = append(rows, detailFieldRows("share", fmt.Sprintf("%.1f%%", amount/total*100))...)
		}
		rows = appendDetailSection(rows, "CLIO totals",
			detailField{"total cost", fmt.Sprintf("$%.4f", total)},
		)
	}
	a.detailView = &bulkyPartRef{
		messageID: "metrics",
		partID:    "cost:" + provider,
		title:     "Metrics · " + provider,
		fullText:  strings.Join(rows, "\n"),
	}
	a.detailViewOpen = true
	a.detailScroll = 0
}

func (a *App) openMetricsLatencyDetail(route string, stat gact.MetricsLatencyStat) {
	rows := appendDetailSection(nil, "CLIO latency",
		detailField{"operation", metricsOperationLabel(route)},
		detailField{"api route", route},
		detailField{"count", fmt.Sprintf("%d", stat.Count)},
		detailField{"p50 latency", fmt.Sprintf("%.1f ms", stat.P50Ms)},
		detailField{"p95 latency", fmt.Sprintf("%.1f ms", stat.P95Ms)},
		detailField{"max latency", fmt.Sprintf("%.1f ms", stat.MaxMs)},
	)
	a.detailView = &bulkyPartRef{
		messageID: "metrics",
		partID:    "latency:" + route,
		title:     "API latency · " + route,
		fullText:  strings.Join(rows, "\n"),
	}
	a.detailViewOpen = true
	a.detailScroll = 0
}

func (a *App) openMetricsTUILatencyDetail(stat tuiInteractionSummary) {
	rows := appendDetailSection(nil, "TUI interaction latency",
		detailField{"surface", stat.Surface},
		detailField{"input", stat.Kind},
		detailField{"samples", fmt.Sprintf("%d", stat.Count)},
		detailField{"total p50", formatTUIDuration(stat.TotalP50)},
		detailField{"total p95", formatTUIDuration(stat.TotalP95)},
		detailField{"total max", formatTUIDuration(stat.TotalMax)},
		detailField{"update p50", formatTUIDuration(stat.UpdateP50)},
		detailField{"update p95", formatTUIDuration(stat.UpdateP95)},
		detailField{"render p50", formatTUIDuration(stat.RenderP50)},
		detailField{"render p95", formatTUIDuration(stat.RenderP95)},
	)
	if stat.TargetLabel != "" {
		rows = appendDetailSection(rows, "Target",
			detailField{"label", stat.TargetLabel},
		)
	}
	if stat.Target != "" {
		rows = appendDetailSection(rows, "Evidence",
			detailField{"last hit target", stat.Target},
		)
	}
	a.detailView = &bulkyPartRef{
		messageID: "metrics",
		partID:    "tui-latency:" + stat.Key,
		title:     "TUI latency · " + stat.Surface,
		fullText:  strings.Join(rows, "\n"),
	}
	a.detailViewOpen = true
	a.detailScroll = 0
}

func (a *App) openMetricsTUILatencySectionDetail(stat tuiInteractionLatencySection) {
	rows := appendDetailSection(nil, "TUI latency by section",
		detailField{"surface", stat.Surface},
		detailField{"samples", fmt.Sprintf("%d", stat.SampleCount)},
		detailField{"clicks", fmt.Sprintf("%d", stat.ClickCount)},
		detailField{"wheels", fmt.Sprintf("%d", stat.WheelCount)},
		detailField{"keys", fmt.Sprintf("%d", stat.KeyCount)},
		detailField{"slowest p95", formatTUIDuration(time.Duration(stat.SlowestP95MS * float64(time.Millisecond)))},
		detailField{"slowest max", formatTUIDuration(time.Duration(stat.SlowestMaxMS * float64(time.Millisecond)))},
		detailField{"slowest render", formatTUIDuration(time.Duration(stat.SlowestRender * float64(time.Millisecond)))},
	)
	if len(stat.TargetLabels) > 0 {
		rows = appendDetailSection(rows, "Targets",
			detailField{"labels", strings.Join(stat.TargetLabels, ", ")},
		)
	}
	a.detailView = &bulkyPartRef{
		messageID: "metrics",
		partID:    "tui-section-latency:" + stat.Surface,
		title:     "TUI section latency · " + stat.Surface,
		fullText:  strings.Join(rows, "\n"),
	}
	a.detailViewOpen = true
	a.detailScroll = 0
}

func (a *App) metricsSlowestTUIInteractionText() string {
	summaries := a.tuiInteractionSummaries(1)
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
