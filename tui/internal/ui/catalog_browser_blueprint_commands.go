package ui

// catalog_browser_blueprint_commands.go defines blueprint activate/enable/manage messages and their backend commands.

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

type agentBlueprintActivatedMsg struct {
	blueprintID string
	state       gact.SessionAgentBlueprintState
	err         error
}

type agentBlueprintMCPEnabledMsg struct {
	blueprintID  string
	descriptorID string
	result       map[string]any
	err          error
}

type agentBlueprintHookEnabledMsg struct {
	blueprintID string
	hookID      string
	result      map[string]any
	err         error
}

type agentBlueprintManagedMsg struct {
	blueprintID string
	action      string
	result      map[string]any
	err         error
}

type agentBlueprintSourceManagedMsg struct {
	sourceID string
	action   string
	source   gact.AgentBlueprintSource
	err      error
}

func loadAgentBlueprintDetailCmd(c *client.Client, scope client.RuntimeScope, blueprintID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		detail, err := c.GetAgentBlueprint(ctx, blueprintID, scope)
		if err != nil {
			return catalogBrowserLoadedMsg{kind: catalogKindAgentBlueprintDetail, errText: err.Error(), blueprintID: blueprintID}
		}
		return catalogBrowserLoadedMsg{
			kind:        catalogKindAgentBlueprintDetail,
			items:       agentBlueprintDetailItems(detail),
			blueprintID: blueprintID,
		}
	}
}

func activateAgentBlueprintCmd(c *client.Client, sessionID, blueprintID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		state, err := c.SetSessionAgentBlueprint(ctx, sessionID, gact.SetSessionAgentBlueprintRequest{BlueprintID: blueprintID})
		return agentBlueprintActivatedMsg{blueprintID: blueprintID, state: state, err: err}
	}
}

func enableAgentBlueprintMCPCmd(c *client.Client, scope client.RuntimeScope, blueprintID, descriptorID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		result, err := c.EnableAgentBlueprintMCP(ctx, blueprintID, descriptorID, gact.AgentBlueprintMCPEnableRequest{WorkspaceID: scope.WorkspaceID})
		return agentBlueprintMCPEnabledMsg{blueprintID: blueprintID, descriptorID: descriptorID, result: result, err: err}
	}
}

func enableAgentBlueprintHookCmd(c *client.Client, scope client.RuntimeScope, blueprintID, hookID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		result, err := c.EnableAgentBlueprintHook(ctx, blueprintID, hookID, gact.AgentBlueprintHookEnableRequest{
			WorkspaceID: scope.WorkspaceID,
			Trust:       true,
		})
		return agentBlueprintHookEnabledMsg{blueprintID: blueprintID, hookID: hookID, result: result, err: err}
	}
}

func updateAgentBlueprintCmd(c *client.Client, scope client.RuntimeScope, blueprintID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		result, err := c.UpdateAgentBlueprint(ctx, blueprintID, gact.AgentBlueprintUpdateRequest{WorkspaceID: scope.WorkspaceID, Scope: "workspace"})
		return agentBlueprintManagedMsg{blueprintID: blueprintID, action: "updated", result: result, err: err}
	}
}

func deleteAgentBlueprintCmd(c *client.Client, scope client.RuntimeScope, blueprintID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		result, err := c.DeleteAgentBlueprint(ctx, blueprintID, "workspace", scope.WorkspaceID)
		return agentBlueprintManagedMsg{blueprintID: blueprintID, action: "deleted", result: result, err: err}
	}
}

func refreshAgentBlueprintSourceCmd(c *client.Client, sourceID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		source, err := c.RefreshAgentBlueprintSource(ctx, sourceID)
		return agentBlueprintSourceManagedMsg{sourceID: sourceID, action: "refreshed", source: source, err: err}
	}
}

func deleteAgentBlueprintSourceCmd(c *client.Client, sourceID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		err := c.DeleteAgentBlueprintSource(ctx, sourceID)
		return agentBlueprintSourceManagedMsg{sourceID: sourceID, action: "deleted", err: err}
	}
}

func installAgentBlueprintFromSourceCmd(c *client.Client, scope client.RuntimeScope, sourceID, blueprintID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		result, err := c.InstallAgentBlueprint(ctx, gact.AgentBlueprintInstallRequest{
			SourceID:    sourceID,
			BlueprintID: blueprintID,
			Scope:       "workspace",
			WorkspaceID: scope.WorkspaceID,
		})
		return agentBlueprintManagedMsg{blueprintID: blueprintID, action: "installed", result: result, err: err}
	}
}

func (c *agentComponent) handleAgentBlueprintActivated(m agentBlueprintActivatedMsg) (tea.Model, tea.Cmd) {
	if m.err != nil {
		c.app.setHint("agent blueprint activation failed: " + operatorErrorMessage(m.err))
		return c.app, scheduleHintExpire(c.app.transientHint)
	}
	c.app.setHint("activated agent blueprint " + m.blueprintID)
	if m.state.Session != nil {
		if idx := c.app.session.indexByID(m.state.Session.ID); idx >= 0 {
			c.app.session.sessions[idx] = *m.state.Session
		}
	} else {
		c.app.session.applyAgentBlueprintState(m.state)
	}
	var cmd tea.Cmd
	if c.app.catalog.open && c.app.catalog.current != nil && c.app.catalog.current.kind == catalogKindAgentBlueprintDetail && c.app.catalog.current.blueprintID == m.blueprintID {
		cmd = loadAgentBlueprintDetailCmd(c.app.c, c.app.session.runtimeScope(), m.blueprintID)
	}
	return c.app, tea.Batch(scheduleHintExpire(c.app.transientHint), cmd)
}

func (c *agentComponent) handleAgentBlueprintMCPEnabled(m agentBlueprintMCPEnabledMsg) (tea.Model, tea.Cmd) {
	if m.err != nil {
		c.app.setHint("agent blueprint MCP enable failed: " + operatorErrorMessage(m.err))
		return c.app, scheduleHintExpire(c.app.transientHint)
	}
	c.app.setHint("enabled blueprint MCP " + m.descriptorID)
	return c.app, c.reloadAgentBlueprintDetailAfterAction(m.blueprintID)
}

func (c *agentComponent) handleAgentBlueprintHookEnabled(m agentBlueprintHookEnabledMsg) (tea.Model, tea.Cmd) {
	if m.err != nil {
		c.app.setHint("agent blueprint hook enable failed: " + operatorErrorMessage(m.err))
		return c.app, scheduleHintExpire(c.app.transientHint)
	}
	c.app.setHint("enabled blueprint hook " + m.hookID)
	return c.app, c.reloadAgentBlueprintDetailAfterAction(m.blueprintID)
}

func (c *agentComponent) handleAgentBlueprintManaged(m agentBlueprintManagedMsg) (tea.Model, tea.Cmd) {
	if m.err != nil {
		c.app.setHint(operatorFailureHint("agent blueprint", m.action, m.err))
		return c.app, scheduleHintExpire(c.app.transientHint)
	}
	c.app.setHint("agent blueprint " + m.action + ": " + m.blueprintID)
	var cmd tea.Cmd
	if c.app.catalog.open && c.app.catalog.current != nil {
		if m.action == "deleted" && c.app.catalog.current.kind == catalogKindAgentBlueprintDetail && c.app.catalog.current.blueprintID == m.blueprintID {
			c.app.catalog.close()
			return c.app, scheduleHintExpire(c.app.transientHint)
		}
		switch c.app.catalog.current.kind {
		case catalogKindAgentBlueprints:
			cmd = loadCatalogBrowserCmd(c.app.c, catalogKindAgentBlueprints, c.app.session.runtimeScope())
		case catalogKindAgentBlueprintDetail:
			cmd = loadAgentBlueprintDetailCmd(c.app.c, c.app.session.runtimeScope(), m.blueprintID)
		case catalogKindAgentBlueprintSources:
			cmd = loadCatalogBrowserCmd(c.app.c, catalogKindAgentBlueprintSources, c.app.session.runtimeScope())
		}
	}
	return c.app, tea.Batch(scheduleHintExpire(c.app.transientHint), cmd)
}

func (c *agentComponent) handleAgentBlueprintSourceManaged(m agentBlueprintSourceManagedMsg) (tea.Model, tea.Cmd) {
	if c.app.agentBlueprintManage.open && c.app.agentBlueprintManage.mode == agentBlueprintManageSource {
		c.app.agentBlueprintManage.saving = false
		if m.err != nil {
			c.app.agentBlueprintManage.err = operatorErrorMessage(m.err)
			return c.app, nil
		}
		c.app.agentBlueprintManage.close()
	}
	if m.err != nil {
		c.app.setHint(operatorFailureHint("marketplace source", m.action, m.err))
		return c.app, scheduleHintExpire(c.app.transientHint)
	}
	c.app.setHint("marketplace source " + m.action + ": " + m.sourceID)
	var cmd tea.Cmd
	if c.app.catalog.open && c.app.catalog.current != nil && c.app.catalog.current.kind == catalogKindAgentBlueprintSources {
		cmd = loadCatalogBrowserCmd(c.app.c, catalogKindAgentBlueprintSources, c.app.session.runtimeScope())
	}
	return c.app, tea.Batch(scheduleHintExpire(c.app.transientHint), cmd)
}

func (c *agentComponent) reloadAgentBlueprintDetailAfterAction(blueprintID string) tea.Cmd {
	var cmd tea.Cmd
	if c.app.catalog.open && c.app.catalog.current != nil && c.app.catalog.current.kind == catalogKindAgentBlueprintDetail && c.app.catalog.current.blueprintID == blueprintID {
		cmd = loadAgentBlueprintDetailCmd(c.app.c, c.app.session.runtimeScope(), blueprintID)
	}
	return tea.Batch(scheduleHintExpire(c.app.transientHint), cmd)
}
