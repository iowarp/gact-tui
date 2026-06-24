package ui

// settings_agents.go manages the settings agent list (titles, descriptions, selection visibility).

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (c *settingsComponent) localizedAgentTitle(ag gact.AgentDef) string {
	if key := knownAgentLocaleKey(ag.ID, false); key != "" {
		return c.app.localizer.t(messageID(key), nil)
	}
	if strings.TrimSpace(ag.Title) != "" {
		return ag.Title
	}
	return ag.ID
}

func (c *settingsComponent) localizedAgentDescription(ag gact.AgentDef) string {
	if key := knownAgentLocaleKey(ag.ID, true); key != "" {
		return c.app.localizer.t(messageID(key), nil)
	}
	return ag.Description
}

func (c *settingsComponent) agentListDescription(ag gact.AgentDef) string {
	desc := c.localizedAgentDescription(ag)
	if before, _, ok := strings.Cut(desc, "Common tools:"); ok {
		desc = before
	}
	return strings.TrimSpace(desc)
}

func (c *settingsComponent) visibleAgentRange() (int, int) {
	if len(c.agentList) == 0 {
		return 0, 0
	}
	visible := c.maxVisibleAgentRows()
	if visible > len(c.agentList) {
		visible = len(c.agentList)
	}
	start := c.agentScroll
	if start < 0 {
		start = 0
	}
	if start > len(c.agentList)-visible {
		start = len(c.agentList) - visible
	}
	end := start + visible
	c.agentScroll = start
	return start, end
}

func (c *settingsComponent) maxVisibleAgentRows() int {
	visible := c.app.height - 24
	if visible < 4 {
		visible = 4
	}
	if visible > 12 {
		visible = 12
	}
	return visible
}

func (c *settingsComponent) ensureAgentSelectionVisible() {
	if c.agentSel < 0 {
		c.agentSel = 0
	}
	if c.agentSel >= len(c.agentList) {
		c.agentSel = max(0, len(c.agentList)-1)
	}
	visible := c.maxVisibleAgentRows()
	if c.agentSel < c.agentScroll {
		c.agentScroll = c.agentSel
	}
	if c.agentSel >= c.agentScroll+visible {
		c.agentScroll = c.agentSel - visible + 1
	}
	if c.agentScroll < 0 {
		c.agentScroll = 0
	}
}

func (c *settingsComponent) openAgentDetail() {
	if c.agentSel < 0 || c.agentSel >= len(c.agentList) {
		return
	}
	ag := c.agentList[c.agentSel]
	c.app.detail.open(&bulkyPartRef{
		messageID: "settings",
		partID:    "agent-" + ag.ID,
		title:     "Expert · " + c.localizedAgentTitle(ag),
		fullText:  c.app.agent.agentDetailText(ag),
	})
}

func knownAgentLocaleKey(id string, description bool) string {
	normalized := strings.ToLower(strings.TrimSpace(id))
	normalized = strings.ReplaceAll(normalized, "-", "_")
	normalized = strings.ReplaceAll(normalized, ".", "_")
	normalized = strings.ReplaceAll(normalized, ":", "_")
	if normalized == "" {
		return ""
	}
	switch normalized {
	case "default", "main", "chat", "data", "analysis", "visualization", "utility", "adios_validator", "data_validator":
	default:
		return ""
	}
	if description {
		return "settings.agent.desc." + normalized
	}
	return "settings.agent." + normalized
}
