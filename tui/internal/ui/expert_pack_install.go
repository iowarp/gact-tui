package ui

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func (a *App) openExpertPackInstall() {
	a.expertPackInstallOpen = true
	a.expertPackInstallInput = ""
	a.expertPackInstallCursor = 0
	a.expertPackInstallErr = ""
	a.expertPackInstallSaving = false
}

func (a *App) closeExpertPackInstall() {
	a.expertPackInstallOpen = false
	a.expertPackInstallInput = ""
	a.expertPackInstallCursor = 0
	a.expertPackInstallErr = ""
	a.expertPackInstallSaving = false
}

func (a *App) handleExpertPackInstallKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if a.expertPackInstallSaving {
		return a, nil
	}
	switch k.String() {
	case "esc":
		a.closeExpertPackInstall()
		return a, nil
	case "enter":
		source := strings.TrimSpace(a.expertPackInstallInput)
		if source == "" {
			a.expertPackInstallErr = "install source is required"
			return a, nil
		}
		a.expertPackInstallSaving = true
		return a, installExpertPackCmd(a.c, a.runtimeScope(), source)
	case "backspace":
		if a.expertPackInstallCursor == 0 {
			return a, nil
		}
		runes := []rune(a.expertPackInstallInput)
		runes = append(runes[:a.expertPackInstallCursor-1], runes[a.expertPackInstallCursor:]...)
		a.expertPackInstallInput = string(runes)
		a.expertPackInstallCursor--
	case "delete":
		runes := []rune(a.expertPackInstallInput)
		if a.expertPackInstallCursor >= len(runes) {
			return a, nil
		}
		runes = append(runes[:a.expertPackInstallCursor], runes[a.expertPackInstallCursor+1:]...)
		a.expertPackInstallInput = string(runes)
	case "left":
		if a.expertPackInstallCursor > 0 {
			a.expertPackInstallCursor--
		}
	case "right":
		if a.expertPackInstallCursor < len([]rune(a.expertPackInstallInput)) {
			a.expertPackInstallCursor++
		}
	case "home", "ctrl+a":
		a.expertPackInstallCursor = 0
	case "end", "ctrl+e":
		a.expertPackInstallCursor = len([]rune(a.expertPackInstallInput))
	default:
		text := k.Text
		if text == "" {
			if runes := []rune(k.String()); len(runes) == 1 {
				text = string(runes)
			}
		}
		a.insertExpertPackInstallText(text)
	}
	return a, nil
}

func (a *App) insertExpertPackInstallText(text string) {
	if text == "" {
		return
	}
	a.expertPackInstallInput, a.expertPackInstallCursor = insertTextAtCursor(
		a.expertPackInstallInput,
		a.expertPackInstallCursor,
		strings.TrimRight(strings.ReplaceAll(text, "\r\n", "\n"), "\n"),
	)
	a.expertPackInstallErr = ""
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

func (a *App) viewExpertPackInstall() string {
	t := a.Theme
	statusRows := []string{}
	if a.expertPackInstallErr != "" {
		statusRows = append(statusRows, lipgloss.NewStyle().Foreground(t.Danger).Italic(true).Render("error: "+a.expertPackInstallErr))
	}
	if a.expertPackInstallSaving {
		statusRows = append(statusRows, lipgloss.NewStyle().Foreground(t.Warning).Italic(true).Render(a.spinnerChar()+" installing..."))
	}
	rendered := a.renderTextEntryModal(textEntryModalOptions{
		width:     a.modalWidth(),
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
				_, cmd := app.handleExpertPackInstallKey(keyMsg("enter"))
				return cmd
			},
		}, {
			id:    "expert-pack-install:cancel",
			label: "cancel",
			action: func(app *App) tea.Cmd {
				app.closeExpertPackInstall()
				return nil
			},
		}},
		editor:      a.renderCursorEditor(a.expertPackInstallInput, a.expertPackInstallCursor),
		editorID:    "expert-pack-install",
		editorValue: a.expertPackInstallInput,
		cursorAction: func(app *App, cursor int) {
			app.expertPackInstallCursor = cursor
		},
		status: statusRows,
		footer: t.HintLabel.Render(modalKeyHint("Enter install", "Esc cancel")),
	})
	return rendered.modal
}
