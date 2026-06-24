package ui

// mcpInstallModal: the one-line MCP-server install prompt overlay.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/widget"
)

type mcpInstallExample struct {
	id    string
	label string
	value string
}

// mcpInstallModal is the one-line MCP-install prompt's state: the source input
// plus inline error/saving status. It owns its behaviour and holds a
// back-reference to App for shared services.
type mcpInstallModal struct {
	app    *App
	open   bool
	input  widget.TextInput
	err    string
	saving bool
}

func (m *mcpInstallModal) reset() { *m = mcpInstallModal{app: m.app} }

func (m *mcpInstallModal) close() { m.reset() }

// open arms the install prompt overlay.
func (m *mcpInstallModal) openModal() {
	m.open = true
	m.input.SetValue("")
	m.input.SetCursor(0)
	m.err = ""
	m.saving = false
}

// handleKey routes keystrokes while the install modal is open.
func (m *mcpInstallModal) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if m.saving {
		return m.app, nil
	}
	switch k.String() {
	case "esc":
		m.close()
		return m.app, nil
	case "enter":
		body, err := parseMcpInstallLine(m.input.Value())
		if err != nil {
			m.err = err.Error()
			return m.app, nil
		}
		m.saving = true
		return m.app, mcpInstallCmd(m.app.c, body)
	}
	m.input.HandleKey(k)
	return m.app, nil
}

func (m *mcpInstallModal) insert(text string) {
	m.input.Insert(text)
}

func mcpInstallExamples() []mcpInstallExample {
	return []mcpInstallExample{
		{id: "stdio", label: "stdio:", value: "files stdio mcp-files /tmp"},
		{id: "http", label: "http:", value: "weather http https://mcp.example.com"},
	}
}

func (m *mcpInstallModal) applyExample(value string) {
	m.input.SetValue(value)
	m.input.SetCursor(len([]rune(value)))
	m.err = ""
}

func (m *mcpInstallModal) renderExampleList() modalListRender {
	examples := mcpInstallExamples()
	rows := make([]string, 0, len(examples))
	hits := make([]modalListHit, 0, len(examples))
	for row, example := range examples {
		example := example
		rows = append(rows, fmt.Sprintf("  %-6s %s", example.label, example.value))
		hits = append(hits, modalListHit{
			id:     "mcp-install:example:" + example.id,
			row:    row,
			height: 1,
			action: func(app *App) tea.Cmd {
				app.mcpInstall.applyExample(example.value)
				return nil
			},
		})
	}
	return modalListRender{rows: rows, hits: hits, renderedItems: len(rows)}
}

// view renders the install prompt overlay. Tiny intentionally —
// one input field, hint text, and a status line for any error.
func (m *mcpInstallModal) view() string {
	a := m.app
	t := a.Theme
	w := a.modals.modalWidth()
	innerW := modalInnerWidth(w)
	buttons := []menuButton{
		{
			id:    "mcp-install:install",
			label: "install",
			action: func(app *App) tea.Cmd {
				_, cmd := app.mcpInstall.handleKey(keyMsg("enter"))
				return cmd
			},
		},
		{
			id:    "mcp-install:cancel",
			label: "cancel",
			action: func(app *App) tea.Cmd {
				app.mcpInstall.close()
				return nil
			},
		},
	}
	statusRows := a.modals.modalStatusRows(m.err, m.saving, "installing…")
	exampleList := m.renderExampleList()
	rendered := a.modals.renderTextEntryModal(a.modals.withInputEditor(textEntryModalOptions{
		width:     w,
		title:     "Install MCP connection",
		buttons:   buttons,
		surfaceID: "mcp-install",
		intro: []string{
			t.HintLabel.Render("Add a trusted third-party MCP connection to the current workspace."),
			t.HintLabel.Render("Format: <name> stdio <command> [args...]  or  <name> http <url>"),
			"",
			t.HintLabel.Render(strings.Join(exampleList.rows, "\n")),
		},
		introList:  exampleList,
		introListW: innerW,
		status:     statusRows,
		footer:     t.HintLabel.Render(modalKeyHint("Enter install", "Esc cancel")),
	}, "mcp-install", &m.input))
	return rendered.modal
}
