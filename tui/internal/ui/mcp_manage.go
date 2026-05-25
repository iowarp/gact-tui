package ui

// mcp_manage.go — install/uninstall flows for third-party MCP servers.
// Shells out to the backend's POST /v1/mcp/servers + DELETE /v1/mcp/servers/{id}
// endpoints (already wired in CLIO; new in this round).
//
// Install path: lightweight inline modal that takes one line of text in the
// shape `<name> stdio <command> <args...>` or `<name> http <url>`.
// Remove path: lists currently-installed third-party servers and removes the
// one the user picks. Bundled in-process servers (mcp_fs/hdf5/parquet) are
// excluded — backend rejects DELETE on those anyway.

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// openMcpInstallModal arms the install prompt overlay. The actual modal
// state lives on App.mcpInstall — see app.go for the field declaration.
func (a *App) openMcpInstallModal() {
	a.mcpInstallOpen = true
	a.mcpInstallInput = ""
	a.mcpInstallErr = ""
	a.mcpInstallSaving = false
}

func (a *App) closeMcpInstallModal() {
	a.mcpInstallOpen = false
	a.mcpInstallInput = ""
	a.mcpInstallErr = ""
	a.mcpInstallSaving = false
}

// openMcpRemoveModal opens the remove picker. Always re-fetches the server
// list so the picker reflects current backend state (catalog cache may be
// stale after a recent install/remove). Returns a tea.Cmd that triggers
// the fetch; the resulting message populates a.mcpRemoveOptions.
func (a *App) openMcpRemoveModal() tea.Cmd {
	a.mcpRemoveOpen = true
	a.mcpRemoveOptions = nil
	a.mcpRemoveSel = 0
	a.mcpRemoveSaving = false
	return mcpListServersCmd(a.c)
}

func (a *App) closeMcpRemoveModal() {
	a.mcpRemoveOpen = false
	a.mcpRemoveOptions = nil
	a.mcpRemoveSel = 0
	a.mcpRemoveSaving = false
}

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

// handleMcpInstallKey routes keystrokes while the install modal is open.
func (a *App) handleMcpInstallKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if a.mcpInstallSaving {
		return a, nil
	}
	switch k.String() {
	case "esc":
		a.closeMcpInstallModal()
		return a, nil
	case "enter":
		body, err := parseMcpInstallLine(a.mcpInstallInput)
		if err != nil {
			a.mcpInstallErr = err.Error()
			return a, nil
		}
		a.mcpInstallSaving = true
		return a, mcpInstallCmd(a.c, body)
	case "backspace":
		if len(a.mcpInstallInput) > 0 {
			a.mcpInstallInput = a.mcpInstallInput[:len(a.mcpInstallInput)-1]
		}
		return a, nil
	default:
		if k.Text != "" {
			a.mcpInstallInput += k.Text
		}
	}
	return a, nil
}

// handleMcpRemoveKey routes keystrokes while the remove modal is open.
func (a *App) handleMcpRemoveKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if a.mcpRemoveSaving {
		return a, nil
	}
	switch k.String() {
	case "esc":
		a.closeMcpRemoveModal()
		return a, nil
	case "up", "k":
		if a.mcpRemoveSel > 0 {
			a.mcpRemoveSel--
		}
	case "down", "j":
		if a.mcpRemoveSel < len(a.mcpRemoveOptions)-1 {
			a.mcpRemoveSel++
		}
	case "enter":
		if a.mcpRemoveSel < 0 || a.mcpRemoveSel >= len(a.mcpRemoveOptions) {
			return a, nil
		}
		target := a.mcpRemoveOptions[a.mcpRemoveSel]
		a.mcpRemoveSaving = true
		return a, mcpUninstallCmd(a.c, target.ID)
	}
	return a, nil
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

type mcpInstallDoneMsg struct {
	result map[string]any
	err    error
}

type mcpUninstallDoneMsg struct {
	serverID string
	err      error
}

// viewMcpInstall renders the install prompt overlay. Tiny intentionally —
// one input field, hint text, and a status line for any error.
func (a *App) viewMcpInstall() string {
	t := a.Theme
	w := a.modalWidth()
	buttons := []menuButton{
		{
			id:    "mcp-install:install",
			label: "install",
			action: func(app *App) tea.Cmd {
				_, cmd := app.handleMcpInstallKey(keyMsg("enter"))
				return cmd
			},
		},
		{
			id:    "mcp-install:cancel",
			label: "cancel",
			action: func(app *App) tea.Cmd {
				app.closeMcpInstallModal()
				return nil
			},
		},
	}
	title := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render("Install MCP server")
	hint := t.HintLabel.Render(
		"  stdio: files stdio mcp-files /tmp\n" +
			"  http:  weather http https://mcp.example.com")
	cursor := "_"
	box := lipgloss.NewStyle().Foreground(t.Fg).
		Render("> " + a.mcpInstallInput + cursor)
	rows := []string{
		title, "",
		hint, "",
		box, "",
	}
	if a.mcpInstallErr != "" {
		rows = append(rows,
			lipgloss.NewStyle().Foreground(t.Danger).Italic(true).
				Render("error: "+a.mcpInstallErr),
			"",
		)
	}
	if a.mcpInstallSaving {
		rows = append(rows,
			lipgloss.NewStyle().Foreground(t.Warning).Italic(true).
				Render(a.spinnerChar()+" installing…"),
			"",
		)
	}
	var actionRow int
	rows, actionRow = a.appendModalActionRow(rows, buttons, 0)
	rows = append(rows, "",
		t.HintLabel.Render("Enter install · Esc cancel"),
	)
	modal := a.renderDefaultModalSurface(w, strings.Join(rows, "\n"))
	a.registerModalActionRow(modal, actionRow, buttons)
	return modal
}

// viewMcpRemove renders the picker for which third-party server to remove.
func (a *App) viewMcpRemove() string {
	t := a.Theme
	w := a.modalWidth()
	buttons := []menuButton{
		{
			id:    "mcp-remove:remove",
			label: "remove",
			action: func(app *App) tea.Cmd {
				_, cmd := app.handleMcpRemoveKey(keyMsg("enter"))
				return cmd
			},
		},
		{
			id:    "mcp-remove:cancel",
			label: "cancel",
			action: func(app *App) tea.Cmd {
				app.closeMcpRemoveModal()
				return nil
			},
		},
	}
	title := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render("Remove MCP server")
	rows := []string{title, ""}
	listStartRow := len(rows)
	listItems := make([]modalListItem, 0, len(a.mcpRemoveOptions))
	for i, server := range a.mcpRemoveOptions {
		idx := i
		listItems = append(listItems, modalListItem{
			id:          fmt.Sprintf("mcp-remove:item:%d", idx),
			title:       server.Name,
			description: server.ID,
			status:      server.Transport,
			selected:    i == a.mcpRemoveSel,
			action: func(app *App) tea.Cmd {
				app.mcpRemoveSel = idx
				_, cmd := app.handleMcpRemoveKey(keyMsg("enter"))
				return cmd
			},
		})
	}
	list := a.renderModalList(listItems, modalListOptions{
		width:            w - 4,
		rowBudget:        12,
		descriptionLines: 1,
	})
	if len(list.rows) > 0 {
		rows = append(rows, list.rows...)
	} else {
		rows = append(rows, t.HintLabel.Render("(no removable MCP servers)"))
	}
	if a.mcpRemoveSaving {
		rows = append(rows, "",
			lipgloss.NewStyle().Foreground(t.Warning).Italic(true).
				Render(a.spinnerChar()+" removing…"),
		)
	}
	rows = append(rows, "")
	var actionRow int
	rows, actionRow = a.appendModalActionRow(rows, buttons, 0)
	rows = append(rows, "",
		t.HintLabel.Render("↑/↓ select · Enter remove · Esc cancel"),
	)
	modal := a.renderDefaultModalSurface(w, strings.Join(rows, "\n"))
	if len(list.hits) > 0 {
		a.registerModalListHits(modal, listStartRow, 0, w-4, list.hits)
	}
	a.registerModalActionRow(modal, actionRow, buttons)
	return modal
}
