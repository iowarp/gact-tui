package ui

// catalog_browser_keys.go is the catalog-browser keyboard router.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
)

// handleKey handles keypresses while the modal is open.
// Up/down navigates, Esc closes (or pops detail views back to parent),
// Enter opens the selected row's detail/drill-down view, and Space toggles a
// tool's enabled state (LLL2).
func (c *catalogComponent) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if c.current == nil {
		c.close()
		return c.app, nil
	}
	cb := c.current
	key := k.String()
	switch key {
	case "esc", "escape", "ctrl+c":
		// LLL2: in MCP detail, esc pops back to parent server list
		// rather than closing the whole modal — gives back-out
		// affordance without juggling separate keys.
		if catalogBrowserCanPop(cb.kind) && cb.parent != nil {
			c.navigateToParent()
			return c.app, nil
		}
		c.close()
	case "/":
		c.close()
		c.app.focus = FocusInput
		c.app.inputComposer.input.Focus()
		c.app.inputComposer.input.SetValue("/")
		c.app.inputComposer.input.CursorEnd()
	case "backspace":
		if catalogBrowserCanPop(cb.kind) && cb.parent != nil {
			c.navigateToParent()
		}
	case "enter":
		return c.handleEnter(cb)
	case " ", "space":
		// LLL2: toggle disabled state on a tool row. Persists to
		// config.json so the choice survives restart. Pure TUI
		// filter for now — backends that respect an allowed_tools
		// list could honour this on session create.
		if cb.kind == catalogKindTools && cb.sel >= 0 && cb.sel < len(cb.items) {
			id := cb.items[cb.sel].id
			if strings.HasPrefix(id, "mcpserver/") || strings.HasPrefix(id, "toolsource/") || id == "none" {
				return c.app, nil
			}
			c.toggleToolDisabled(id)
		}
	case "v":
		if cb.kind == catalogKindPromptDetail {
			return c.app, c.app.catalog.validatePromptDefaultProfile()
		}
	case "u":
		if cb.kind == catalogKindPromptDetail {
			return c.app, c.app.catalog.reloadPromptRegistry()
		}
	case "s":
		if cb.kind == catalogKindPromptDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if strings.HasPrefix(it.id, "profile/") {
				profile := strings.TrimPrefix(it.id, "profile/")
				return c.app, savePromptProfileCmd(c.app.c, c.app.session.runtimeScope(), cb.promptID, profile, "codex")
			}
		}
	case "o":
		if cb.kind == catalogKindAgents && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if it.id == "none" || strings.HasPrefix(it.id, "action/") {
				return c.app, nil
			}
			c.app.agent.setNextTurnAgent(it.id, it.title)
			c.close()
			return c.app, scheduleHintExpire(c.app.transientHint)
		}
	case "e":
		if cb.kind == catalogKindPromptDetail && cb.sel >= 0 && cb.sel < len(cb.items) {
			it := cb.items[cb.sel]
			if strings.HasPrefix(it.id, "profile/") {
				profile := strings.TrimPrefix(it.id, "profile/")
				return c.app, loadPromptEditCmd(c.app.c, c.app.session.runtimeScope(), cb.promptID, profile)
			}
		}
	case "up", "k":
		catalogBrowserMoveSelection(cb, -1)
	case "down", "j":
		catalogBrowserMoveSelection(cb, 1)
	case "i":
		// Install a third-party MCP server. Closes the catalog and opens the
		// small inline install overlay. Exposed from the unified tools catalog
		// so operators can manage sources where they inspect callable tools.
		if cb.kind == catalogKindMcp || cb.kind == catalogKindTools {
			c.close()
			c.app.mcpInstall.openModal()
			return c.app, nil
		}
	case "d":
		// Delete the highlighted MCP server. Bundled in_process
		// servers are non-removable; the existing remove flow already
		// filters those out and reports the "no third-party MCPs" toast.
		if cb.kind == catalogKindMcp {
			c.close()
			return c.app, c.app.mcpRemove.openPicker()
		}
		if cb.kind == catalogKindTools && selectedCatalogMcpServerID(cb) != "" {
			c.close()
			return c.app, c.app.mcpRemove.openPicker()
		}
	case "r":
		if cb.kind == catalogKindPromptDetail {
			return c.app, c.app.catalog.renderPromptDefaultProfile()
		}
		if cb.kind == catalogKindMcpDetail && cb.mcpServerID != "" {
			return c.app, mcpReconnectCmd(c.app.c, cb.mcpServerID)
		}
		if cb.kind == catalogKindTools {
			if serverID := selectedCatalogMcpServerID(cb); serverID != "" {
				return c.app, mcpReconnectCmd(c.app.c, serverID)
			}
		}
	}
	return c.app, nil
}
