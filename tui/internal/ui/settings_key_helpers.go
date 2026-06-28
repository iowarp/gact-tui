package ui

// settings_key_helpers.go adjusts settings stepper values and moves the settings selection.

func (c *settingsComponent) moveSelection(delta int) {
	if delta == 0 {
		return
	}
	switch c.tab {
	case 0:
		// Tab 0 has a single row (the change-provider action) - no list to navigate.
	case 1:
		c.agentSel = clampInt(c.agentSel+delta, 0, maxInt(0, len(c.agentList)-1))
		c.ensureAgentSelectionVisible()
	case 2:
		c.themeSel = clampInt(c.themeSel+delta, 0, len(AllThemeModes)-1)
		c.previewTheme(c.themeSel)
	case 3:
		c.tuiRow = clampInt(c.tuiRow+delta, 0, tuiPrefsRowCount-1)
	case 4:
		c.languageSel = clampInt(c.languageSel+delta, 0, len(availableLanguageOptions())-1)
		c.previewLanguage(c.languageSel)
	}
}

func (c *settingsComponent) adjustTUIRow(delta int) {
	if c.tab != 3 || delta == 0 {
		return
	}
	switch c.tuiRow {
	case 0:
		c.adjustCollapseThreshold(delta)
	case 1:
		c.adjustCostWarningThreshold(delta)
	case 2:
		c.adjustCostDangerThreshold(delta)
	case 3:
		c.adjustPasteCompressThreshold(delta)
	case 4:
		c.app.IntroDisabled = !c.app.IntroDisabled
		c.persistPrefs()
	case 5:
		c.app.MouseEnabled = !c.app.MouseEnabled
		c.persistPrefs()
	}
}

func (c *settingsComponent) adjustCollapseThreshold(delta int) {
	next := c.app.Theme.CollapseThreshold + delta
	if next < 1 || next > 50 {
		return
	}
	c.app.Theme.CollapseThreshold = next
	c.persistPrefs()
}

func (c *settingsComponent) adjustCostWarningThreshold(delta int) {
	next := adjustedCostThreshold(c.app.Theme.CostWarnTokens, delta)
	if next == c.app.Theme.CostWarnTokens {
		return
	}
	c.app.Theme.CostWarnTokens = next
	c.persistPrefs()
}

func (c *settingsComponent) adjustCostDangerThreshold(delta int) {
	next := adjustedCostThreshold(c.app.Theme.CostDangerTokens, delta)
	if next == c.app.Theme.CostDangerTokens {
		return
	}
	c.app.Theme.CostDangerTokens = next
	c.persistPrefs()
}

func adjustedCostThreshold(current int, delta int) int {
	if delta < 0 {
		if current > costMin+costStep {
			return current - costStep
		}
		if current > costMin {
			return costMin
		}
		return current
	}
	if current+costStep <= costMax {
		return current + costStep
	}
	return current
}

func (c *settingsComponent) adjustPasteCompressThreshold(delta int) {
	cur := c.app.Theme.PasteCompressThreshold
	if cur <= 0 {
		cur = 3
	}
	next := cur + delta
	if next < pasteThresholdMin || next > pasteThresholdMax {
		return
	}
	c.app.Theme.PasteCompressThreshold = next
	c.persistPrefs()
}
