package ui

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func (a *App) openPromptEdit(promptID, profile, title, text string) {
	a.promptEditOpen = true
	a.promptEditID = promptID
	a.promptEditProfile = profile
	a.promptEditTitle = title
	a.promptEditDraft = strings.Join(strings.Fields(text), " ")
	a.promptEditCursor = len([]rune(a.promptEditDraft))
}

func (a *App) closePromptEdit() {
	a.promptEditOpen = false
	a.promptEditID = ""
	a.promptEditProfile = ""
	a.promptEditTitle = ""
	a.promptEditDraft = ""
	a.promptEditCursor = 0
}

func (a *App) handlePromptEditKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c":
		a.closePromptEdit()
		return a, nil
	case "enter":
		return a.commitPromptEdit()
	case "backspace":
		if a.promptEditCursor == 0 {
			return a, nil
		}
		runes := []rune(a.promptEditDraft)
		runes = append(runes[:a.promptEditCursor-1], runes[a.promptEditCursor:]...)
		a.promptEditDraft = string(runes)
		a.promptEditCursor--
		return a, nil
	case "delete":
		runes := []rune(a.promptEditDraft)
		if a.promptEditCursor >= len(runes) {
			return a, nil
		}
		runes = append(runes[:a.promptEditCursor], runes[a.promptEditCursor+1:]...)
		a.promptEditDraft = string(runes)
		return a, nil
	case "left":
		if a.promptEditCursor > 0 {
			a.promptEditCursor--
		}
		return a, nil
	case "right":
		if a.promptEditCursor < len([]rune(a.promptEditDraft)) {
			a.promptEditCursor++
		}
		return a, nil
	case "home", "ctrl+a":
		a.promptEditCursor = 0
		return a, nil
	case "end", "ctrl+e":
		a.promptEditCursor = len([]rune(a.promptEditDraft))
		return a, nil
	}
	if k.Text != "" {
		a.insertPromptEditText(k.Text)
	}
	return a, nil
}

func (a *App) insertPromptEditText(text string) {
	a.promptEditDraft, a.promptEditCursor = insertTextAtCursor(a.promptEditDraft, a.promptEditCursor, text)
}

func (a *App) commitPromptEdit() (tea.Model, tea.Cmd) {
	promptID := a.promptEditID
	profile := a.promptEditProfile
	title := a.promptEditTitle
	text := strings.TrimSpace(a.promptEditDraft)
	a.closePromptEdit()
	if promptID == "" || text == "" {
		a.transientHint = "prompt edit cancelled"
		return a, scheduleHintExpire(a.transientHint)
	}
	return a, savePromptOverrideCmd(a.c, a.runtimeScope(), promptID, profile, title, text)
}

func savePromptOverrideCmd(c *client.Client, scope client.RuntimeScope, promptID, sourceProfile, title, text string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		target := "codex"
		_, err := c.SavePromptScoped(ctx, promptID, gact.PromptSaveRequest{
			Profile: target,
			Title:   title,
			Text:    text,
			Metadata: map[string]any{
				"edited_from_profile": sourceProfile,
				"saved_by":            "gact-tui",
			},
		}, scope)
		return promptSavedMsg{promptID: promptID, profile: target, err: err}
	}
}

type promptEditLoadedMsg struct {
	prompt gact.ResolvedPrompt
	err    error
}

func loadPromptEditCmd(c *client.Client, scope client.RuntimeScope, promptID, profile string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		prompt, err := c.GetPromptScoped(ctx, promptID, profile, scope)
		return promptEditLoadedMsg{prompt: prompt, err: err}
	}
}

func (a *App) viewPromptEdit() string {
	w := a.detailModalWidth()
	buttons := []menuButton{
		{id: "prompt-edit:save", label: "save", action: func(app *App) tea.Cmd {
			_, cmd := app.commitPromptEdit()
			return cmd
		}},
		{id: "prompt-edit:cancel", label: "cancel", action: func(app *App) tea.Cmd {
			app.closePromptEdit()
			return nil
		}},
	}
	rendered := a.renderTextEntryModal(textEntryModalOptions{
		width:       w,
		title:       "Edit prompt override · " + a.promptEditID,
		buttons:     buttons,
		surfaceID:   "prompt-edit",
		intro:       []string{"Edits save to profile codex so built-in prompt text is not overwritten."},
		editor:      a.renderCursorEditor(a.promptEditDraft, a.promptEditCursor),
		editorID:    "prompt-edit",
		editorValue: a.promptEditDraft,
		cursorAction: func(app *App, cursor int) {
			app.promptEditCursor = cursor
		},
		footer: a.Theme.HintLabel.Render(modalKeyHint("Enter save", "Esc cancel", "Left/Right move")),
	})
	return rendered.modal
}
