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
		return c.app, c.openAgentDetail(it.id, it.title)
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
	if cb.kind == catalogKindExpertPacks && cb.sel >= 0 && cb.sel < len(cb.items) {
		it := cb.items[cb.sel]
		if it.id == "none" {
			return c.app, nil
		}
		return c.app, c.openExpertPackDetail(it.id, it.title)
	}
	if cb.kind == catalogKindAgentBlueprints && cb.sel >= 0 && cb.sel < len(cb.items) {
		it := cb.items[cb.sel]
		switch it.id {
		case "action/install-blueprint":
			c.app.agentBlueprintManage.openModal(agentBlueprintManageInstall)
			return c.app, nil
		case "action/validate-blueprint":
			c.app.agentBlueprintManage.openModal(agentBlueprintManageValidate)
			return c.app, nil
		case "action/source-registry":
			return c.app, c.openSourceBrowser()
		}
		if strings.HasPrefix(it.id, "source/") || strings.HasPrefix(it.id, "provider/") {
			c.app.catalog.openDetail(it.title, it.desc)
			return c.app, nil
		}
		return c.app, c.openBlueprintDetail(it.id, it.title)
	}
	if cb.kind == catalogKindAgentBlueprintSources && cb.sel >= 0 && cb.sel < len(cb.items) {
		it := cb.items[cb.sel]
		switch {
		case strings.HasPrefix(it.id, "source/"):
			c.app.catalog.openDetail(it.title, it.desc)
			return c.app, nil
		case strings.HasPrefix(it.id, "source-blueprint/"):
			sourceID, blueprintID, ok := parseSourceBlueprintItemID(it.id)
			if ok {
				return c.app, installAgentBlueprintFromSourceCmd(c.app.c, c.app.session.runtimeScope(), sourceID, blueprintID)
			}
		}
		return c.app, nil
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
	if cb.kind == catalogKindAgentDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
		it := cb.items[cb.sel]
		if it.disabled {
			c.app.setHint("action disabled for this agent")
			return c.app, scheduleHintExpire(c.app.transientHint)
		}
		if strings.HasPrefix(it.id, "agent/") {
			return c.app, c.openAgentDetail(strings.TrimPrefix(it.id, "agent/"), it.title)
		}
		if it.id == "agent-action/edit" {
			return c.app, loadAgentForEditCmd(c.app.c, c.app.session.runtimeScope(), c.current.agentID)
		}
		if it.id == "agent-action/clone" {
			seed := c.current.agentID + "-copy"
			c.app.agentWrite.openModal(agentWriteModeClone, c.current.agentID, seed)
			return c.app, nil
		}
		if it.id == "agent-action/delete" {
			return c.app, c.app.agent.confirmOrDeleteAgent()
		}
		if strings.HasPrefix(it.id, "tool/") {
			return c.app, loadToolDetailCmd(c.app.c, c.app.session.runtimeScope(), strings.TrimPrefix(it.id, "tool/"))
		}
		if strings.HasPrefix(it.id, "mcpserver/") {
			serverID := strings.TrimPrefix(it.id, "mcpserver/")
			return c.app, c.openMcpDetail(serverID, it.title)
		}
		text := strings.TrimSpace(it.desc)
		if text == "" {
			text = it.title
		}
		c.app.catalog.openDetail(it.title, text)
		return c.app, nil
	}
	if cb.kind == catalogKindAgentBlueprintDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
		it := cb.items[cb.sel]
		if it.disabled {
			c.app.setHint("action disabled: " + strings.TrimSpace(it.desc))
			return c.app, scheduleHintExpire(c.app.transientHint)
		}
		switch {
		case it.id == "activate":
			sid := c.app.session.currentID()
			if sid == "" {
				c.app.setHint("No active session for blueprint activation")
				return c.app, scheduleHintExpire(c.app.transientHint)
			}
			return c.app, activateAgentBlueprintCmd(c.app.c, sid, cb.blueprintID)
		case strings.HasPrefix(it.id, "agent/"):
			c.app.catalog.openDetail(catalogItemDetailTitle(it), catalogItemDetailText(it))
			return c.app, nil
		case strings.HasPrefix(it.id, "mcp/"):
			return c.app, enableAgentBlueprintMCPCmd(c.app.c, c.app.session.runtimeScope(), cb.blueprintID, strings.TrimPrefix(it.id, "mcp/"))
		case strings.HasPrefix(it.id, "hook/"):
			return c.app, enableAgentBlueprintHookCmd(c.app.c, c.app.session.runtimeScope(), cb.blueprintID, strings.TrimPrefix(it.id, "hook/"))
		case it.id == "blueprint-action/update":
			return c.app, updateAgentBlueprintCmd(c.app.c, c.app.session.runtimeScope(), cb.blueprintID)
		case it.id == "blueprint-action/delete":
			return c.app, c.app.agent.confirmOrDeleteAgentBlueprint()
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
	if cb.kind == catalogKindExpertPackDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
		it := cb.items[cb.sel]
		switch {
		case it.id == "activate":
			if it.disabled {
				c.app.setHint("action disabled: " + strings.TrimSpace(it.desc))
				return c.app, scheduleHintExpire(c.app.transientHint)
			}
			if sid := c.app.session.currentID(); sid != "" && cb.expertPackID != "" {
				return c.app, activateExpertPackCmd(c.app.c, sid, cb.expertPackID)
			}
			c.app.setHint("select a session before activating an expert pack")
			return c.app, scheduleHintExpire(c.app.transientHint)
		case it.id == "expert-pack-action/update":
			return c.app, updateExpertPackCmd(c.app.c, c.app.session.runtimeScope(), cb.expertPackID)
		case it.id == "expert-pack-action/delete":
			return c.app, c.app.catalog.confirmOrDeleteExpertPack()
		case strings.HasPrefix(it.id, "agent/"):
			c.app.catalog.openDetail(catalogItemDetailTitle(it), catalogItemDetailText(it))
			return c.app, nil
		default:
			text := strings.TrimSpace(it.desc)
			if text == "" {
				text = it.title
			}
			c.app.catalog.openDetail(it.title, text)
			return c.app, nil
		}
	}
	// Other kinds: enter still closes (back-compat).
	c.close()
	return c.app, nil
}
