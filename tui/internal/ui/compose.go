// Floating compose window (M5). A big modal textarea seeded with the
// current input draft, useful for long prompts or reviewing pasted
// code. The user's flow:
//
//	Input focus → Ctrl+G (or Ctrl+Shift+P on terminals that send it)
//	    opens the compose modal with the current draft.
//	Inside the modal → normal textarea editing, ALL pastes land
//	    expanded (no compression) so users can see everything.
//	    Ctrl+S commits the modal body back to the base input and
//	    closes the modal. Esc cancels and preserves the pre-modal
//	    draft.
//	From the base input after Ctrl+S → Enter still sends, same as
//	    before.
//
// Design note: we deliberately reuse bubbles/v2/textarea rather than
// building a second editor. The base input is single-line-ish by
// convention; the compose window is the same widget sized for the
// modal so all existing key behaviour (selection, word-wise motion,
// paste handling) transfers verbatim.
package ui

// compose.go drives the full-screen compose editor: open/commit/cancel, key handling, and rendering.

import (
	"strings"

	"charm.land/bubbles/v2/key"
	"charm.land/bubbles/v2/textarea"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

// composeState carries the modal's runtime bits. compose is nil
// while the modal is closed; populated on open, cleared on close.
type composeState struct {
	ta        textarea.Model
	prevDraft string // raw contents of the input at the moment of open; restored on cancel
}

// openCompose pops the compose modal seeded with the current input
// draft. Expands any compressed paste placeholders inline so the
// editor sees real content, mirroring the user's expectation that
// "the compose view is where everything renders expanded".
func (c *inputComposerComponent) openCompose() {
	expanded := c.expandText(c.input.Value())

	ta := textarea.New()
	ta.SetValue(expanded)
	ta.ShowLineNumbers = false
	ta.Prompt = ""
	// Rebind InsertNewline so plain Enter in the compose window inserts
	// a newline — the modal is for long prompts so Enter shouldn't
	// short-circuit as "send".
	ta.KeyMap.InsertNewline = key.NewBinding(
		key.WithKeys("enter", "ctrl+m", "shift+enter", "alt+enter", "ctrl+j"),
	)
	ta.Focus()
	// Drop it at the end of the buffer so the user can keep typing.
	ta.CursorEnd()

	c.compose = &composeState{ta: ta, prevDraft: c.input.Value()}
	c.composeOpen = true
	// Clear pastes — we've inlined them; subsequent compress/expand
	// cycles can start fresh.
	c.pastes = nil
}

// commitCompose copies the modal's body back into the base input and
// closes the modal. Preserves cursor-end so the user can immediately
// Enter-send.
func (c *inputComposerComponent) commitCompose() {
	if c.compose == nil {
		c.composeOpen = false
		return
	}
	c.input.SetValue(c.compose.ta.Value())
	c.composeOpen = false
	c.compose = nil
}

// cancelCompose closes the modal WITHOUT overwriting the base input.
// Pre-modal draft is already intact (we didn't touch the input on open),
// so this is just a state teardown.
func (c *inputComposerComponent) cancelCompose() {
	c.composeOpen = false
	c.compose = nil
}

func (c *clipboardComponent) copyComposeText() tea.Cmd {
	compose := c.app.inputComposer.compose
	if compose == nil {
		c.app.setHint("nothing to copy")
		return nil
	}
	c.app.setHint(copyTextToClipboard("compose draft", compose.ta.Value()))
	return nil
}

// handleComposeKey routes keypresses while the compose modal is open.
// Returns a new model + command like every other modal handler.
func (c *inputComposerComponent) handleComposeKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if c.compose == nil {
		c.composeOpen = false
		return c.app, nil
	}
	switch k.String() {
	case "ctrl+s", "ctrl+enter":
		// Ctrl+Enter is a convenience alias for Ctrl+S — matches
		// chat-app muscle memory where the modifier-Enter sends.
		// Kitty-protocol terminals only; Ctrl+S always works.
		c.commitCompose()
		return c.app, nil
	case "esc":
		c.cancelCompose()
		return c.app, nil
	}
	// Everything else — delegate to the inner textarea.
	var cmd tea.Cmd
	c.compose.ta, cmd = c.compose.ta.Update(k)
	return c.app, cmd
}

func (c *inputComposerComponent) moveCursorByWheel(button tea.MouseButton) tea.Cmd {
	if c.compose == nil {
		c.composeOpen = false
		return nil
	}
	c.compose.ta.Focus()
	for i := 0; i < 3; i++ {
		switch button {
		case tea.MouseWheelUp:
			c.compose.ta.CursorUp()
		case tea.MouseWheelDown:
			c.compose.ta.CursorDown()
		default:
			return nil
		}
	}
	return nil
}

// viewCompose renders the compose modal: full-height-ish textarea
// framed by a bordered box with a one-line hint bar. Sized to ~80% of
// the app viewport so the surrounding base layout is still visible
// through the overlay gutters (consistent with other modals' use of
// spliceRow).
func (c *inputComposerComponent) viewCompose() string {
	a := c.app
	t := a.Theme
	if c.compose == nil {
		return ""
	}

	// Modal dimensions use the shared chrome width so expanded editor
	// and provider setup windows do not jump horizontally.
	w := a.modals.wideModalWidth()
	h := a.height * 4 / 5
	if h < 14 {
		h = 14
	}
	if h > a.height-4 {
		h = a.height - 4
	}

	taH := h - 8 // shared frame title/footer + border padding
	if taH < 6 {
		taH = 6
	}
	textareaW := modalTextAreaWidth(w)
	c.compose.ta.SetWidth(textareaW)
	c.compose.ta.SetHeight(taH)

	lines := strings.Count(c.compose.ta.Value(), "\n") + 1
	title := "Compose (" + itoa2(lines) + " lines)"
	footer := t.HintLabel.Render(
		"Ctrl+S commit  Esc cancel  pastes render expanded; newlines are literal")
	buttons := []menuButton{
		{
			id:    "compose:commit",
			label: "commit",
			action: func(app *App) tea.Cmd {
				app.inputComposer.commitCompose()
				return nil
			},
		},
		{
			id:    "compose:copy",
			label: "copy",
			action: func(app *App) tea.Cmd {
				return app.clipboard.copyComposeText()
			},
		},
		{
			id:    "compose:cancel",
			label: "cancel",
			action: func(app *App) tea.Cmd {
				app.inputComposer.cancelCompose()
				return nil
			},
		},
	}
	textareaView := c.compose.ta.View()
	rows := []string{textareaView}
	body := lipgloss.JoinVertical(lipgloss.Left, rows...)

	rendered := a.modals.renderModalFrameWithLayout(modalFrameOptions{
		width:   w,
		title:   title,
		buttons: buttons,
		body:    body,
		footer:  footer,
	})
	a.interaction.registerModalSurfaceWheel(rendered, "compose")
	a.interaction.registerModalTextareaRegion(rendered.modal, rendered.bodyRow, 0, textareaW, taH, "compose", c.compose.ta.Value(), func(app *App, line int, col int) {
		if app.inputComposer.compose == nil {
			return
		}
		app.inputComposer.compose.ta.Focus()
		setTextareaCursor(&app.inputComposer.compose.ta, line, col)
	}, func(app *App, button tea.MouseButton) tea.Cmd {
		return app.inputComposer.moveCursorByWheel(button)
	})
	return rendered.modal
}
