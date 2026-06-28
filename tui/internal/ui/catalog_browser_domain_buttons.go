package ui

// catalog_browser_domain_buttons.go builds the per-domain (prompt/expert-pack/blueprint/source) catalog detail action buttons.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
)

func agentBlueprintSourceActionSectionTitle(cb *catalogBrowserState) string {
	if cb != nil && cb.kind == catalogKindAgentBlueprintSources && cb.sel >= 0 && cb.sel < len(cb.items) &&
		strings.HasPrefix(cb.items[cb.sel].id, "source-blueprint/") {
		return "Blueprint actions"
	}
	return "Source actions"
}

func (c *catalogComponent) promptDetailActionButtons() []menuButton {
	return []menuButton{
		{
			id:    "prompts:render",
			label: "render default",
			action: func(app *App) tea.Cmd {
				return app.catalog.renderPromptDefaultProfile()
			},
		},
		{
			id:    "prompts:validate",
			label: "validate default",
			action: func(app *App) tea.Cmd {
				return app.catalog.validatePromptDefaultProfile()
			},
		},
		{
			id:    "prompts:reload",
			label: "reload registry",
			action: func(app *App) tea.Cmd {
				return app.catalog.reloadPromptRegistry()
			},
		},
	}
}

func (c *catalogComponent) expertPackDetailActionButtons() []menuButton {
	if c.current == nil {
		return nil
	}
	activateLabel := "activate"
	if catalogItemStatusTag(c.current.items, "activate") == "active" {
		activateLabel = "active"
	}
	deleteLabel := "delete"
	if c.expertPackDeleteArmed() {
		deleteLabel = "confirm delete"
	}
	return c.actionButtonsFromItems("expert-pack-detail", []catalogActionButtonSpec{
		{id: "activate", label: activateLabel, disabledLabel: "activation blocked"},
		{id: "expert-pack-action/update", label: "update"},
		{id: "expert-pack-action/delete", label: deleteLabel},
	})
}

func (c *agentComponent) agentBlueprintDetailActionButtons() []menuButton {
	if c.app.catalog.current == nil {
		return nil
	}
	deleteLabel := "delete"
	if c.app.catalog.blueprintDeleteArmed() {
		deleteLabel = "confirm delete"
	}
	specs := []catalogActionButtonSpec{
		{id: "blueprint-action/update", label: "update"},
		{id: "blueprint-action/delete", label: deleteLabel},
	}
	if catalogItemStatusTag(c.app.catalog.current.items, "activate") != "active" {
		specs = append([]catalogActionButtonSpec{{id: "activate", label: "activate", disabledLabel: "activation blocked"}}, specs...)
	}
	return c.app.catalog.actionButtonsFromItems("blueprint-detail", specs)
}

func (c *agentComponent) agentBlueprintSourceActionButtons() []menuButton {
	cb := c.app.catalog.current
	if cb == nil || cb.kind != catalogKindAgentBlueprintSources || cb.sel < 0 || cb.sel >= len(cb.items) {
		return nil
	}
	addButton := menuButton{
		id:    "agent-blueprint-source:add",
		label: "add source",
		action: func(app *App) tea.Cmd {
			app.agentBlueprintManage.openModal(agentBlueprintManageSource)
			return nil
		},
	}
	item := cb.items[cb.sel]
	switch {
	case strings.HasPrefix(item.id, "source-blueprint/"):
		sourceID, blueprintID, ok := parseSourceBlueprintItemID(item.id)
		if !ok {
			return nil
		}
		return []menuButton{
			addButton,
			{
				id:    "agent-blueprint-source:install",
				label: "install blueprint",
				action: func(app *App) tea.Cmd {
					return installAgentBlueprintFromSourceCmd(app.c, app.session.runtimeScope(), sourceID, blueprintID)
				},
			},
			{
				id:    "agent-blueprint-source:refresh",
				label: "refresh source",
				action: func(app *App) tea.Cmd {
					return refreshAgentBlueprintSourceCmd(app.c, sourceID)
				},
			},
		}
	case strings.HasPrefix(item.id, "source/"):
		sourceID := strings.TrimPrefix(item.id, "source/")
		deleteLabel := "remove source"
		if cb.pendingDeleteSourceID == sourceID {
			deleteLabel = "confirm remove"
		}
		return []menuButton{
			addButton,
			{
				id:    "agent-blueprint-source:refresh",
				label: "refresh source",
				action: func(app *App) tea.Cmd {
					return refreshAgentBlueprintSourceCmd(app.c, sourceID)
				},
			},
			{
				id:    "agent-blueprint-source:remove",
				label: deleteLabel,
				action: func(app *App) tea.Cmd {
					return app.agent.confirmOrDeleteAgentBlueprintSource(sourceID)
				},
			},
		}
	default:
		return []menuButton{addButton}
	}
}
