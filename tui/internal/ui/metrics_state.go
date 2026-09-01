package ui

// metricsComponent + metricsState: the metrics snapshot overlay.

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// metricsState is what the Metrics modal shows. Loaded fresh every time
// the modal opens; not auto-refreshed (snapshot semantics: call again
// to refresh).
type metricsState struct {
	loading bool
	err     error
	data    gact.Metrics
	scroll  int
}

// metricsComponent owns the Operations Metrics overlay: its open flag, the
// backing snapshot (embedded metricsState, so callers keep reading
// c.data/c.loading/c.scroll directly), the per-interaction TUI latency
// telemetry that the modal surfaces, and a back-reference to the root App for
// shared services (client, theme, modal chrome, cross-domain detail view).
//
// It replaces the old appOverlayState pair (metricsOpen bool + metrics
// *metricsState): open==false with a zero metricsState is the closed/unloaded
// state, so the former nil-pointer checks collapse into the open flag.
type metricsComponent struct {
	app  *App
	open bool
	metricsState

	// TUI interaction latency telemetry. Updated on the hot path (every
	// Update/View cycle via beginInteractionTrace/finish*); surfaced by the
	// metrics modal and the optional latency report.
	tuiLatency            tuiInteractionTelemetry
	pendingTUIInteraction *tuiInteractionTrace
}

// openLoad opens the modal in its loading state, clearing any stale snapshot,
// and returns the fetch command. Telemetry (tuiLatency/pendingTUIInteraction)
// is preserved across opens. Used by /metrics, Ctrl+T, the header chips, and
// the r-refresh key.
func (c *metricsComponent) openLoad() tea.Cmd {
	c.open = true
	c.metricsState = metricsState{loading: true}
	return loadMetricsCmd(c.app.c)
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

func (c *metricsComponent) handleLoaded(m metricsLoadedMsg) (tea.Model, tea.Cmd) {
	c.loading = false
	c.err = m.err
	c.data = m.data
	return c.app, nil
}

// handleKey routes keys while the Metrics modal is open. Modal is
// read-only: Esc/Ctrl+T close, anything else is swallowed.
func (c *metricsComponent) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+t":
		c.open = false
		return c.app, nil
	case "r":
		return c.app, c.openLoad()
	}
	if off, ok := applyScrollKey(c.scroll, c.bodyPageSize(), k); ok {
		c.scroll = off
	}
	return c.app, nil
}

func (c *metricsComponent) bodyPageSize() int {
	rows := c.app.height - 14
	if rows < 4 {
		rows = 4
	}
	return rows
}

func (c *metricsComponent) scrollPos() int {
	return c.scroll
}
