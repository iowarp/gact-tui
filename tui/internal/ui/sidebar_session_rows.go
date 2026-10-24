package ui

// sidebar_session_rows.go computes per-session sidebar row counts and summary/activation text.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func (c *sidebarComponent) sessionRowCount(sessionIndex int) int {
	if sessionIndex < 0 || sessionIndex >= len(c.app.session.sessions) {
		return 0
	}
	s := c.app.session.sessions[sessionIndex]
	if isChildSession(s) {
		return 1
	}
	rows := 2
	if c.sessionSummaryText(sessionIndex) != "" {
		rows++
	}
	if c.sessionAgentRef(sessionIndex) != "" {
		rows++
	}
	if !c.showChildSessions && c.childSessionCount(s.ID) > 0 {
		rows++
	}
	return rows
}

func (c *sidebarComponent) sessionSummaryText(sessionIndex int) string {
	if sessionIndex < 0 || sessionIndex >= len(c.app.session.sessions) || sessionIndex != c.app.session.selected {
		return ""
	}
	s := c.app.session.sessions[sessionIndex]
	if isChildSession(s) {
		return ""
	}
	return strings.TrimSpace(strings.Join(strings.Fields(s.Summary), " "))
}

// sessionAgentRef is the agent the selected root session runs (its pinned `agent_ref`).
func (c *sidebarComponent) sessionAgentRef(sessionIndex int) string {
	if sessionIndex < 0 || sessionIndex >= len(c.app.session.sessions) || sessionIndex != c.app.session.selected {
		return ""
	}
	s := c.app.session.sessions[sessionIndex]
	if isChildSession(s) {
		return ""
	}
	return strings.TrimSpace(valuefmt.StringValue(valuefmt.MapValue(s.Metadata)["agent_ref"]))
}

func (c *sidebarComponent) sessionActivationText(sessionIndex int, budget int) string {
	ref := c.sessionAgentRef(sessionIndex)
	if ref == "" || budget < 3 {
		return ""
	}
	return textutil.Truncate("agent "+ref, budget)
}
