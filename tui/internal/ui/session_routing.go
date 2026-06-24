package ui

// sessionComponent routing + summarization commands: the /mode routing cycle
// and the /summarize (compact) flow, including their backend PATCH/POST cmds.

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

// currentRoutingMode reads the active session's routing_mode field, falling
// back to "auto" when unset or no session is selected. Used by the /mode
// cycle so each invocation moves to the next mode in sequence.
func (c *sessionComponent) currentRoutingMode() string {
	if c.selected < 0 || c.selected >= len(c.sessions) {
		return "auto"
	}
	mode := c.sessions[c.selected].RoutingMode
	if mode == "" {
		return "auto"
	}
	return mode
}

// nextRoutingMode rotates auto → chat → experts → auto. Three states is
// enough that a quick cycle reaches the desired one without modal UI.
func nextRoutingMode(cur string) string {
	switch cur {
	case "auto":
		return "chat"
	case "chat":
		return "experts"
	default:
		return "auto"
	}
}

// patchRoutingModeCmd PATCHes /v1/sessions/{id} with the new routing_mode.
// On success the backend publishes session.updated which the SSE handler
// already mirrors back into a.session.sessions.
func patchRoutingModeCmd(c *client.Client, sessionID, mode string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, err := c.PatchSession(ctx, sessionID, client.PatchSessionRequest{
			RoutingMode: &mode,
		})
		if err != nil {
			return errMsg{err: err, stage: "patch-routing-mode"}
		}
		return nil
	}
}

// requestCompactCmd asks the backend to summarize the current session.
// CLIO's current GACT surface is /summarize; older /compact wiring was
// provisional and would truthfully fail on current CLIO.
func requestCompactCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		if err := c.SummarizeSession(ctx, sessionID, true, ""); err != nil {
			return sessionSummarizedMsg{sessionID: sessionID, err: err}
		}
		session, err := c.GetSession(ctx, sessionID)
		if err != nil {
			return sessionSummarizedMsg{sessionID: sessionID, err: err}
		}
		return sessionSummarizedMsg{sessionID: sessionID, session: session}
	}
}

type sessionSummarizedMsg struct {
	sessionID string
	session   gact.Session
	err       error
}

func (c *sessionComponent) handleSummarized(m sessionSummarizedMsg) (tea.Model, tea.Cmd) {
	if m.err != nil {
		c.app.setHint("summary failed: " + m.err.Error())
		return c.app, scheduleHintExpire(c.app.transientHint)
	}
	if idx := c.indexByID(m.sessionID); idx >= 0 {
		c.sessions[idx] = m.session
		c.sortByActivity()
		if selected := c.indexByID(m.sessionID); selected >= 0 {
			c.selected = selected
		}
	}
	summary := strings.TrimSpace(m.session.Summary)
	if summary == "" {
		c.app.setHint("summary completed")
	} else {
		c.app.setHint("summary: " + textutil.Truncate(strings.Join(strings.Fields(summary), " "), 120))
	}
	return c.app, tea.Batch(scheduleHintExpire(c.app.transientHint), reloadSessionsCmd(c.app.c, c.wsID))
}
