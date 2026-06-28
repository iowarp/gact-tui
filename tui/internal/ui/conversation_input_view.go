package ui

// conversation_input_view.go renders the conversation/input pane composite.

func (c *inputComposerComponent) renderPane(width, inputTextW, inputH, msgH, hintH int) string {
	a := c.app
	t := a.Theme
	c.input.SetWidth(inputTextW)
	placeholderWidth := inputTextW - 2
	if a.MouseEnabled {
		placeholderWidth = minInt(placeholderWidth, 56)
	}
	c.input.Placeholder = c.localizedPlaceholder(placeholderWidth)

	inputInnerH := inputH - 2
	if a.agent.nextTurnAgentID != "" && inputInnerH > 1 {
		inputInnerH--
	}
	c.input.SetHeight(inputInnerH)
	if a.focus == FocusInput {
		c.input.Focus()
	} else {
		c.input.Blur()
	}

	// CCCCC1: same OUTER-height correction as sidebar/conversation.
	inputStyle := t.Pane.Width(width - 2).Height(inputH)
	if a.focus == FocusInput {
		inputStyle = t.PaneFoc.Width(width - 2).Height(inputH)
	}
	inputView := c.input.View()
	if a.agent.nextTurnAgentID != "" {
		label := firstNonEmpty(a.agent.nextTurnAgentTitle, a.agent.nextTurnAgentID)
		inputView = t.HintLabel.Render("agent for next turn: ") +
			t.HintKey.Render(label) + "\n" + inputView
	}
	if a.MouseEnabled {
		inputView = c.renderMouseCommand(inputView)
		c.registerCommandHit(msgH, hintH)
		c.registerTextareaCursorHits(msgH, hintH)
	}
	return fitBorderedLinesWithBackground(inputStyle.Render(inputView), inputH, t.Bg)
}
