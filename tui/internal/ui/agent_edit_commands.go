package ui

// agent_edit_commands.go defines the agent edit-load/edited messages and their load/update backend commands and handlers.

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

type agentLoadedForEditMsg struct {
	agent gact.AgentDef
	err   error
}

type agentEditedMsg struct {
	agent gact.AgentDef
	err   error
}

func (c *agentComponent) handleAgentLoadedForEdit(m agentLoadedForEditMsg) (tea.Model, tea.Cmd) {
	if m.err != nil {
		c.app.setHint("agent edit failed: " + operatorErrorMessage(m.err))
		return c.app, scheduleHintExpire(c.app.transientHint)
	}
	if m.agent.Source != "user" {
		c.app.setHint("only user-owned agents can be edited")
		return c.app, scheduleHintExpire(c.app.transientHint)
	}
	c.app.agentEdit.openModal(m.agent)
	return c.app, nil
}

func (c *agentComponent) handleAgentEdited(m agentEditedMsg) (tea.Model, tea.Cmd) {
	c.app.agentEdit.saving = false
	if m.err != nil {
		c.app.agentEdit.err = operatorErrorMessage(m.err)
		return c.app, nil
	}
	agentID := valuefmt.FirstNonEmpty(m.agent.ID, c.app.agentEdit.original)
	c.app.agentEdit.close()
	c.app.setHint("updated expert " + agentID)
	var cmd tea.Cmd
	if c.app.catalog.open && c.app.catalog.current != nil {
		switch c.app.catalog.current.kind {
		case catalogKindAgents:
			cmd = loadCatalogBrowserCmd(c.app.c, catalogKindAgents, c.app.session.runtimeScope())
		case catalogKindAgentDetail:
			cmd = loadAgentDetailCmd(c.app.c, agentID, c.app.session.runtimeScope())
		}
	}
	return c.app, tea.Batch(scheduleHintExpire(c.app.transientHint), cmd)
}

func loadAgentForEditCmd(c *client.Client, scope client.RuntimeScope, agentID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		agent, err := c.GetAgentScoped(ctx, agentID, scope)
		return agentLoadedForEditMsg{agent: agent, err: err}
	}
}

func updateAgentCmd(c *client.Client, agentID string, agent gact.AgentDef) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		updated, err := c.UpdateAgent(ctx, agentID, agent)
		return agentEditedMsg{agent: updated, err: err}
	}
}
