package ui

// context_view.go is the dedicated per-expert Context usage overlay: an expert
// selector, the Claude /context-style segmented bar + legend + header, and a
// "Compact now" action that POSTs context/compact and refreshes. It reuses the
// shared segmented-bar renderer (context_bar.go) that the memory inspector and
// the footer indicator also draw.

import (
	"context"
	"fmt"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

// contextExpert is one selectable lane in the Context overlay. ID is the scope
// passed to GetContextState/CompactContext; "" is the session default lane.
type contextExpert struct {
	id    string
	title string
}

// contextViewComponent owns the dedicated Context overlay: its open flag, the
// expert selector (built from the agent hierarchy), the currently-loaded
// per-scope ContextState, loading/error flags, and a back-reference to the App.
type contextViewComponent struct {
	app *App

	open    bool
	loading bool
	err     error
	state   client.ContextState

	experts  []contextExpert
	selected int // index into experts

	// notice surfaces the result of a compact attempt (success or the typed
	// error envelope) until the next load.
	notice string
}

// openModal opens the overlay, (re)builds the expert list from the current agent
// hierarchy, seeds the selection to the active expert, and fires the first load.
func (c *contextViewComponent) openModal() tea.Cmd {
	c.open = true
	c.err = nil
	c.notice = ""
	c.rebuildExperts()
	return c.loadCmd()
}

// rebuildExperts derives the selectable lanes from the agent hierarchy. The
// session-default lane is always first; each visible expert follows. The
// selection defaults to the pinned next-turn expert when set, else stays put.
func (c *contextViewComponent) rebuildExperts() {
	experts := []contextExpert{{id: "", title: "session (default)"}}
	for _, row := range c.app.agent.visibleAgentHierarchyRows() {
		title := valuefmt.FirstNonEmpty(row.agent.Title, row.agent.ID)
		experts = append(experts, contextExpert{id: row.agent.ID, title: title})
	}
	c.experts = experts
	// Seed selection: prefer the pinned next-turn expert so the overlay opens
	// on the lane the user is about to route to.
	if pinned := c.app.agent.nextTurnAgentID; pinned != "" {
		for i, e := range experts {
			if e.id == pinned {
				c.selected = i
				break
			}
		}
	}
	c.clampSelection()
}

func (c *contextViewComponent) clampSelection() {
	if c.selected < 0 {
		c.selected = 0
	}
	if c.selected >= len(c.experts) {
		c.selected = len(c.experts) - 1
	}
	if c.selected < 0 {
		c.selected = 0
	}
}

func (c *contextViewComponent) currentScope() string {
	c.clampSelection()
	if c.selected >= 0 && c.selected < len(c.experts) {
		return c.experts[c.selected].id
	}
	return ""
}

func (c *contextViewComponent) currentExpertTitle() string {
	c.clampSelection()
	if c.selected >= 0 && c.selected < len(c.experts) {
		return c.experts[c.selected].title
	}
	return "session (default)"
}

// contextStateLoadedMsg carries a GET context/state (or post-compact) response.
type contextStateLoadedMsg struct {
	scope  string
	state  client.ContextState
	err    error
	notice string // set on a successful compact
}

// loadCmd fires GET /v1/sessions/{id}/context/state for the selected scope.
func (c *contextViewComponent) loadCmd() tea.Cmd {
	c.loading = true
	scope := c.app.session.runtimeScope()
	scope.Scope = c.currentScope()
	cl := c.app.c
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		state, err := cl.GetContextStateScoped(ctx, scope)
		return contextStateLoadedMsg{scope: scope.Scope, state: state, err: err}
	}
}

// compactCmd fires POST /v1/sessions/{id}/context/compact for the selected scope
// and returns the post-compaction state. The typed error envelopes surface as a
// notice rather than a fatal error so the overlay stays open.
func (c *contextViewComponent) compactCmd() tea.Cmd {
	c.loading = true
	c.notice = ""
	scope := c.app.session.runtimeScope()
	scope.Scope = c.currentScope()
	cl := c.app.c
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		state, err := cl.CompactContextScoped(ctx, scope)
		if err != nil {
			return contextStateLoadedMsg{scope: scope.Scope, err: err, notice: compactErrorNotice(err)}
		}
		return contextStateLoadedMsg{scope: scope.Scope, state: state, notice: "compacted: working set summarized"}
	}
}

// compactErrorNotice maps the typed compact error envelopes to a friendly line.
func compactErrorNotice(err error) string {
	code := ""
	if e, ok := err.(*client.Error); ok {
		code = e.Code
	}
	switch code {
	case "nothing_to_compact":
		return "nothing to compact (no live segments)"
	case "compaction_unavailable":
		return "compaction unavailable (no LM bound or summary failed)"
	case "session_not_found":
		return "session not found"
	default:
		return "compact failed: " + err.Error()
	}
}

// footerContextStateMsg carries the active-expert context state for the footer
// mini-indicator. Distinct from contextStateLoadedMsg so the footer fetch never
// disturbs an open Context overlay's selected-scope load.
type footerContextStateMsg struct {
	state client.ContextState
	err   error
}

// footerContextStateCmd fetches the active-expert (pinned next-turn expert, else
// session default) context state for the footer indicator. Best-effort: errors
// (including 501 on backends without the capability) leave the cache untouched.
func footerContextStateCmd(c *client.Client, scope client.RuntimeScope, expertID string) tea.Cmd {
	scope.Scope = expertID
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		defer cancel()
		state, err := c.GetContextStateScoped(ctx, scope)
		return footerContextStateMsg{state: state, err: err}
	}
}

func (c *contextViewComponent) handleFooterState(m footerContextStateMsg) (tea.Model, tea.Cmd) {
	if m.err == nil {
		state := m.state
		c.app.session.footerContext = &state
	}
	return c.app, nil
}

func (c *contextViewComponent) handleLoaded(m contextStateLoadedMsg) (tea.Model, tea.Cmd) {
	if !c.open {
		return c.app, nil
	}
	c.loading = false
	c.err = m.err
	if m.err == nil {
		c.state = m.state
	}
	if m.notice != "" {
		c.notice = m.notice
	}
	return c.app, nil
}

// handleKey drives the overlay: Up/Down (or j/k, left/right) switch experts and
// reload; c compacts; r refreshes; Esc/Ctrl+C/q close.
func (c *contextViewComponent) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c", "q", "Q":
		c.open = false
		return c.app, nil
	case "up", "k", "left", "h":
		if c.selected > 0 {
			c.selected--
			c.notice = ""
			return c.app, c.loadCmd()
		}
		return c.app, nil
	case "down", "j", "right", "l":
		if c.selected < len(c.experts)-1 {
			c.selected++
			c.notice = ""
			return c.app, c.loadCmd()
		}
		return c.app, nil
	case "c", "C":
		return c.app, c.compactCmd()
	case "r", "R":
		c.notice = ""
		return c.app, c.loadCmd()
	}
	return c.app, nil
}

// view renders the overlay: header (used/window + %), the expert selector, the
// segmented bar with the autocompact marker, and the legend.
func (c *contextViewComponent) view() string {
	if !c.open {
		return ""
	}
	t := c.app.Theme
	w := c.app.modals.modalWidth()
	innerW := modalInnerWidth(w)

	buttons := []menuButton{
		{
			id:       "context:compact",
			label:    "Compact now",
			disabled: c.app.session.currentID() == "",
			action: func(app *App) tea.Cmd {
				return app.contextView.compactCmd()
			},
		},
		{
			id:    "context:refresh",
			label: "refresh",
			action: func(app *App) tea.Cmd {
				return app.contextView.loadCmd()
			},
		},
		closeMenuButton("context:close", func(app *App) { app.contextView.open = false }),
	}

	rows := c.bodyRows(innerW)
	content := lipgloss.JoinVertical(lipgloss.Left, rows...)
	hintStyle := t.HintLabel
	rendered := c.app.modals.renderScrollableModalFrame(scrollableModalFrameOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   "Context Usage",
			buttons: buttons,
		},
		content:     content,
		pageSize:    compactModalBodyRows(content, c.app.modals.modalBodyRows(16), 8),
		scroll:      0,
		wheelID:     "context",
		footerHint:  "↑/↓ expert  c compact  r refresh  Esc close",
		footerStyle: &hintStyle,
		scrollTo:    func(app *App, scroll int) tea.Cmd { return nil },
	})
	return rendered.modal
}

// bodyRows builds the overlay body: selector, header, bar, legend, and notices.
func (c *contextViewComponent) bodyRows(innerW int) []string {
	t := c.app.Theme
	var rows []string

	// Expert selector.
	rows = append(rows, lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render("Expert"))
	for i, e := range c.experts {
		marker := "  "
		style := lipgloss.NewStyle().Foreground(t.FgMuted)
		if i == c.selected {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
			style = lipgloss.NewStyle().Foreground(t.Fg).Bold(true)
		}
		rows = append(rows, marker+style.Render(e.title))
	}
	rows = append(rows, "")

	if c.app.session.currentID() == "" {
		rows = append(rows, t.HintLabel.Render("no active session"))
		return rows
	}
	if c.loading {
		rows = append(rows, t.HintLabel.Render("loading context state…"))
		return rows
	}
	if c.err != nil {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Danger).Render("error: "+c.err.Error()))
		if c.notice != "" {
			rows = append(rows, lipgloss.NewStyle().Foreground(t.Warning).Render(c.notice))
		}
		return rows
	}

	// Header line: used / window + %.
	rows = append(rows, lipgloss.NewStyle().Bold(true).Foreground(t.Fg).Render(contextHeaderText(c.state)))

	// Segmented bar + autocompact marker.
	segs := orderedContextCategories(c.state.Categories)
	total := contextCategoryTotal(c.state.Categories)
	if len(segs) == 0 {
		rows = append(rows, t.HintLabel.Render("(no attributed context yet)"))
	} else {
		barW := innerW
		if barW > 60 {
			barW = 60
		}
		if barW < 10 {
			barW = 10
		}
		denom := contextBarDenominator(c.state, total)
		rows = append(rows, renderContextBar(t, barW, segs, denom, c.state.AutocompactPct))
		if c.state.AutocompactPct != nil {
			rows = append(rows, t.HintLabel.Render(autocompactMarkerLegend(*c.state.AutocompactPct)))
		}
		rows = append(rows, "")
		rows = append(rows, lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render("Categories"))
		rows = append(rows, renderContextLegend(t, segs, total)...)
	}

	if c.notice != "" {
		rows = append(rows, "")
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Secondary).Render(c.notice))
	}
	return rows
}

// autocompactMarkerLegend describes the danger-coloured ┃ marker on the bar.
func autocompactMarkerLegend(pct float64) string {
	return fmt.Sprintf("┃ auto-compaction at %.0f%%", pct*100)
}
