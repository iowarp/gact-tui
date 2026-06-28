package ui

// input_keys.go is the input-composer's keyboard router.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
)

func (c *inputComposerComponent) handleInputKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	a := c.app
	key := k.String()
	if c.inPaste {
		c.recordKey(k)
		var cmd tea.Cmd
		c.input, cmd = c.input.Update(k)
		return a, cmd
	}

	// Slash on empty input opens the palette.
	if key == "/" && c.input.Value() == "" {
		a.cmdPalette.openModal()
		return a, nil
	}

	// `@` at the start of input or after whitespace opens the M6 fuzzy
	// file picker. Passing through @ mid-word (e.g. in an email) is
	// preserved so we don't surprise users who are genuinely typing an
	// @-character. k.Text check guards against synthetic KeyPressMsg
	// without a Text payload (e.g. ctrl-modified).
	if k.Text == "@" {
		cur := c.input.Value()
		if cur == "" || strings.HasSuffix(cur, " ") || strings.HasSuffix(cur, "\n") {
			return a, a.filePicker.openModal()
		}
	}

	// Input history: ↑ on empty input (or while already navigating)
	// recalls prior prompts; ↓ walks forward and eventually restores
	// the pre-history draft. When the input has content AND we're NOT
	// already navigating, arrow keys pass through to the textarea so
	// multi-line cursor nav still works.
	if key == "up" && (c.input.Value() == "" || c.historyCursor >= 0) {
		if txt, ok := c.historyPrev(); ok {
			c.input.SetValue(txt)
			return a, nil
		}
	}
	if key == "down" && c.historyCursor >= 0 {
		if txt, ok := c.historyNext(); ok {
			c.input.SetValue(txt)
			return a, nil
		}
	}

	// Plain Enter sends; Shift+Enter / Alt+Enter / Ctrl+J insert a
	// newline (the textarea's rebinding picks those up in the Update
	// branch below). We also honour Claude-Code muscle memory: a
	// literal `\` at the end of the buffer + Enter inserts a newline
	// instead of sending — the trailing backslash is dropped and a
	// newline takes its place.
	//
	// If we're in the middle of a paste (PasteStart fired but no
	// PasteEnd yet), DO NOT intercept — route the key to the textarea
	// so embedded newlines become literal newlines instead of
	// triggering multiple "send" actions.
	if key == "enter" {
		raw := c.input.Value()
		if strings.HasSuffix(raw, "\\") {
			// Backslash-escape → newline. Strip the trailing "\" and
			// append "\n". We do this by round-tripping through
			// SetValue because the textarea API doesn't expose a
			// mutation primitive.
			c.input.SetValue(strings.TrimSuffix(raw, "\\") + "\n")
			return a, nil
		}
		// Expand any `[pasted content: N lines]` placeholders in the
		// buffer so the backend sees the real body, not the compressed
		// sigil. Send-time expansion keeps the input readable right up
		// until the moment the message is dispatched.
		text := strings.TrimSpace(c.expandText(raw))
		draftText := text
		mentions := activeComposerFileMentions(raw, c.fileMentions)
		c.input.Reset()
		c.fileMentions = nil
		c.pastes = nil
		c.exitHistory()
		// N1: successful dispatch invalidates any saved draft for
		// this session. Drop it now so that coming back later sees
		// a clean slate rather than the already-sent text resurfacing.
		if sid := a.session.currentID(); sid != "" {
			delete(c.inputDraftBySession, sid)
			delete(c.fileMentionsBySession, sid)
		}
		if text == "" || a.session.currentID() == "" {
			return a, nil
		}
		c.pushHistory(text)
		agentID := a.agent.nextTurnAgentID
		a.agent.nextTurnAgentID = ""
		a.agent.nextTurnAgentTitle = ""
		return a, postMessageWithMentionsAndAgentCmd(a.c, a.session.currentID(), draftText, text, mentions, agentID)
	}
	if key == "ctrl+p" {
		// Expand the most recent compressed paste in-place so the user
		// can inspect what's actually queued to send.
		c.expandMostRecent()
		return a, nil
	}
	if key == "ctrl+g" || key == "ctrl+shift+p" {
		// Open the M5 compose modal for long-form editing. Both bindings
		// are accepted — ctrl+shift+p only works on terminals that
		// negotiate the Kitty keyboard protocol, ctrl+g works universally.
		c.openCompose()
		return a, nil
	}
	if key == "esc" {
		c.input.Reset()
		c.fileMentions = nil
		c.exitHistory()
		return a, nil
	}
	// Any other key implies editing — drop out of history mode so the
	// user's keystrokes replace whatever history text is currently in
	// the buffer (rather than the next ↑/↓ jumping back to history).
	if c.historyCursor >= 0 {
		c.exitHistory()
	}
	// Everything else: delegate to textarea.
	var cmd tea.Cmd
	c.input, cmd = c.input.Update(k)
	return a, cmd
}
