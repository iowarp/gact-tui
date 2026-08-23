package ui

// mcp_manage_commands.go defines MCP list/install/uninstall/reconnect commands and their messages.

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// mcpListServersCmd refreshes the cached MCP server list. Used by both the
// remove modal and the cache-on-open path.
func mcpListServersCmd(c *client.Client) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		servers, err := c.ListMcpServers(ctx)
		return mcpServersFetchedMsg{servers: servers, err: err}
	}
}

type mcpServersFetchedMsg struct {
	servers []gact.McpServer
	err     error
}

// parseMcpInstallLine parses one line of user input into the request body
// the backend expects. Supported shapes:
//
//	<name> stdio <command> [args...]
//	<name> http <url>
func parseMcpInstallLine(line string) (map[string]any, error) {
	tokens := strings.Fields(strings.TrimSpace(line))
	if len(tokens) < 3 {
		return nil, fmt.Errorf("usage: <name> stdio <command> [args...]  OR  <name> http <url>")
	}
	name := tokens[0]
	transport := strings.ToLower(tokens[1])
	switch transport {
	case "stdio":
		body := map[string]any{
			"name":      name,
			"transport": "stdio",
			"command":   tokens[2],
		}
		if len(tokens) > 3 {
			body["args"] = tokens[3:]
		}
		return body, nil
	case "http":
		if len(tokens) != 3 {
			return nil, fmt.Errorf("http transport: <name> http <url>")
		}
		return map[string]any{
			"name":      name,
			"transport": "http",
			"url":       tokens[2],
		}, nil
	default:
		return nil, fmt.Errorf("unknown transport %q (use stdio or http)", transport)
	}
}

// mcpInstallCmd POSTs the install request and returns a result message the
// app loop converts to a transientHint + catalog refresh.
func mcpInstallCmd(c *client.Client, body map[string]any) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		out, err := c.McpInstall(ctx, body)
		return mcpInstallDoneMsg{result: out, err: err}
	}
}

// mcpUninstallCmd DELETEs the server and returns a result message.
func mcpUninstallCmd(c *client.Client, serverID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		err := c.McpUninstall(ctx, serverID)
		return mcpUninstallDoneMsg{serverID: serverID, err: err}
	}
}

func mcpReconnectCmd(c *client.Client, serverID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		err := c.McpReconnect(ctx, serverID)
		return mcpReconnectDoneMsg{serverID: serverID, err: err}
	}
}

type mcpInstallDoneMsg struct {
	result map[string]any
	err    error
}

type mcpUninstallDoneMsg struct {
	serverID string
	err      error
}

type mcpReconnectDoneMsg struct {
	serverID string
	err      error
}

func (m *mcpRemoveModal) handleServersFetched(msg mcpServersFetchedMsg) (tea.Model, tea.Cmd) {
	a := m.app
	a.mcpServers = msg.servers
	if m.open {
		m.saving = false
		m.confirmID = ""
		if msg.err != nil {
			a.setHint("mcp list failed: " + msg.err.Error())
			m.open = false
			return a, scheduleHintExpire(a.transientHint)
		}
		var removable []gact.McpServer
		for _, s := range msg.servers {
			if s.Transport == "in_process" {
				continue
			}
			removable = append(removable, s)
		}
		m.options = removable
		if len(removable) == 0 {
			m.open = false
			a.setHint("no third-party MCPs installed (bundled servers cannot be removed)")
			return a, scheduleHintExpire(a.transientHint)
		}
	}
	return a, nil
}

func (m *mcpInstallModal) handleInstallDone(msg mcpInstallDoneMsg) (tea.Model, tea.Cmd) {
	a := m.app
	m.saving = false
	if msg.err != nil {
		m.err = msg.err.Error()
		return a, nil
	}
	m.open = false
	m.input.SetValue("")
	m.input.SetCursor(0)
	m.err = ""
	name, _ := msg.result["name"].(string)
	id, _ := msg.result["id"].(string)
	a.setHint(fmt.Sprintf("installed MCP %s (%s)", name, id))
	return a, tea.Batch(scheduleHintExpire(a.transientHint), mcpListServersCmd(a.c))
}

func (m *mcpRemoveModal) handleUninstallDone(msg mcpUninstallDoneMsg) (tea.Model, tea.Cmd) {
	a := m.app
	m.saving = false
	if msg.err != nil {
		a.setHint("MCP remove failed: " + operatorErrorMessage(msg.err))
		return a, scheduleHintExpire(a.transientHint)
	}
	a.setHint("removed " + msg.serverID)
	m.open = false
	m.options = nil
	return a, tea.Batch(scheduleHintExpire(a.transientHint), mcpListServersCmd(a.c))
}

func (m *mcpRemoveModal) handleReconnectDone(msg mcpReconnectDoneMsg) (tea.Model, tea.Cmd) {
	a := m.app
	if msg.err != nil {
		a.setHint("MCP reconnect failed: " + operatorErrorMessage(msg.err))
		return a, scheduleHintExpire(a.transientHint)
	}
	a.setHint("MCP connection reconnected: " + msg.serverID)
	cmds := []tea.Cmd{scheduleHintExpire(a.transientHint), mcpListServersCmd(a.c)}
	if a.catalog.open && a.catalog.current != nil &&
		a.catalog.current.kind == catalogKindMcpDetail &&
		a.catalog.current.mcpServerID == msg.serverID {
		cmds = append(cmds, loadMcpDetailCmd(a.c, a.session.runtimeScope(), msg.serverID))
	}
	return a, tea.Batch(cmds...)
}
