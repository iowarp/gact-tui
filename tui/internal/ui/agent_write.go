package ui

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

const (
	agentWriteModeCreate  = "create"
	agentWriteModeClone   = "clone"
	agentWriteModeExtract = "extract"
)

type agentWriteDoneMsg struct {
	mode  string
	agent gact.AgentDef
	err   error
}

type agentDeletedMsg struct {
	agentID string
	err     error
}

func (a *App) openAgentWrite(mode, sourceID, seedID string) {
	a.agentWriteOpen = true
	a.agentWriteMode = mode
	a.agentWriteSourceID = sourceID
	a.agentWriteDraft = sanitizeAgentID(seedID)
	a.agentWriteCursor = len([]rune(a.agentWriteDraft))
}

func (a *App) closeAgentWrite() {
	a.agentWriteOpen = false
	a.agentWriteMode = ""
	a.agentWriteSourceID = ""
	a.agentWriteDraft = ""
	a.agentWriteCursor = 0
}

func (a *App) handleAgentWriteKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c":
		a.closeAgentWrite()
		return a, nil
	case "enter":
		return a.commitAgentWrite()
	case "backspace":
		if a.agentWriteCursor == 0 {
			return a, nil
		}
		runes := []rune(a.agentWriteDraft)
		runes = append(runes[:a.agentWriteCursor-1], runes[a.agentWriteCursor:]...)
		a.agentWriteDraft = string(runes)
		a.agentWriteCursor--
		return a, nil
	case "delete":
		runes := []rune(a.agentWriteDraft)
		if a.agentWriteCursor >= len(runes) {
			return a, nil
		}
		runes = append(runes[:a.agentWriteCursor], runes[a.agentWriteCursor+1:]...)
		a.agentWriteDraft = string(runes)
		return a, nil
	case "left":
		if a.agentWriteCursor > 0 {
			a.agentWriteCursor--
		}
		return a, nil
	case "right":
		if a.agentWriteCursor < len([]rune(a.agentWriteDraft)) {
			a.agentWriteCursor++
		}
		return a, nil
	case "home", "ctrl+a":
		a.agentWriteCursor = 0
		return a, nil
	case "end", "ctrl+e":
		a.agentWriteCursor = len([]rune(a.agentWriteDraft))
		return a, nil
	}
	text := k.Text
	if text == "" {
		if runes := []rune(k.String()); len(runes) == 1 {
			text = string(runes)
		}
	}
	a.insertAgentWriteText(text)
	return a, nil
}

func (a *App) insertAgentWriteText(text string) {
	if text == "" {
		return
	}
	text = strings.TrimRight(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	insert := []rune(text)
	runes := []rune(a.agentWriteDraft)
	if a.agentWriteCursor < 0 {
		a.agentWriteCursor = 0
	}
	if a.agentWriteCursor > len(runes) {
		a.agentWriteCursor = len(runes)
	}
	out := make([]rune, 0, len(runes)+len(insert))
	out = append(out, runes[:a.agentWriteCursor]...)
	out = append(out, insert...)
	out = append(out, runes[a.agentWriteCursor:]...)
	a.agentWriteDraft = string(out)
	a.agentWriteCursor += len(insert)
}

func (a *App) commitAgentWrite() (tea.Model, tea.Cmd) {
	mode := a.agentWriteMode
	sourceID := a.agentWriteSourceID
	agentID := sanitizeAgentID(a.agentWriteDraft)
	a.closeAgentWrite()
	if agentID == "" {
		a.transientHint = "agent write cancelled (empty id)"
		return a, scheduleHintExpire(a.transientHint)
	}
	switch mode {
	case agentWriteModeClone:
		return a, cloneAgentCmd(a.c, a.runtimeScope(), sourceID, agentID)
	case agentWriteModeExtract:
		sid := a.currentSessionID()
		if sid == "" {
			a.transientHint = "select a session before extracting an agent"
			return a, scheduleHintExpire(a.transientHint)
		}
		return a, extractAgentCmd(a.c, sid, agentID)
	default:
		return a, createBasicAgentCmd(a.c, agentID)
	}
}

func createBasicAgentCmd(c *client.Client, agentID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		agent, err := c.CreateAgent(ctx, gact.AgentDef{
			ID:          agentID,
			Source:      "user",
			Title:       titleFromAgentID(agentID),
			Description: "Created from the GACT TUI.",
			Enabled:     true,
			Metadata: map[string]any{
				"created_by": "gact-tui",
			},
		})
		return agentWriteDoneMsg{mode: agentWriteModeCreate, agent: agent, err: err}
	}
}

func cloneAgentCmd(c *client.Client, scope client.RuntimeScope, sourceID, targetID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		source, err := c.GetAgentScoped(ctx, sourceID, scope)
		if err != nil {
			return agentWriteDoneMsg{mode: agentWriteModeClone, err: err}
		}
		source.ID = targetID
		source.Source = "user"
		source.Title = firstNonEmpty(source.Title, titleFromAgentID(sourceID)) + " copy"
		source.Metadata = cloneMetadata(source.Metadata)
		source.Metadata["cloned_from_agent_id"] = sourceID
		source.Metadata["created_by"] = "gact-tui"
		agent, err := c.CreateAgent(ctx, source)
		return agentWriteDoneMsg{mode: agentWriteModeClone, agent: agent, err: err}
	}
}

func extractAgentCmd(c *client.Client, sessionID, agentID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		agent, err := c.ExtractAgent(ctx, gact.AgentExtractRequest{
			SessionIDs: []string{sessionID},
			AgentID:    agentID,
		})
		return agentWriteDoneMsg{mode: agentWriteModeExtract, agent: agent, err: err}
	}
}

func deleteAgentCmd(c *client.Client, agentID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return agentDeletedMsg{agentID: agentID, err: c.DeleteAgent(ctx, agentID)}
	}
}

func (a *App) viewAgentWrite() string {
	w := a.detailModalWidth()
	title := "Create user agent"
	intro := []string{"Creates a minimal enabled user agent. You can refine prompt, tools, and routing from the agent registry files."}
	switch a.agentWriteMode {
	case agentWriteModeClone:
		title = "Clone agent"
		intro = []string{"Creates a user-owned copy of " + a.agentWriteSourceID + " so the built-in/source definition is not overwritten."}
	case agentWriteModeExtract:
		title = "Extract agent from session"
		intro = []string{"Creates a user-owned agent from the current session's observed prompts and tool usage."}
	}
	buttons := []menuButton{
		{id: "agent-write:save", label: "save", action: func(app *App) tea.Cmd {
			_, cmd := app.commitAgentWrite()
			return cmd
		}},
		{id: "agent-write:cancel", label: "cancel", action: func(app *App) tea.Cmd {
			app.closeAgentWrite()
			return nil
		}},
	}
	rendered := a.renderTextEntryModal(textEntryModalOptions{
		width:       w,
		title:       title,
		buttons:     buttons,
		surfaceID:   "agent-write",
		intro:       intro,
		editor:      a.renderCursorEditor(a.agentWriteDraft, a.agentWriteCursor),
		editorID:    "agent-write",
		editorValue: a.agentWriteDraft,
		cursorAction: func(app *App, cursor int) {
			app.agentWriteCursor = cursor
		},
		footer: a.Theme.HintLabel.Render(modalKeyHint("Enter save", "Esc cancel", "Left/Right move")),
	})
	return rendered.modal
}

func sanitizeAgentID(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.ReplaceAll(value, " ", "-")
	var b strings.Builder
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_' || r == '.':
			b.WriteRune(r)
		}
	}
	return strings.Trim(b.String(), "-_.")
}

func titleFromAgentID(agentID string) string {
	words := strings.Fields(strings.NewReplacer("-", " ", "_", " ", ".", " ").Replace(agentID))
	for i, word := range words {
		if word == "" {
			continue
		}
		words[i] = strings.ToUpper(word[:1]) + word[1:]
	}
	if len(words) == 0 {
		return agentID
	}
	return strings.Join(words, " ")
}

func cloneMetadata(in map[string]any) map[string]any {
	out := make(map[string]any, len(in)+2)
	for k, v := range in {
		out[k] = v
	}
	return out
}

func agentWriteHint(mode string, agent gact.AgentDef) string {
	action := mode
	if action == "" {
		action = "saved"
	}
	return fmt.Sprintf("%s agent %s", action, firstNonEmpty(agent.ID, "unknown"))
}
