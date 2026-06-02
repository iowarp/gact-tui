package ui

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

const (
	agentBlueprintManageInstall  = "install"
	agentBlueprintManageValidate = "validate"
)

type agentBlueprintManageDoneMsg struct {
	action string
	source string
	result map[string]any
	check  gact.AgentBlueprintValidationResult
	err    error
}

func (a *App) openAgentBlueprintManage(mode string) {
	a.agentBlueprintManageOpen = true
	a.agentBlueprintManageMode = mode
	a.agentBlueprintManageInput = ""
	a.agentBlueprintManageCursor = 0
	a.agentBlueprintManageErr = ""
	a.agentBlueprintManageSaving = false
}

func (a *App) closeAgentBlueprintManage() {
	a.agentBlueprintManageOpen = false
	a.agentBlueprintManageMode = ""
	a.agentBlueprintManageInput = ""
	a.agentBlueprintManageCursor = 0
	a.agentBlueprintManageErr = ""
	a.agentBlueprintManageSaving = false
}

func (a *App) handleAgentBlueprintManageKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if a.agentBlueprintManageSaving {
		return a, nil
	}
	switch k.String() {
	case "esc":
		a.closeAgentBlueprintManage()
		return a, nil
	case "enter":
		source := strings.TrimSpace(a.agentBlueprintManageInput)
		if source == "" {
			a.agentBlueprintManageErr = a.agentBlueprintManageMode + " path/source is required"
			return a, nil
		}
		a.agentBlueprintManageSaving = true
		if a.agentBlueprintManageMode == agentBlueprintManageValidate {
			return a, validateAgentBlueprintCmd(a.c, a.runtimeScope(), source)
		}
		return a, installAgentBlueprintCmd(a.c, a.runtimeScope(), source)
	case "backspace":
		if a.agentBlueprintManageCursor == 0 {
			return a, nil
		}
		runes := []rune(a.agentBlueprintManageInput)
		runes = append(runes[:a.agentBlueprintManageCursor-1], runes[a.agentBlueprintManageCursor:]...)
		a.agentBlueprintManageInput = string(runes)
		a.agentBlueprintManageCursor--
	case "delete":
		runes := []rune(a.agentBlueprintManageInput)
		if a.agentBlueprintManageCursor >= len(runes) {
			return a, nil
		}
		runes = append(runes[:a.agentBlueprintManageCursor], runes[a.agentBlueprintManageCursor+1:]...)
		a.agentBlueprintManageInput = string(runes)
	case "left":
		if a.agentBlueprintManageCursor > 0 {
			a.agentBlueprintManageCursor--
		}
	case "right":
		if a.agentBlueprintManageCursor < len([]rune(a.agentBlueprintManageInput)) {
			a.agentBlueprintManageCursor++
		}
	case "home", "ctrl+a":
		a.agentBlueprintManageCursor = 0
	case "end", "ctrl+e":
		a.agentBlueprintManageCursor = len([]rune(a.agentBlueprintManageInput))
	default:
		text := k.Text
		if text == "" {
			if runes := []rune(k.String()); len(runes) == 1 {
				text = string(runes)
			}
		}
		a.insertAgentBlueprintManageText(text)
	}
	return a, nil
}

func (a *App) insertAgentBlueprintManageText(text string) {
	if text == "" {
		return
	}
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.TrimRight(text, "\n")
	runes := []rune(a.agentBlueprintManageInput)
	a.agentBlueprintManageCursor = clampAgentBlueprintCursor(a.agentBlueprintManageCursor, len(runes))
	insert := []rune(text)
	out := make([]rune, 0, len(runes)+len(insert))
	out = append(out, runes[:a.agentBlueprintManageCursor]...)
	out = append(out, insert...)
	out = append(out, runes[a.agentBlueprintManageCursor:]...)
	a.agentBlueprintManageInput = string(out)
	a.agentBlueprintManageCursor += len(insert)
	a.agentBlueprintManageErr = ""
}

func clampAgentBlueprintCursor(cursor, maxLen int) int {
	if cursor < 0 {
		return 0
	}
	if cursor > maxLen {
		return maxLen
	}
	return cursor
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

func (a *App) viewAgentBlueprintManage() string {
	t := a.Theme
	w := a.modalWidth()
	mode := a.agentBlueprintManageMode
	title := "Install agent blueprint"
	verb := "install"
	intro := []string{
		"Enter a local directory, AGENT.md path, git URL, or marketplace source.",
		"Installs into the current workspace and reloads the blueprint catalog.",
	}
	if mode == agentBlueprintManageValidate {
		title = "Validate agent blueprint"
		verb = "validate"
		intro = []string{
			"Enter a local directory or AGENT.md path.",
			"Validation previews the parsed blueprint, agents, MCP descriptors, and errors without installing it.",
		}
	}
	buttons := []menuButton{{
		id:    "agent-blueprint-manage:" + verb,
		label: verb,
		action: func(app *App) tea.Cmd {
			_, cmd := app.handleAgentBlueprintManageKey(keyMsg("enter"))
			return cmd
		},
	}, {
		id:    "agent-blueprint-manage:cancel",
		label: "cancel",
		action: func(app *App) tea.Cmd {
			app.closeAgentBlueprintManage()
			return nil
		},
	}}
	statusRows := []string{}
	if a.agentBlueprintManageErr != "" {
		statusRows = append(statusRows, lipgloss.NewStyle().Foreground(t.Danger).Italic(true).Render("error: "+a.agentBlueprintManageErr))
	}
	if a.agentBlueprintManageSaving {
		statusRows = append(statusRows, lipgloss.NewStyle().Foreground(t.Warning).Italic(true).Render(a.spinnerChar()+" "+verb+"ing…"))
	}
	rendered := a.renderTextEntryModal(textEntryModalOptions{
		width:       w,
		title:       title,
		buttons:     buttons,
		surfaceID:   "agent-blueprint-manage",
		intro:       intro,
		editor:      a.renderCursorEditor(a.agentBlueprintManageInput, a.agentBlueprintManageCursor),
		editorID:    "agent-blueprint-manage",
		editorValue: a.agentBlueprintManageInput,
		cursorAction: func(app *App, cursor int) {
			app.agentBlueprintManageCursor = cursor
		},
		status: statusRows,
		footer: t.HintLabel.Render(modalKeyHint("Enter "+verb, "Esc cancel")),
	})
	return rendered.modal
}

func formatAgentBlueprintValidation(result gact.AgentBlueprintValidationResult) string {
	status := "valid"
	if !result.Enabled || len(result.ValidationErrors) > 0 {
		status = "invalid"
	}
	rows := appendDetailSection(nil, "Validation",
		detailField{"status", status},
		detailField{"enabled", fmt.Sprintf("%t", result.Enabled)},
	)
	if len(result.ValidationErrors) > 0 {
		rows = append(rows, "errors: "+strings.Join(result.ValidationErrors, "; "))
	}
	if result.AgentBlueprint.ID != "" {
		rows = append(rows, "")
		rows = append(rows, formatAgentBlueprintSummary(result.AgentBlueprint))
	}
	if len(result.MCPDescriptors) > 0 {
		rows = append(rows, "", "MCP descriptors")
		for _, descriptor := range result.MCPDescriptors {
			rows = append(rows, "- "+firstNonEmpty(stringValue(descriptor["name"]), stringValue(descriptor["id"]))+": "+agentBlueprintMCPDescription(descriptor))
		}
	}
	if len(result.HookDescriptors) > 0 {
		rows = append(rows, "", "Packaged hooks")
		for _, descriptor := range result.HookDescriptors {
			rows = append(rows, "- "+firstNonEmpty(stringValue(descriptor["title"]), stringValue(descriptor["name"]), stringValue(descriptor["id"]))+": "+agentBlueprintHookDescription(descriptor))
		}
	}
	if len(result.Agents) > 0 {
		rows = append(rows, "", "Agents")
		for _, agent := range result.Agents {
			rows = append(rows, "- "+firstNonEmpty(agent.Title, agent.ID)+": "+agentCatalogDescription(agent, result.Agents))
		}
	}
	return strings.Join(rows, "\n")
}
