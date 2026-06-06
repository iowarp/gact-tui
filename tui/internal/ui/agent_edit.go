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

type agentLoadedForEditMsg struct {
	agent gact.AgentDef
	err   error
}

type agentEditedMsg struct {
	agent gact.AgentDef
	err   error
}

var agentEditFieldNames = []string{"title", "description", "system prompt", "tools", "keywords", "enabled"}

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

func (a *App) openAgentEdit(agent gact.AgentDef) {
	a.agentEditOpen = true
	a.agentEditOriginal = agent.ID
	a.agentEditDraft = agent
	if a.agentEditDraft.Source == "" {
		a.agentEditDraft.Source = "user"
	}
	a.agentEditField = 0
	a.agentEditCursor = len([]rune(a.agentEditFieldValue()))
	a.agentEditErr = ""
	a.agentEditSaving = false
}

func (a *App) closeAgentEdit() {
	a.agentEditOpen = false
	a.agentEditOriginal = ""
	a.agentEditDraft = gact.AgentDef{}
	a.agentEditField = 0
	a.agentEditCursor = 0
	a.agentEditErr = ""
	a.agentEditSaving = false
}

func (a *App) handleAgentEditKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if a.agentEditSaving {
		return a, nil
	}
	switch k.String() {
	case "esc", "ctrl+c":
		a.closeAgentEdit()
		return a, nil
	case "ctrl+s", "enter":
		return a.commitAgentEdit()
	case "tab", "down":
		a.setAgentEditField(a.agentEditField + 1)
		return a, nil
	case "shift+tab", "up":
		a.setAgentEditField(a.agentEditField - 1)
		return a, nil
	case "left":
		if a.agentEditField == 5 {
			a.agentEditDraft.Enabled = !a.agentEditDraft.Enabled
			return a, nil
		}
		if a.agentEditCursor > 0 {
			a.agentEditCursor--
		}
		return a, nil
	case "right":
		if a.agentEditField == 5 {
			a.agentEditDraft.Enabled = !a.agentEditDraft.Enabled
			return a, nil
		}
		if a.agentEditCursor < len([]rune(a.agentEditFieldValue())) {
			a.agentEditCursor++
		}
		return a, nil
	case "backspace":
		if a.agentEditField == 5 || a.agentEditCursor == 0 {
			return a, nil
		}
		runes := []rune(a.agentEditFieldValue())
		runes = append(runes[:a.agentEditCursor-1], runes[a.agentEditCursor:]...)
		a.setAgentEditFieldValue(string(runes))
		a.agentEditCursor--
		return a, nil
	case "delete":
		if a.agentEditField == 5 {
			return a, nil
		}
		runes := []rune(a.agentEditFieldValue())
		if a.agentEditCursor >= len(runes) {
			return a, nil
		}
		runes = append(runes[:a.agentEditCursor], runes[a.agentEditCursor+1:]...)
		a.setAgentEditFieldValue(string(runes))
		return a, nil
	case "home", "ctrl+a":
		a.agentEditCursor = 0
		return a, nil
	case "end", "ctrl+e":
		a.agentEditCursor = len([]rune(a.agentEditFieldValue()))
		return a, nil
	}
	text := k.Text
	if text == "" {
		if runes := []rune(k.String()); len(runes) == 1 {
			text = string(runes)
		}
	}
	a.insertAgentEditText(text)
	return a, nil
}

func (a *App) commitAgentEdit() (tea.Model, tea.Cmd) {
	if strings.TrimSpace(a.agentEditDraft.Title) == "" {
		a.agentEditErr = "title is required"
		return a, nil
	}
	agent := a.agentEditDraft
	agent.ID = a.agentEditOriginal
	agent.Source = "user"
	a.agentEditSaving = true
	return a, updateAgentCmd(a.c, a.agentEditOriginal, agent)
}

func (a *App) setAgentEditField(field int) {
	if field < 0 {
		field = len(agentEditFieldNames) - 1
	}
	if field >= len(agentEditFieldNames) {
		field = 0
	}
	a.agentEditField = field
	a.agentEditCursor = len([]rune(a.agentEditFieldValue()))
}

func (a *App) agentEditFieldValue() string {
	switch a.agentEditField {
	case 0:
		return a.agentEditDraft.Title
	case 1:
		return a.agentEditDraft.Description
	case 2:
		return a.agentEditDraft.SystemPrompt
	case 3:
		return strings.Join(a.agentEditDraft.Tools, ", ")
	case 4:
		return strings.Join(a.agentEditDraft.Keywords, ", ")
	case 5:
		if a.agentEditDraft.Enabled {
			return "true"
		}
		return "false"
	default:
		return ""
	}
}

func (a *App) setAgentEditFieldValue(value string) {
	switch a.agentEditField {
	case 0:
		a.agentEditDraft.Title = value
	case 1:
		a.agentEditDraft.Description = value
	case 2:
		a.agentEditDraft.SystemPrompt = value
	case 3:
		a.agentEditDraft.Tools = splitCommaList(value)
	case 4:
		a.agentEditDraft.Keywords = splitCommaList(value)
	}
	a.agentEditErr = ""
}

func (a *App) insertAgentEditText(text string) {
	if text == "" || a.agentEditField == 5 {
		return
	}
	text = strings.TrimRight(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	runes := []rune(a.agentEditFieldValue())
	a.agentEditCursor = clampAgentBlueprintCursor(a.agentEditCursor, len(runes))
	insert := []rune(text)
	out := make([]rune, 0, len(runes)+len(insert))
	out = append(out, runes[:a.agentEditCursor]...)
	out = append(out, insert...)
	out = append(out, runes[a.agentEditCursor:]...)
	a.setAgentEditFieldValue(string(out))
	a.agentEditCursor += len(insert)
}

func (a *App) viewAgentEdit() string {
	t := a.Theme
	w := a.detailModalWidth()
	innerW := modalInnerWidth(w)
	buttons := []menuButton{{
		id:    "agent-edit:save",
		label: "save",
		action: func(app *App) tea.Cmd {
			_, cmd := app.commitAgentEdit()
			return cmd
		},
	}, {
		id:    "agent-edit:cancel",
		label: "cancel",
		action: func(app *App) tea.Cmd {
			app.closeAgentEdit()
			return nil
		},
	}}
	rows := []string{
		"Agent id: " + a.agentEditOriginal + "  source: user",
	}
	for i, name := range agentEditFieldNames {
		prefix := "  "
		value := a.agentEditValueForRow(i)
		if i == a.agentEditField {
			prefix = "▌ "
			if i != 5 {
				value = a.renderCursorEditor(value, a.agentEditCursor)
			}
		}
		rows = append(rows, t.HintLabel.Render(prefix+name+": ")+value)
	}
	if a.agentEditErr != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Danger).Italic(true).Render("error: "+a.agentEditErr))
	}
	if a.agentEditSaving {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Warning).Italic(true).Render(a.spinnerChar()+" saving…"))
	}
	body := lipgloss.NewStyle().Width(innerW).Render(strings.Join(rows, "\n"))
	return a.renderModalFrame(modalFrameOptions{
		width:   w,
		title:   "Edit expert",
		buttons: buttons,
		body:    body,
		footer:  t.HintLabel.Render(modalKeyHint("Ctrl+S/Enter save", "Esc cancel", "Tab field", "Left/Right cursor/toggle")),
	})
}

func (a *App) agentEditValueForRow(field int) string {
	old := a.agentEditField
	a.agentEditField = field
	value := a.agentEditFieldValue()
	a.agentEditField = old
	return value
}

func splitCommaList(value string) []string {
	fields := strings.Split(value, ",")
	out := make([]string, 0, len(fields))
	for _, field := range fields {
		field = strings.TrimSpace(field)
		if field != "" {
			out = append(out, field)
		}
	}
	return out
}
