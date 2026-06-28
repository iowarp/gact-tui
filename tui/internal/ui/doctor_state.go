package ui

// doctorComponent + doctorState: the /doctor system-readiness overlay and its backing data.

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// doctorState holds the modal's backing data and loading flag.
type doctorState struct {
	loading bool
	err     error
	health  gact.HealthResponse
	caps    gact.Capabilities
	gaps    map[string]gact.CapabilityGap
	tab     doctorTab
	scroll  int
}

// doctorComponent owns the /doctor overlay: its open flag, its backing data
// (embedded doctorState, so callers keep reading d.health/d.tab/… directly),
// and a back-reference to the root App for shared services (client, theme,
// modal chrome). It replaces the old appOverlayState pair (doctorOpen bool +
// doctor *doctorState) — open==false is the closed/unloaded state, so the
// former nil-pointer checks become !d.open.
type doctorComponent struct {
	app  *App
	open bool
	doctorState
}

// reset closes the overlay and clears its data, keeping the app back-ref.
func (d *doctorComponent) reset() { *d = doctorComponent{app: d.app} }

// openWith opens the overlay in its loading state on the given tab and returns
// the fetch command. Used by /doctor, the header chip, and the r-refresh key.
func (d *doctorComponent) openModal(tab doctorTab) tea.Cmd {
	d.reset()
	d.open = true
	d.loading = true
	d.tab = tab
	return doctorFetchCmd(d.app.c)
}

// doctorTab switches between integrations health, capability scorecard, and gaps.
type doctorTab int

const (
	doctorTabHealth doctorTab = iota
	doctorTabCapabilities
	doctorTabGaps
)

// doctorFetchedMsg carries a completed /v1/health + /v1/capabilities fetch.
type doctorFetchedMsg struct {
	health gact.HealthResponse
	caps   gact.Capabilities
	gaps   map[string]gact.CapabilityGap
	err    error
}

func (d *doctorComponent) handleFetched(m doctorFetchedMsg) (tea.Model, tea.Cmd) {
	// The modal may have been dismissed during the fetch. Drop stale
	// responses so re-open does not flash old data.
	if d.open {
		d.loading = false
		d.err = m.err
		d.health = m.health
		d.caps = m.caps
		d.gaps = m.gaps
	}
	return d.app, nil
}

// doctorFetchCmd fires GET /v1/health + /v1/capabilities in parallel.
// Short timeout; both endpoints are supposed to be fast probe-level calls.
func doctorFetchCmd(c *client.Client) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		h, herr := c.Health(ctx)
		if herr != nil {
			return doctorFetchedMsg{health: h, err: herr}
		}
		caps, cerr := c.Capabilities(ctx)
		gaps, _ := c.CapabilityGaps(ctx)
		return doctorFetchedMsg{health: h, caps: caps, gaps: gaps, err: cerr}
	}
}
