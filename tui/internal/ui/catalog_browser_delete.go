package ui

// catalog_browser_delete.go manages two-step delete confirmation for agents, blueprints, expert packs, and sources.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
)

func (c *catalogComponent) agentDeleteArmed() bool {
	cb := c.current
	return cb != nil &&
		cb.kind == catalogKindAgentDetail &&
		cb.agentID != "" &&
		cb.pendingDeleteAgentID == cb.agentID
}

func (c *catalogComponent) blueprintDeleteArmed() bool {
	cb := c.current
	return cb != nil &&
		cb.kind == catalogKindAgentBlueprintDetail &&
		cb.blueprintID != "" &&
		cb.pendingDeleteBlueprintID == cb.blueprintID
}

func (c *catalogComponent) expertPackDeleteArmed() bool {
	cb := c.current
	return cb != nil &&
		cb.kind == catalogKindExpertPackDetail &&
		cb.expertPackID != "" &&
		cb.pendingDeleteExpertPackID == cb.expertPackID
}

func catalogBrowserKeyConfirmsAgentDelete(cb *catalogBrowserState, key string) bool {
	if cb == nil || cb.kind != catalogKindAgentDetail || cb.pendingDeleteAgentID == "" {
		return false
	}
	return key == "d" || key == "enter"
}

func catalogBrowserKeyConfirmsExpertPackDelete(cb *catalogBrowserState, key string) bool {
	if cb == nil || cb.kind != catalogKindExpertPackDetail || cb.pendingDeleteExpertPackID == "" {
		return false
	}
	if key == "d" {
		return true
	}
	return key == "enter" &&
		cb.sel >= 0 &&
		cb.sel < len(cb.items) &&
		cb.items[cb.sel].id == "expert-pack-action/delete"
}

func catalogBrowserKeyConfirmsBlueprintDelete(cb *catalogBrowserState, key string) bool {
	if cb == nil || cb.kind != catalogKindAgentBlueprintDetail || cb.pendingDeleteBlueprintID == "" {
		return false
	}
	if key == "d" {
		return true
	}
	return key == "enter" &&
		cb.sel >= 0 &&
		cb.sel < len(cb.items) &&
		cb.items[cb.sel].id == "blueprint-action/delete"
}

func catalogBrowserKeyConfirmsSourceDelete(cb *catalogBrowserState, key string) bool {
	if cb == nil || cb.kind != catalogKindAgentBlueprintSources || cb.pendingDeleteSourceID == "" {
		return false
	}
	if key != "d" {
		return false
	}
	if cb.sel < 0 || cb.sel >= len(cb.items) {
		return false
	}
	return cb.items[cb.sel].id == "source/"+cb.pendingDeleteSourceID
}

func (c *catalogComponent) cancelDeleteConfirmationsOnKey(cb *catalogBrowserState, key string) {
	if cb == nil {
		return
	}
	canceled := false
	if cb.pendingDeleteAgentID != "" && !catalogBrowserKeyConfirmsAgentDelete(cb, key) {
		cb.pendingDeleteAgentID = ""
		canceled = true
	}
	if cb.pendingDeleteBlueprintID != "" && !catalogBrowserKeyConfirmsBlueprintDelete(cb, key) {
		cb.pendingDeleteBlueprintID = ""
		canceled = true
	}
	if cb.pendingDeleteExpertPackID != "" && !catalogBrowserKeyConfirmsExpertPackDelete(cb, key) {
		cb.pendingDeleteExpertPackID = ""
		canceled = true
	}
	if cb.pendingDeleteSourceID != "" && !catalogBrowserKeyConfirmsSourceDelete(cb, key) {
		cb.pendingDeleteSourceID = ""
		canceled = true
	}
	if canceled {
		c.app.setHint("")
	}
}

func (c *catalogComponent) confirmOrDeleteExpertPack() tea.Cmd {
	a := c.app
	cb := c.current
	if cb == nil || cb.kind != catalogKindExpertPackDetail || cb.expertPackID == "" {
		return nil
	}
	if cb.pendingDeleteExpertPackID == cb.expertPackID {
		packID := cb.expertPackID
		cb.pendingDeleteExpertPackID = ""
		return deleteExpertPackCmd(a.c, a.session.runtimeScope(), packID)
	}
	cb.pendingDeleteExpertPackID = cb.expertPackID
	label := firstNonEmpty(cb.expertPackID, "this expert pack")
	a.setHint("press d or Enter again to confirm deleting " + label + " (any other key cancels)")
	return scheduleHintExpire(a.transientHint)
}

func (c *agentComponent) confirmOrDeleteAgent() tea.Cmd {
	cb := c.app.catalog.current
	if cb == nil || cb.kind != catalogKindAgentDetail || cb.agentID == "" {
		return nil
	}
	if cb.pendingDeleteAgentID == cb.agentID {
		agentID := cb.agentID
		cb.pendingDeleteAgentID = ""
		c.app.catalog.close()
		return deleteAgentCmd(c.app.c, agentID)
	}
	cb.pendingDeleteAgentID = cb.agentID
	label := firstNonEmpty(cb.agentID, "this expert")
	c.app.setHint("press d or Enter again to confirm deleting " + label + " (any other key cancels)")
	return scheduleHintExpire(c.app.transientHint)
}

func (c *agentComponent) confirmOrDeleteAgentBlueprintSource(sourceID string) tea.Cmd {
	cb := c.app.catalog.current
	sourceID = strings.TrimSpace(sourceID)
	if cb == nil || cb.kind != catalogKindAgentBlueprintSources || sourceID == "" || sourceID == "none" {
		return nil
	}
	if cb.pendingDeleteSourceID == sourceID {
		cb.pendingDeleteSourceID = ""
		return deleteAgentBlueprintSourceCmd(c.app.c, sourceID)
	}
	cb.pendingDeleteSourceID = sourceID
	c.app.setHint("press d again to confirm removing source " + sourceID + " (any other key cancels)")
	return scheduleHintExpire(c.app.transientHint)
}

func (c *agentComponent) confirmOrDeleteAgentBlueprint() tea.Cmd {
	cb := c.app.catalog.current
	if cb == nil || cb.kind != catalogKindAgentBlueprintDetail || cb.blueprintID == "" {
		return nil
	}
	if cb.pendingDeleteBlueprintID == cb.blueprintID {
		blueprintID := cb.blueprintID
		cb.pendingDeleteBlueprintID = ""
		return deleteAgentBlueprintCmd(c.app.c, c.app.session.runtimeScope(), blueprintID)
	}
	cb.pendingDeleteBlueprintID = cb.blueprintID
	label := firstNonEmpty(cb.blueprintID, "this blueprint")
	c.app.setHint("press d or Enter again to confirm deleting " + label + " (any other key cancels)")
	return scheduleHintExpire(c.app.transientHint)
}
