package ui

// settings_keys.go is the settings modal's keyboard router.

import (
	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// handleKey routes keypresses while the Settings modal is open.
func (c *settingsComponent) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	a := c.app
	switch k.String() {
	case "esc", "ctrl+s":
		c.close()
		return a, nil
	case "tab":
		c.tab = (c.tab + 1) % settingsTabCount
		return a, nil
	case "shift+tab":
		c.tab = (c.tab + settingsTabCount - 1) % settingsTabCount
		return a, nil
	case "up", "k":
		c.moveSelection(-1)
		return a, nil
	case "down", "j":
		c.moveSelection(1)
		return a, nil
	case "e":
		if c.tab == 2 {
			return a, c.exportCurrentTheme()
		}
		return a, nil
	case "i":
		if c.tab == 2 {
			return a, c.importCustomTheme()
		}
		return a, nil
	case "b", "ctrl+b":
		if c.tab == 1 {
			return a, a.session.openSetup(true)
		}
		return a, nil
	case "left", "h":
		if c.tab == 3 {
			c.adjustTUIRow(-1)
		}
		return a, nil
	case "right", "l":
		if c.tab == 3 {
			c.adjustTUIRow(1)
		}
		return a, nil
	case "enter":
		switch c.tab {
		case 0:
			// Tab 0 is a single "Change provider..." entry point; Enter
			// hands off to the lifecycle LM-config modal. CLIO exposes
			// runtime model changes as a global LM provider swap
			// (PUT /v1/providers/lm), not as per-session model refs.
			c.open = false
			a.lmConfig.openModal()
			return a, lmConfigFetchCmd(a.c)
		case 2:
			// Theme apply is local; no backend PATCH. Live-swap the
			// lipgloss Theme so the conversation redraws with the new
			// palette; same plumbing K9 uses for config-reload. We
			// also persist the choice via SaveConfig so it survives
			// restart (N5 plumbing).
			mode := ModeDark
			if c.themeSel >= 0 && c.themeSel < len(AllThemeModes) {
				mode = AllThemeModes[c.themeSel]
			}
			c.applyThemePalette(ThemeForMode(mode))
			c.open = false
			a.setHint("theme: " + ThemeModeName(mode))
			c.persistPrefs()
			return a, nil
		case 1:
			c.openAgentDetail()
			return a, nil
		case 3:
			if c.tuiRow == 6 {
				a.sidebar.openLayoutEditor()
				return a, nil
			}
			c.open = false
			return a, nil
		}
		if c.tab == 4 {
			opt := activeLanguageOption(a.Locale())
			options := availableLanguageOptions()
			if c.languageSel >= 0 && c.languageSel < len(options) {
				opt = options[c.languageSel]
			}
			a.SetLocale(opt.Locale)
			c.open = false
			a.setHint(a.localizer.t(msgLanguageApplied,
				map[string]string{"label": a.localizer.languageOptionLabel(opt)}))
			c.persistPrefs()
			return a, nil
		}
		sid := a.session.currentID()
		if sid == "" {
			c.open = false
			return a, nil
		}
		var agentRef *gact.AgentRef
		if c.tab == 1 && c.agentSel < len(c.agentList) {
			ag := c.agentList[c.agentSel]
			agentRef = &gact.AgentRef{ID: ag.ID}
		}
		c.open = false
		return a, applySettingsCmd(a.c, sid, nil, agentRef)
	}
	return a, nil
}
