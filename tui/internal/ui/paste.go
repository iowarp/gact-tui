package ui

// paste.go handles bracketed-paste start/end/content events for the input composer.

import tea "charm.land/bubbletea/v2"

func (c *inputComposerComponent) handlePasteStart(m tea.PasteStartMsg) (tea.Model, tea.Cmd) {
	c.inPaste = true
	c.pasteBuffer = ""
	// Don't forward to textarea — PasteStartMsg is a state signal,
	// not content. The textarea handles content via PasteMsg.
	return c.app, nil
}

func (c *inputComposerComponent) handlePasteEnd(m tea.PasteEndMsg) (tea.Model, tea.Cmd) {
	c.compactBuffered()
	c.inPaste = false
	c.pasteBuffer = ""
	return c.app, nil
}

func (c *inputComposerComponent) handlePaste(m tea.PasteMsg) (tea.Model, tea.Cmd) {
	a := c.app
	m.Content = normalizePasteNewlines(m.Content)
	if a.lmConfig.open {
		return a, a.lmConfig.handlePaste(m.Content)
	}
	if a.rename.open {
		a.rename.insert(compactSingleLinePaste(m.Content))
		return a, nil
	}
	if a.contextAdd.open {
		a.contextAdd.insert(compactTokenPaste(m.Content))
		return a, nil
	}
	if a.promptEdit.open {
		a.promptEdit.insert(compactSingleLinePaste(m.Content))
		return a, nil
	}
	if a.agentWrite.open {
		a.agentWrite.insert(compactSingleLinePaste(m.Content))
		return a, nil
	}
	if a.agentEdit.open {
		a.agentEdit.insert(m.Content)
		return a, nil
	}
	if a.agentBlueprintManage.open {
		a.agentBlueprintManage.insert(compactPathLikePaste(m.Content))
		return a, nil
	}
	if a.expertPackInstall.open {
		a.expertPackInstall.insert(compactPathLikePaste(m.Content))
		return a, nil
	}
	if a.workspace.switchOpen && a.workspace.create.open {
		a.workspace.insertCreateText(compactSingleLinePaste(m.Content))
		return a, nil
	}
	if a.mcpInstall.open {
		a.mcpInstall.insert(compactSingleLinePaste(m.Content))
		return a, nil
	}
	if a.askUser.open {
		a.askUser.insert(compactSingleLinePaste(m.Content))
		return a, nil
	}
	if a.retryNotes.open {
		a.retryNotes.insert(compactSingleLinePaste(m.Content))
		return a, nil
	}
	if a.retryModel.open {
		a.retryModel.insert(compactTokenPaste(m.Content))
		return a, nil
	}
	if c.composeOpen && c.compose != nil {
		var cmd tea.Cmd
		c.compose.ta, cmd = c.compose.ta.Update(m)
		return a, cmd
	}
	if c.canRoutePaste() {
		threshold := a.Theme.PasteCompressThreshold
		if threshold <= 0 {
			threshold = 3
		}
		if n := visualLineCount(m.Content, c.estimatedTextWidth()); n >= threshold {
			c.insertPlaceholder(m.Content, n)
			return a, nil
		}
		var cmd tea.Cmd
		c.input, cmd = c.input.Update(m)
		return a, cmd
	}
	return a, nil
}

func (c *inputComposerComponent) canRoutePaste() bool {
	a := c.app
	return a.focus == FocusInput &&
		!a.help.open &&
		!a.cmdPalette.paletteOpen &&
		!a.settings.open &&
		!a.session.setupOpen &&
		!a.metrics.open &&
		!a.workspace.switchOpen &&
		!a.rename.open &&
		!a.contextAdd.open &&
		!a.detail.visible &&
		!a.quitConfirm.open &&
		!a.doctor.open &&
		!a.lmConfig.open
}

func (c *inputComposerComponent) recordKey(k tea.KeyPressMsg) {
	switch k.String() {
	case "enter":
		c.pasteBuffer += "\n"
	case "tab":
		c.pasteBuffer += "\t"
	default:
		if text := k.Key().Text; text != "" {
			c.pasteBuffer += text
		}
	}
}
