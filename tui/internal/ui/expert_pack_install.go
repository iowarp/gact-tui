package ui

// expertPackInstallModal: the expert-pack install/update prompt overlay.

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/widget"
)

// expertPackInstallModal is the expert-pack install/update prompt's state: the
// source input plus inline error/saving status. It owns its behaviour and holds
// a back-reference to App for shared services.
type expertPackInstallModal struct {
	app    *App
	open   bool
	input  widget.TextInput
	err    string
	saving bool
}

func (m *expertPackInstallModal) reset() { *m = expertPackInstallModal{app: m.app} }

func (m *expertPackInstallModal) close() { m.reset() }

func (m *expertPackInstallModal) openModal() {
	m.open = true
	m.input.SetValue("")
	m.input.SetCursor(0)
	m.err = ""
	m.saving = false
}

func (m *expertPackInstallModal) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if m.saving {
		return m.app, nil
	}
	switch k.String() {
	case "esc":
		m.close()
		return m.app, nil
	case "enter":
		source := strings.TrimSpace(m.input.Value())
		if source == "" {
			m.err = "install source is required"
			return m.app, nil
		}
		m.saving = true
		return m.app, installExpertPackCmd(m.app.c, m.app.session.runtimeScope(), source)
	}
	m.input.HandleKey(k)
	return m.app, nil
}

func (m *expertPackInstallModal) insert(text string) {
	if text == "" {
		return
	}
	m.input.Insert(strings.TrimRight(strings.ReplaceAll(text, "\r\n", "\n"), "\n"))
	m.err = ""
}

func installExpertPackCmd(c *client.Client, scope client.RuntimeScope, source string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		result, err := c.InstallExpertPack(ctx, gact.ExpertPackInstallRequest{
			Source:      source,
			Scope:       "workspace",
			WorkspaceID: scope.WorkspaceID,
		})
		return expertPackManagedMsg{action: "install", result: result, err: err}
	}
}

func (m *expertPackInstallModal) view() string {
	a := m.app
	t := a.Theme
	statusRows := a.modals.modalStatusRows(m.err, m.saving, "installing...")
	rendered := a.modals.renderTextEntryModal(a.modals.withInputEditor(textEntryModalOptions{
		width:     a.modals.modalWidth(),
		title:     "Install expert pack",
		surfaceID: "expert-pack-install",
		intro: []string{
			"Enter a local pack directory, git URL, archive URL, or marketplace source.",
			"Installs into the current workspace; reopen or refresh this catalog to inspect and activate it.",
		},
		buttons: []menuButton{{
			id:    "expert-pack-install:install",
			label: "install",
			action: func(app *App) tea.Cmd {
				_, cmd := app.expertPackInstall.handleKey(keyMsg("enter"))
				return cmd
			},
		}, {
			id:    "expert-pack-install:cancel",
			label: "cancel",
			action: func(app *App) tea.Cmd {
				app.expertPackInstall.close()
				return nil
			},
		}},
		status: statusRows,
		footer: t.HintLabel.Render(modalKeyHint("Enter install", "Esc cancel")),
	}, "expert-pack-install", &m.input))
	return rendered.modal
}
