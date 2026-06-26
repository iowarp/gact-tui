package ui

// agent_blueprint_manage_view.go renders the agent-blueprint management modal.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
)

func (m *agentBlueprintManageModal) view() string {
	a := m.app
	t := a.Theme
	w := a.modals.modalWidth()
	mode := m.mode
	title := "Install agent blueprint"
	verb := "install"
	actionID := "install"
	intro := []string{
		"Enter a local directory, AGENT.md path, git URL, or marketplace source.",
		"Installs into the current workspace and reloads the blueprint catalog.",
	}
	if mode == agentBlueprintManageInstall && strings.TrimSpace(m.lastValidatedSource) != "" {
		intro = append(intro, "Prefilled from the last successful validation; edit before installing if needed.")
	}
	if mode == agentBlueprintManageValidate {
		title = "Validate agent blueprint"
		verb = "validate"
		actionID = "validate"
		intro = []string{
			"Enter a local directory or AGENT.md path.",
			"Validation previews the parsed blueprint, agents, MCP descriptors, and errors without installing it.",
		}
	} else if mode == agentBlueprintManageSource {
		title = "Add marketplace source"
		verb = "add source"
		actionID = "add-source"
		intro = []string{
			"Enter a git URL or local marketplace directory.",
			brandName()+" stores the source, refreshes it, and lists available blueprints in this browser.",
		}
	}
	buttons := []menuButton{{
		id:    "agent-blueprint-manage:" + actionID,
		label: verb,
		action: func(app *App) tea.Cmd {
			_, cmd := app.agentBlueprintManage.handleKey(keyMsg("enter"))
			return cmd
		},
	}, {
		id:    "agent-blueprint-manage:cancel",
		label: "cancel",
		action: func(app *App) tea.Cmd {
			app.agentBlueprintManage.close()
			return nil
		},
	}}
	statusRows := a.modals.modalStatusRows(m.err, m.saving, verb+"ing…")
	rendered := a.modals.renderTextEntryModal(a.modals.withInputEditor(textEntryModalOptions{
		width:     w,
		title:     title,
		buttons:   buttons,
		surfaceID: "agent-blueprint-manage",
		intro:     intro,
		status:    statusRows,
		footer:    t.HintLabel.Render(modalKeyHint("Enter "+verb, "Esc cancel")),
	}, "agent-blueprint-manage", &m.input))
	return rendered.modal
}
