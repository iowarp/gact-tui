package ui

// catalog_browser_enter.go handles the Enter key in the catalog browser, dispatching per-kind activation/navigation.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
)

func (c *catalogComponent) handleEnter(cb *catalogBrowserState) (tea.Model, tea.Cmd) {
	// Drill into an MCP server when selected.
	if cb.kind == catalogKindMcp && cb.sel >= 0 && cb.sel < len(cb.items) {
		it := cb.items[cb.sel]
		return c.app, c.openMcpDetail(it.id, it.title)
	}
	if (cb.kind == catalogKindAgents || cb.kind == catalogKindSkills) && cb.sel >= 0 && cb.sel < len(cb.items) {
		it := cb.items[cb.sel]
		if it.disabled {
			c.app.setHint("action disabled: " + strings.TrimSpace(it.desc))
			return c.app, scheduleHintExpire(c.app.transientHint)
		}
		if it.id == "none" {
			return c.app, nil
		}
		c.app.catalog.openDetail(catalogItemDetailTitle(it), catalogItemDetailText(it))
		return c.app, nil
	}
	if cb.kind == catalogKindPrompts && cb.sel >= 0 && cb.sel < len(cb.items) {
		it := cb.items[cb.sel]
		if it.id == "none" {
			return c.app, nil
		}
		if strings.HasPrefix(it.id, "provider/") {
			c.app.catalog.openDetail(it.title, it.desc)
			return c.app, nil
		}
		return c.app, c.openPromptDetail(it.id, it.title)
	}
	if cb.kind == catalogKindTools && cb.sel >= 0 && cb.sel < len(cb.items) {
		it := cb.items[cb.sel]
		if strings.HasPrefix(it.id, "mcpserver/") {
			return c.app, c.openMcpDetail(strings.TrimPrefix(it.id, "mcpserver/"), it.title)
		}
		if strings.HasPrefix(it.id, "toolsource/") {
			c.app.catalog.openDetail(it.title, it.desc)
			return c.app, nil
		}
		if it.id == "none" {
			return c.app, nil
		}
		return c.app, loadToolDetailCmd(c.app.c, c.app.session.runtimeScope(), it.id)
	}
	if cb.kind == catalogKindMcpDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
		it := cb.items[cb.sel]
		switch {
		case it.id == "mcp-action/reconnect":
			return c.app, mcpReconnectCmd(c.app.c, cb.mcpServerID)
		case strings.HasPrefix(it.id, "tool/"):
			return c.app, loadToolDetailCmd(c.app.c, c.app.session.runtimeScope(), strings.TrimPrefix(it.id, "tool/"))
		case strings.HasPrefix(it.id, "res/"):
			uri := strings.TrimPrefix(it.id, "res/")
			return c.app, loadMcpResourceDetailCmd(c.app.c, cb.mcpServerID, uri, it.title)
		default:
			text := strings.TrimSpace(it.desc)
			if text == "" {
				text = it.title
			}
			c.app.catalog.openDetail(it.title, text)
			return c.app, nil
		}
	}
	if cb.kind == catalogKindPromptDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
		it := cb.items[cb.sel]
		switch {
		case strings.HasPrefix(it.id, "profile/"):
			profile := strings.TrimPrefix(it.id, "profile/")
			return c.app, loadPromptResolvedDetailCmd(c.app.c, c.app.session.runtimeScope(), cb.promptID, profile)
		}
		text := strings.TrimSpace(it.desc)
		if text == "" {
			text = it.title
		}
		c.app.catalog.openDetail(it.title, text)
		return c.app, nil
	}
	// Other kinds: enter still closes (back-compat).
	c.close()
	return c.app, nil
}
