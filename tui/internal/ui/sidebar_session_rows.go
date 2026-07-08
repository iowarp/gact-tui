package ui

// sidebar_session_rows.go computes per-session sidebar row counts and summary/activation text.

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"strings"
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
	if c.sessionActiveBlueprintID(sessionIndex) != "" {
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

func (c *sidebarComponent) sessionActiveBlueprintID(sessionIndex int) string {
	if sessionIndex < 0 || sessionIndex >= len(c.app.session.sessions) || sessionIndex != c.app.session.selected {
		return ""
	}
	s := c.app.session.sessions[sessionIndex]
	if isChildSession(s) {
		return ""
	}
	meta := valuefmt.MapValue(s.Metadata)
	blueprintID := valuefmt.FirstNonEmpty(
		valuefmt.StringValue(meta["active_agent_blueprint_id"]),
		valuefmt.StringValue(meta["agent_blueprint_id"]),
	)
	if blueprintID == "" {
		return ""
	}
	return blueprintID
}

func (c *sidebarComponent) sessionActivationText(sessionIndex int, budget int) string {
	blueprintID := c.sessionActiveBlueprintID(sessionIndex)
	if blueprintID == "" {
		return ""
	}
	meta := valuefmt.MapValue(c.app.session.sessions[sessionIndex].Metadata)
	scope := valuefmt.StringValue(meta["active_agent_blueprint_scope"])
	return activeAgentBlueprintIndicator(blueprintID, scope, budget)
}
