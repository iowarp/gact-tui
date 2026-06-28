package ui

// agent_blueprint_manage_events.go holds the agent-blueprint manage-modal completion message plus its install/validate/add-source commands.

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

type agentBlueprintManageDoneMsg struct {
	action string
	source string
	result map[string]any
	check  gact.AgentBlueprintValidationResult
	err    error
}

func (c *agentComponent) handleAgentBlueprintManageDone(m agentBlueprintManageDoneMsg) (tea.Model, tea.Cmd) {
	c.app.agentBlueprintManage.saving = false
	if m.err != nil {
		c.app.agentBlueprintManage.err = operatorErrorMessage(m.err)
		return c.app, nil
	}
	c.app.agentBlueprintManage.close()
	if m.action == agentBlueprintManageValidate {
		c.app.agentBlueprintManage.lastValidatedSource = strings.TrimSpace(m.source)
		c.app.setHint("agent blueprint validated: " + m.source)
		c.app.catalog.openDetail("Agent blueprint validation", formatAgentBlueprintValidationWithSource(m.check, m.source))
		return c.app, scheduleHintExpire(c.app.transientHint)
	}
	c.app.setHint("agent blueprint installed: " + m.source)
	var cmd tea.Cmd
	if c.app.catalog.open && c.app.catalog.current != nil && c.app.catalog.current.kind == catalogKindAgentBlueprints {
		cmd = loadCatalogBrowserCmd(c.app.c, catalogKindAgentBlueprints, c.app.session.runtimeScope())
	}
	return c.app, tea.Batch(scheduleHintExpire(c.app.transientHint), cmd)
}

func installAgentBlueprintCmd(c *client.Client, scope client.RuntimeScope, source string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		result, err := c.InstallAgentBlueprint(ctx, gact.AgentBlueprintInstallRequest{
			Source:      source,
			Scope:       "workspace",
			WorkspaceID: scope.WorkspaceID,
		})
		return agentBlueprintManageDoneMsg{action: agentBlueprintManageInstall, source: source, result: result, err: err}
	}
}

func validateAgentBlueprintCmd(c *client.Client, scope client.RuntimeScope, path string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		result, err := c.ValidateAgentBlueprint(ctx, gact.AgentBlueprintValidateRequest{
			Path:  path,
			Scope: "workspace",
		})
		return agentBlueprintManageDoneMsg{action: agentBlueprintManageValidate, source: path, check: result, err: err}
	}
}

func addAgentBlueprintSourceCmd(c *client.Client, source string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		row, err := c.AddAgentBlueprintSource(ctx, gact.AgentBlueprintSourceRequest{Source: source, Refresh: true})
		return agentBlueprintSourceManagedMsg{sourceID: firstNonEmpty(row.ID, source), action: "added", source: row, err: err}
	}
}
