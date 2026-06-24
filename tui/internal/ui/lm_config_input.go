package ui

// lm_config_input.go is the LM-config modal's keyboard and wheel router.

import tea "charm.land/bubbletea/v2"

// handleKey drives the modal while it's open.
func (c *lmConfigComponent) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if !c.open {
		return c.app, nil
	}
	if c.saving || c.authenticating {
		return c.app, nil
	}
	switch k.String() {
	case "esc":
		c.close()
		return c.app, nil
	case "ctrl+r":
		return c.app, c.refresh()
	case "tab":
		c.lmConfigStepSection(1)
		return c.app, nil
	case "shift+tab":
		c.lmConfigStepSection(-1)
		return c.app, nil
	case "down", "j":
		return c.handleVertical(1)
	case "up", "k":
		return c.handleVertical(-1)
	case "enter":
		if c.field == lmFieldSave {
			return c.app, c.dispatch()
		}
		if c.field == lmFieldAuth {
			if p := c.currentPreset(); p != nil {
				c.authenticating = true
				force := p.IsAuthenticated || p.Status == "ready"
				if force {
					c.authMessage = "launching ALCF Globus re-auth terminal..."
				} else {
					c.authMessage = "launching ALCF Globus login terminal..."
				}
				return c.app, lmConfigAuthCmd(c.app.c, p.ID, force)
			}
			return c.app, nil
		}
		c.lmConfigStepSection(1)
		return c.app, nil
	case "left", "right":
		delta := 1
		if k.String() == "left" {
			delta = -1
		}
		c.handleHorizontal(delta)
		return c.app, nil
	case "backspace":
		return c.app, c.handleBackspace()
	}
	// Plain text input — only Model + API key still take free text.
	// Numeric fields are now driven by ←/→ in the Advanced section.
	if k.Text != "" {
		return c.app, c.handleTextInput(k.Text)
	}
	return c.app, nil
}

func (c *lmConfigComponent) handleVertical(delta int) (tea.Model, tea.Cmd) {
	if !c.open {
		return c.app, nil
	}
	switch c.field {
	case lmFieldPreset:
		if c.info == nil {
			return c.app, nil
		}
		indexes := c.providerIndexes()
		n := len(indexes)
		if n == 0 {
			return c.app, nil
		}
		pos := 0
		for i, idx := range indexes {
			if idx == c.selected {
				pos = i
				break
			}
		}
		c.selected = indexes[((pos+delta)%n+n)%n]
		cmd := c.syncFromPreset()
		return c.app, cmd
	case lmFieldModel:
		if c.info == nil {
			return c.app, nil
		}
		pid := c.currentPresetID()
		catalog := c.modelCatalogs[pid]
		indexes := c.modelIndexes()
		n := len(indexes)
		if n == 0 {
			return c.app, nil
		}
		cur := c.modelIndex
		pos := 0
		for i, idx := range indexes {
			if idx == cur {
				pos = i
				break
			}
			if catalog[idx].ID == c.model {
				pos = i
				if cur < 0 {
					cur = idx
					break
				}
			}
		}
		c.modelIndex = indexes[((pos+delta)%n+n)%n]
		c.model = catalog[c.modelIndex].ID
	case lmFieldTemperature, lmFieldMaxTokens, lmFieldContextLength, lmFieldThinkingBudget, lmFieldParallel:
		fields := c.lmConfigAdvancedFields()
		if len(fields) == 0 {
			return c.app, nil
		}
		pos := 0
		for i, field := range fields {
			if field == c.field {
				pos = i
				break
			}
		}
		c.field = fields[((pos+delta)%len(fields)+len(fields))%len(fields)]
	}
	return c.app, nil
}

func (c *lmConfigComponent) handleProviderWheel(button tea.MouseButton) tea.Cmd {
	if !c.open || c.info == nil {
		return nil
	}
	indexes := c.providerIndexes()
	if len(indexes) == 0 {
		return nil
	}
	pos := 0
	for i, idx := range indexes {
		if idx == c.selected {
			pos = i
			break
		}
	}
	next := moveSelectionByWheel(pos, len(indexes), button)
	if next == pos {
		c.field = lmFieldPreset
		return nil
	}
	c.field = lmFieldPreset
	c.selected = indexes[next]
	return c.syncFromPreset()
}

func (c *lmConfigComponent) handleModelWheel(button tea.MouseButton) tea.Cmd {
	if !c.open || c.info == nil {
		return nil
	}
	pid := c.currentPresetID()
	catalog := c.modelCatalogs[pid]
	indexes := c.modelIndexes()
	if len(indexes) == 0 || len(catalog) == 0 {
		return nil
	}
	cur := c.modelIndex
	pos := 0
	for i, idx := range indexes {
		if idx == cur || (idx >= 0 && idx < len(catalog) && catalog[idx].ID == c.model) {
			pos = i
			break
		}
	}
	next := moveSelectionByWheel(pos, len(indexes), button)
	c.field = lmFieldModel
	modelIdx := indexes[next]
	if modelIdx < 0 || modelIdx >= len(catalog) {
		return nil
	}
	c.modelIndex = modelIdx
	c.model = catalog[modelIdx].ID
	return nil
}

func (c *lmConfigComponent) handleAdvancedWheel(button tea.MouseButton) {
	if !c.open {
		return
	}
	fields := c.lmConfigAdvancedFields()
	if len(fields) == 0 {
		return
	}
	pos := 0
	for i, field := range fields {
		if field == c.field {
			pos = i
			break
		}
	}
	c.field = fields[moveSelectionByWheel(pos, len(fields), button)]
}
