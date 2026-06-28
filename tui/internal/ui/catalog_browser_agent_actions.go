package ui

// catalog_browser_agent_actions.go builds and runs the agent detail action buttons within the catalog browser.

import tea "charm.land/bubbletea/v2"

func catalogBrowserAgentIsUserOwned(cb *catalogBrowserState) bool {
	if cb == nil || cb.kind != catalogKindAgentDetail || cb.agentID == "" {
		return false
	}
	for _, item := range cb.items {
		if item.id == "agent/"+cb.agentID {
			return item.statusTag == "user"
		}
	}
	return false
}

func (c *agentComponent) agentDetailActionButtons() []menuButton {
	cb := c.app.catalog.current
	if cb == nil || cb.kind != catalogKindAgentDetail || cb.agentID == "" {
		return nil
	}
	disabled := !c.app.session.caps.Capabilities.AgentWrite
	deleteLabel := "delete"
	if c.app.catalog.agentDeleteArmed() {
		deleteLabel = "confirm delete"
	}
	buttons := []menuButton{{
		id:       "agent-detail:clone",
		label:    "clone",
		disabled: disabled,
		action: func(app *App) tea.Cmd {
			return app.agent.runAgentDetailAction("agent-action/clone")
		},
	}}
	if catalogBrowserAgentIsUserOwned(cb) {
		buttons = append(buttons, menuButton{
			id:       "agent-detail:edit",
			label:    "edit",
			disabled: disabled,
			action: func(app *App) tea.Cmd {
				return app.agent.runAgentDetailAction("agent-action/edit")
			},
		})
		buttons = append(buttons, menuButton{
			id:       "agent-detail:delete",
			label:    deleteLabel,
			disabled: disabled,
			action: func(app *App) tea.Cmd {
				return app.agent.runAgentDetailAction("agent-action/delete")
			},
		})
	}
	return buttons
}

func (c *agentComponent) runAgentDetailAction(itemID string) tea.Cmd {
	cb := c.app.catalog.current
	if cb == nil || cb.kind != catalogKindAgentDetail || cb.agentID == "" {
		return nil
	}
	if !c.app.session.caps.Capabilities.AgentWrite {
		c.app.setHint("expert action unavailable: backend does not advertise agent_write")
		return scheduleHintExpire(c.app.transientHint)
	}
	switch itemID {
	case "agent-action/clone":
		seed := cb.agentID + "-copy"
		c.app.agentWrite.openModal(agentWriteModeClone, cb.agentID, seed)
		return nil
	case "agent-action/edit":
		if !catalogBrowserAgentIsUserOwned(cb) {
			c.app.setHint("edit is available for user-owned experts")
			return scheduleHintExpire(c.app.transientHint)
		}
		return loadAgentForEditCmd(c.app.c, c.app.session.runtimeScope(), cb.agentID)
	case "agent-action/delete":
		if !catalogBrowserAgentIsUserOwned(cb) {
			c.app.setHint("delete is available for user-owned experts")
			return scheduleHintExpire(c.app.transientHint)
		}
		return c.confirmOrDeleteAgent()
	default:
		return nil
	}
}
