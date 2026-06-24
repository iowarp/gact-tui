package ui

// agentEditModal: the inline agent-definition editor overlay.

import (
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

var agentEditFieldNames = []string{"title", "description", "system prompt", "tools", "keywords", "enabled"}

// agentEditModal is the agent-definition editor's state: the original agent id,
// the working AgentDef draft, the focused form field + its rune cursor, and
// inline error/saving status. It owns its behaviour (open/close/key/commit/
// insert/view) and holds an app back-ref for shared services, wired centrally
// in wireComponents().
type agentEditModal struct {
	app      *App
	open     bool
	original string
	draft    gact.AgentDef
	field    int
	cursor   int
	err      string
	saving   bool
}

func (m *agentEditModal) reset() { *m = agentEditModal{app: m.app} }

func (m *agentEditModal) openModal(agent gact.AgentDef) {
	m.open = true
	m.original = agent.ID
	m.draft = agent
	if m.draft.Source == "" {
		m.draft.Source = "user"
	}
	m.field = 0
	m.cursor = len([]rune(m.fieldValue()))
	m.err = ""
	m.saving = false
}

func (m *agentEditModal) close() { m.reset() }

func (m *agentEditModal) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if m.saving {
		return m.app, nil
	}
	switch k.String() {
	case "esc", "ctrl+c":
		m.close()
		return m.app, nil
	case "ctrl+s", "enter":
		return m.commit()
	case "tab", "down":
		m.setField(m.field + 1)
		return m.app, nil
	case "shift+tab", "up":
		m.setField(m.field - 1)
		return m.app, nil
	case "left":
		if m.field == 5 {
			m.draft.Enabled = !m.draft.Enabled
			return m.app, nil
		}
		if m.cursor > 0 {
			m.cursor--
		}
		return m.app, nil
	case "right":
		if m.field == 5 {
			m.draft.Enabled = !m.draft.Enabled
			return m.app, nil
		}
		if m.cursor < len([]rune(m.fieldValue())) {
			m.cursor++
		}
		return m.app, nil
	case "backspace":
		if m.field == 5 || m.cursor == 0 {
			return m.app, nil
		}
		runes := []rune(m.fieldValue())
		runes = append(runes[:m.cursor-1], runes[m.cursor:]...)
		m.setFieldValue(string(runes))
		m.cursor--
		return m.app, nil
	case "delete":
		if m.field == 5 {
			return m.app, nil
		}
		runes := []rune(m.fieldValue())
		if m.cursor >= len(runes) {
			return m.app, nil
		}
		runes = append(runes[:m.cursor], runes[m.cursor+1:]...)
		m.setFieldValue(string(runes))
		return m.app, nil
	case "home", "ctrl+a":
		m.cursor = 0
		return m.app, nil
	case "end", "ctrl+e":
		m.cursor = len([]rune(m.fieldValue()))
		return m.app, nil
	}
	text := k.Text
	if text == "" {
		if runes := []rune(k.String()); len(runes) == 1 {
			text = string(runes)
		}
	}
	m.insert(text)
	return m.app, nil
}

func (m *agentEditModal) commit() (tea.Model, tea.Cmd) {
	if strings.TrimSpace(m.draft.Title) == "" {
		m.err = "title is required"
		return m.app, nil
	}
	agent := m.draft
	agent.ID = m.original
	agent.Source = "user"
	m.saving = true
	return m.app, updateAgentCmd(m.app.c, m.original, agent)
}

func (m *agentEditModal) setField(field int) {
	if field < 0 {
		field = len(agentEditFieldNames) - 1
	}
	if field >= len(agentEditFieldNames) {
		field = 0
	}
	m.field = field
	m.cursor = len([]rune(m.fieldValue()))
}

func (m *agentEditModal) fieldValue() string {
	switch m.field {
	case 0:
		return m.draft.Title
	case 1:
		return m.draft.Description
	case 2:
		return m.draft.SystemPrompt
	case 3:
		return strings.Join(m.draft.Tools, ", ")
	case 4:
		return strings.Join(m.draft.Keywords, ", ")
	case 5:
		if m.draft.Enabled {
			return "true"
		}
		return "false"
	default:
		return ""
	}
}

func (m *agentEditModal) setFieldValue(value string) {
	switch m.field {
	case 0:
		m.draft.Title = value
	case 1:
		m.draft.Description = value
	case 2:
		m.draft.SystemPrompt = value
	case 3:
		m.draft.Tools = splitCommaList(value)
	case 4:
		m.draft.Keywords = splitCommaList(value)
	}
	m.err = ""
}

func (m *agentEditModal) insert(text string) {
	if text == "" || m.field == 5 {
		return
	}
	text = strings.TrimRight(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	runes := []rune(m.fieldValue())
	m.cursor = clampAgentBlueprintCursor(m.cursor, len(runes))
	insert := []rune(text)
	out := make([]rune, 0, len(runes)+len(insert))
	out = append(out, runes[:m.cursor]...)
	out = append(out, insert...)
	out = append(out, runes[m.cursor:]...)
	m.setFieldValue(string(out))
	m.cursor += len(insert)
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
