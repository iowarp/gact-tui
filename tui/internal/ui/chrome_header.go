package ui

// chrome_header.go renders the chrome header bar and registers its chip hit regions.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/charmbracelet/x/ansi"
)

func (c *chromeComponent) renderHeader() string {
	return c.renderHeaderForWidth(c.app.width)
}

func (c *chromeComponent) renderHeaderForWidth(width int) string {
	t := c.app.Theme
	// Required parts (badge + connection label + SSE health dot) always render.
	// Optional parts (workspace + session + status) are dropped when
	// there's no room.
	actions := c.headerActions()
	actionBar := c.renderHeaderActionBar(actions)
	actionW := lipgloss.Width(ansi.Strip(actionBar))
	badge := t.HeaderTitle.Render(" GACT ")
	dot := t.Header.Render(" " + c.app.connection.sseHealthDot() + " ")
	backendLabel := c.headerBackendLabel()
	backend := t.Header.Render(backendLabel)
	required := lipgloss.JoinHorizontal(lipgloss.Top, badge, dot, backend)
	if width < 1 {
		width = c.app.width
	}
	avail := width - lipgloss.Width(required) - actionW

	optional := []headerChip{}
	if workspaceName := c.headerWorkspaceLabel(); workspaceName != "" {
		optional = append(optional, headerChip{
			id: "workspace",
			label: c.app.localizer.t(msgChromeWorkspace,
				map[string]string{"value": workspaceName}),
			action: func(app *App) tea.Cmd {
				app.chrome.openWorkspaceSwitch()
				return nil
			},
		})
	}
	if c.app.session.selected >= 0 && c.app.session.selected < len(c.app.session.sessions) {
		s := c.app.session.sessions[c.app.session.selected]
		optional = append(optional, headerChip{
			id: "session",
			label: c.app.localizer.t(msgChromeSession,
				map[string]string{"value": s.Title}),
			action: func(app *App) tea.Cmd {
				app.focus = FocusSidebar
				app.sidebar.sectionFocus = sidebarSectionSessions
				app.sidebar.sectionCursor = false
				app.session.ensureSelectedVisible()
				return nil
			},
		})
		if model := c.headerModelLabel(s); model != "" {
			optional = append(optional, headerChip{
				id: "model",
				label: c.app.localizer.t(msgChromeModel,
					map[string]string{"value": model}),
				action: func(app *App) tea.Cmd {
					return app.settings.openTab(0)
				},
			})
		}
		if agent := c.headerAgentLabel(s.Agent); agent != "" {
			optional = append(optional, headerChip{
				id:    "agent",
				label: agent,
				action: func(app *App) tea.Cmd {
					return app.settings.openTab(1)
				},
			})
		}
		if routing := c.headerRoutingLabel(s); routing != "" {
			optional = append(optional, headerChip{
				id:    "routing",
				label: routing,
				action: func(app *App) tea.Cmd {
					return app.settings.openTab(0)
				},
			})
		}
	}
	statusBadge := ""
	var statusAction uiHitAction
	if c.app.session.currentStatus != "" {
		statusBadge = t.StatusBadge.Render(c.app.session.currentStatus)
		avail -= lipgloss.Width(statusBadge)
		statusAction = func(app *App) tea.Cmd {
			if app.session.caps.Capabilities.IntegrationHealth {
				return app.doctor.openModal(doctorTabHealth)
			}
			return app.metrics.openLoad()
		}
	}
	// DDDDDDDD1: detached-count chip — always-visible reminder that
	// the user has Ctrl+Z-walked-away sessions on this backend that
	// they can `gact attach` (or pick from the sidebar's ↩ rows).
	// Hidden when the count is 0 to avoid noise on a fresh install.
	detachChip := ""
	if n := len(c.app.previouslyDetached); n > 0 {
		// Style mirrors StatusBadge so the two chips read as a pair
		// without needing a new palette field. Foreground is Bg
		// (so the glyph reads on the bg-coloured chip), bg is the
		// secondary accent so it picks up the theme.
		detachChip = lipgloss.NewStyle().
			Foreground(t.Bg).Background(t.Secondary).
			Padding(0, 1).Bold(true).
			Render(fmt.Sprintf("↩ %d", n))
		avail -= lipgloss.Width(detachChip)
	}

	rendered := []string{badge, dot, backend}
	hits := []headerChip{{
		id:       "backend",
		rendered: backend,
		action: func(app *App) tea.Cmd {
			return app.metrics.openLoad()
		},
	}}
	for _, opt := range optional {
		styled := t.Header.Render(textutil.Truncate(opt.label, avail-2))
		w := lipgloss.Width(styled)
		if w > avail {
			break
		}
		opt.rendered = styled
		rendered = append(rendered, styled)
		hits = append(hits, opt)
		avail -= w
	}
	if detachChip != "" {
		rendered = append(rendered, detachChip)
	}
	if statusBadge != "" {
		rendered = append(rendered, statusBadge)
		hits = append(hits, headerChip{id: "status", rendered: statusBadge, action: statusAction})
	}

	line := lipgloss.JoinHorizontal(lipgloss.Top, rendered...)
	pad := width - lipgloss.Width(line) - actionW
	if pad < 0 {
		pad = 0
	}
	bg := lipgloss.NewStyle().Background(t.BgSubtle).Render(strings.Repeat(" ", pad))
	header := line + bg + actionBar
	c.registerHeaderChipHits(rendered, hits)
	c.registerHeaderActionHits(lipgloss.Width(line)+pad, actions, actionW)
	return header
}

type headerChip struct {
	id       string
	label    string
	rendered string
	action   uiHitAction
}

func (c *chromeComponent) registerHeaderChipHits(rendered []string, hits []headerChip) {
	if c.app.height <= 0 || len(rendered) == 0 || len(hits) == 0 {
		return
	}
	col := 0
	hitIdx := 0
	for _, segment := range rendered {
		w := lipgloss.Width(segment)
		if hitIdx < len(hits) && segment == hits[hitIdx].rendered && hits[hitIdx].action != nil {
			plain := ansi.Strip(segment)
			c.app.interaction.registerScreenTextSpanHit("header:chip:"+hits[hitIdx].id, col, 0, plain, 0, plain, hits[hitIdx].action)
			hitIdx++
		}
		col += w
	}
}
