package ui

import (
	"context"
	"fmt"
	"sort"
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
	switch {
	case a.metrics.err != nil:
		rows = append(rows,
			lipgloss.NewStyle().Foreground(t.Danger).Render("Error: "+a.metrics.err.Error()))
	case a.metrics.loading:
		rows = append(rows, t.HintLabel.Render("loading…"))
	default:
		m := a.metrics.data
		rows = appendDetailSection(rows, "Overview",
			detailField{"uptime", fmt.Sprintf("%ds", m.UptimeS)},
		)
		sessionFields := []detailField{
			{"total", fmt.Sprintf("%d", m.Sessions.Total)},
			{"active", fmt.Sprintf("%d", m.Sessions.Active)},
		}
		for _, name := range sortedKeys(m.Sessions.ByStatus) {
			sessionFields = append(sessionFields, detailField{name, fmt.Sprintf("%d", m.Sessions.ByStatus[name])})
		}
		rows = appendDetailSection(rows, "Sessions", sessionFields...)

		messageFields := []detailField{
			{"total", fmt.Sprintf("%d", m.Messages.Total)},
		}
		for _, name := range sortedKeys(m.Messages.ByRole) {
			messageFields = append(messageFields, detailField{name, fmt.Sprintf("%d", m.Messages.ByRole[name])})
		}
		rows = appendDetailSection(rows, "Messages", messageFields...)

		rows = appendDetailSection(rows, "Tokens",
			detailField{"input", fmt.Sprintf("%d", m.Tokens.InputTotal)},
			detailField{"output", fmt.Sprintf("%d", m.Tokens.OutputTotal)},
			detailField{"cache_read", fmt.Sprintf("%d", m.Tokens.CacheReadTotal)},
			detailField{"cache_write", fmt.Sprintf("%d", m.Tokens.CacheWriteTotal)},
		)

		costFields := []detailField{
			{"total", fmt.Sprintf("$%.4f", m.Cost.TotalUSD)},
		}
		for _, name := range sortedFloatKeys(m.Cost.ByProvider) {
			costFields = append(costFields, detailField{name, fmt.Sprintf("$%.4f", m.Cost.ByProvider[name])})
		}
		rows = appendDetailSection(rows, "Cost", costFields...)

		// Latencies — show top 6 routes by p95 so the modal stays compact.
		// Backends running an older contract might omit this field; render
		// nothing in that case rather than an empty section.
		if len(m.Latencies) > 0 {
			latencyFields := make([]detailField, 0, 6)
			for _, pat := range topLatencyRoutes(m.Latencies, 6) {
				st := m.Latencies[pat]
				latencyFields = append(latencyFields, detailField{
					truncate(pat, 32),
					fmt.Sprintf("p50 %.1f / p95 %.1f / max %.1f (n=%d)",
						st.P50Ms, st.P95Ms, st.MaxMs, st.Count),
				})
			}
			rows = appendDetailSection(rows, "Latencies (top 6 by p95, ms)", latencyFields...)
		}
	}

	windowed := windowModalBody(lipgloss.JoinVertical(lipgloss.Left, rows...), a.metricsBodyPageSize(), a.metricsScroll())
	if a.metrics != nil {
		a.metrics.scroll = windowed.window.scroll
	}
	return a.renderModalFrame(modalFrameOptions{
		width:   w,
		title:   "Backend Metrics",
		buttons: buttons,
		body:    windowed.body,
		footer:  t.HintLabel.Render(modalRangeHint(windowed.window, "Up/Down scroll  r refresh  Esc close")),
	})
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

func sortedKeys(m map[string]int) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
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
