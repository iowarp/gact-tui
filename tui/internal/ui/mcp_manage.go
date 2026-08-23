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
	"fmt"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// mcpRemoveModal is the MCP-remove picker's state: the fetched server options,
// the selected row, a saving guard, and the id pending delete-confirmation. It
// owns its behaviour (open/close/key/wheel/view) and holds an app back-ref for
// shared services, wired centrally in wireComponents().
type mcpRemoveModal struct {
	app       *App
	open      bool
	options   []gact.McpServer
	sel       int
	saving    bool
	confirmID string
}

func (m *mcpRemoveModal) reset() { *m = mcpRemoveModal{app: m.app} }

// openPicker opens the remove picker. Always re-fetches the server list so the
// picker reflects current backend state (catalog cache may be stale after a
// recent install/remove). Returns a tea.Cmd that triggers the fetch; the
// resulting message populates m.options.
func (m *mcpRemoveModal) openPicker() tea.Cmd {
	m.open = true
	m.options = nil
	m.sel = 0
	m.saving = false
	m.confirmID = ""
	return mcpListServersCmd(m.app.c)
}

func (m *mcpRemoveModal) close() { m.reset() }

func (m *mcpRemoveModal) handleWheel(button tea.MouseButton) tea.Cmd {
	if m.saving {
		return nil
	}
	m.sel = moveSelectionByWheel(m.sel, len(m.options), button)
	return nil
}

// handleKey routes keystrokes while the remove modal is open.
func (m *mcpRemoveModal) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if m.saving {
		return m.app, nil
	}
	switch k.String() {
	case "esc":
		m.close()
		return m.app, nil
	case "up", "k":
		m.confirmID = ""
		if m.sel > 0 {
			m.sel--
		}
	case "down", "j":
		m.confirmID = ""
		if m.sel < len(m.options)-1 {
			m.sel++
		}
	case "enter":
		if m.sel < 0 || m.sel >= len(m.options) {
			return m.app, nil
		}
		target := m.options[m.sel]
		if m.confirmID != target.ID {
			m.confirmID = target.ID
			m.app.setHint("press Enter again to confirm removing MCP " + target.ID + " (any other key cancels)")
			return m.app, scheduleHintExpire(m.app.transientHint)
		}
		m.confirmID = ""
		m.saving = true
		return m.app, mcpUninstallCmd(m.app.c, target.ID)
	default:
		m.confirmID = ""
	}
	return m.app, nil
}

const mcpRemoveMaxItems = 6

// view renders the picker for which third-party server to remove.
func (m *mcpRemoveModal) view() string {
	a := m.app
	t := a.Theme
	w := a.modals.modalWidth()
	listW := modalInsetListWidth(w)
	removeLabel := "remove"
	if m.confirmID != "" {
		removeLabel = "confirm remove"
	}
	buttons := []menuButton{
		{
			id:    "mcp-remove:remove",
			label: removeLabel,
			action: func(app *App) tea.Cmd {
				_, cmd := app.mcpRemove.handleKey(keyMsg("enter"))
				return cmd
			},
		},
		{
			id:    "mcp-remove:cancel",
			label: "cancel",
			action: func(app *App) tea.Cmd {
				app.mcpRemove.close()
				return nil
			},
		},
	}
	rows := []string{}
	rows = append(rows,
		t.HintLabel.Render("Remove custom MCP connections from the current workspace."),
		t.HintLabel.Render("Bundled "+brandName()+" connections stay available and are not listed here."),
		"",
	)
	itemBudget := a.modals.modalListItemBudget(6, 1, mcpRemoveMaxItems)
	win := selectedItemWindow(len(m.options), m.sel, itemBudget)
	listStartRow := len(rows)
	listItems := make([]modalListItem, 0, win.end-win.start)
	for i := win.start; i < win.end; i++ {
		server := m.options[i]
		idx := i
		listItems = append(listItems, modalListItem{
			id:       fmt.Sprintf("mcp-remove:item:%d", idx),
			title:    server.Name,
			meta:     server.ID,
			status:   m.rowStatus(server),
			selected: i == m.sel,
			action: func(app *App) tea.Cmd {
				if app.mcpRemove.confirmID != server.ID {
					app.mcpRemove.confirmID = ""
				}
				app.mcpRemove.sel = idx
				_, cmd := app.mcpRemove.handleKey(keyMsg("enter"))
				return cmd
			},
		})
	}
	list := a.modals.renderModalList(listItems, modalListOptions{
		width:            listW,
		rowBudget:        itemBudget,
		descriptionLines: 0,
	})
	if len(list.rows) > 0 {
		rows = append(rows, list.rows...)
	} else {
		rows = append(rows, t.HintLabel.Render("(no removable MCP connections)"))
	}
	if m.saving {
		rows = append(rows, "",
			lipgloss.NewStyle().Foreground(t.Warning).Italic(true).
				Render(a.ticker.spinnerChar()+" removing…"),
		)
	} else if m.confirmID != "" {
		rows = append(rows, "",
			t.HintLabel.Render("Confirm removing "+m.confirmID+". Any other key cancels."),
		)
	}
	footer := modalKeyHint("↑/↓ select", "Enter remove", "Esc cancel")
	if m.confirmID != "" {
		footer = modalKeyHint("Enter confirm remove", "↑/↓ cancel", "Esc cancel")
	}

	rendered := a.modals.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   "Remove MCP connection",
			buttons: buttons,
			footer:  t.HintLabel.Render(footer),
		},
		rows:           rows,
		list:           list,
		listStart:      listStartRow,
		listWidth:      listW,
		bodyRows:       itemBudget * 2,
		window:         win,
		wheelID:        "mcp-remove:list:wheel",
		surfaceWheelID: "mcp-remove",
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			return app.mcpRemove.handleWheel(button)
		},
		railAction: func(app *App, index int) tea.Cmd {
			app.mcpRemove.sel = clampSelection(index, len(app.mcpRemove.options))
			return nil
		},
	})
	return rendered.modal
}

func (m *mcpRemoveModal) rowStatus(server gact.McpServer) string {
	if m.confirmID == server.ID {
		return "confirm remove"
	}
	return server.Transport
}
