package ui

// sidebar_session_helpers.go provides sidebar session helpers (child sessions, tool counts, summary detail).

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func isChildSession(s gact.Session) bool {
	return s.ParentSessionID != ""
}

func (c *sidebarComponent) childSessionCount(parentID string) int {
	if parentID == "" {
		return 0
	}
	count := 0
	for _, s := range c.app.session.sessions {
		if s.ParentSessionID == parentID {
			count++
		}
	}
	return count
}

func sessionToolCount(s gact.Session) int {
	for _, key := range []string{"tool_count", "tools_count"} {
		if n, ok := floatValue(s.Metadata[key]); ok && n > 0 {
			return int(n)
		}
	}
	return 0
}

func childSidebarMeta(s gact.Session) string {
	var bits []string
	if s.Status != "" && s.Status != gact.StatusIdle {
		bits = append(bits, s.Status)
	}
	if tools := sessionToolCount(s); tools > 0 {
		bits = append(bits, fmt.Sprintf("%dt", tools))
	}
	if len(bits) == 0 {
		return s.Status
	}
	return strings.Join(bits, " · ")
}

func childSessionDisplayTitle(s gact.Session, fallback string) string {
	title := strings.TrimSpace(fallback)
	if s.Agent.ID != "" {
		title = s.Agent.ID
	}
	for _, suffix := range []string{" subagent", " nanoagent"} {
		title = strings.TrimSuffix(title, suffix)
	}
	title = strings.TrimSuffix(title, "_validator")
	title = strings.ReplaceAll(title, "_", " ")
	switch strings.ToLower(title) {
	case "csv":
		return "CSV"
	case "adios":
		return "ADIOS"
	case "hdf5":
		return "HDF5"
	case "bp5", "bp4":
		return strings.ToUpper(title)
	}
	return title
}

func (c *sidebarComponent) openSessionSummaryDetail(index int) tea.Cmd {
	if index < 0 || index >= len(c.app.session.sessions) {
		return nil
	}
	s := c.app.session.sessions[index]
	summary := strings.TrimSpace(s.Summary)
	if summary == "" {
		c.app.setHint("no session summary available")
		return nil
	}
	rows := appendDetailSection(nil, "Session Summary",
		detailField{"session", s.ID},
		detailField{"title", firstNonEmpty(s.Title, c.app.localizer.t(msgSidebarUntitled, nil))},
		detailField{"status", s.Status},
		detailField{"updated", formatOptionalTime(s.UpdatedAt)},
		detailField{"summary", summary},
	)
	c.app.detail.open(&bulkyPartRef{
		messageID: "session-summary",
		partID:    s.ID,
		title:     "Session summary · " + firstNonEmpty(s.Title, s.ID),
		fullText:  strings.Join(rows, "\n"),
	})
	return nil
}
