package ui

// settings_view_helpers.go provides settings-view tab hit, selection-label, and row-line helpers.

import (
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/charmbracelet/x/ansi"
)

func (c *settingsComponent) tabHits(activeTab int) []menuTab {
	a := c.app
	tabLabels := []string{
		a.localizer.t(msgSettingsTabModel, nil),
		a.localizer.t(msgSettingsTabAgent, nil),
		a.localizer.t(msgSettingsTabTheme, nil),
		a.localizer.t(msgSettingsTabTUI, nil),
		a.localizer.t(msgSettingsTabLanguage, nil),
	}
	tabIDs := []string{
		"settings-model",
		"settings-agent",
		"settings-theme",
		"settings-tui",
		"settings-language",
	}
	tabHits := make([]menuTab, 0, len(tabLabels))
	for i, label := range tabLabels {
		idx := i
		tabHits = append(tabHits, menuTab{
			id:     tabIDs[i],
			label:  label,
			active: activeTab == i,
			action: func(app *App) tea.Cmd {
				app.settings.tab = idx
				return nil
			},
		})
	}
	return tabHits
}

func (c *settingsComponent) currentSelectionLabels() (string, string) {
	a := c.app
	currentModel := ""
	currentAgent := ""
	if a.session.selected >= 0 && a.session.selected < len(a.session.sessions) {
		sess := a.session.sessions[a.session.selected]
		if sess.Model.ModelID != "" {
			currentModel = sess.Model.ProviderID + "/" + sess.Model.ModelID
		}
		if sess.Agent.ID != "" {
			currentAgent = sess.Agent.ID
		}
	}
	// CLIO-style backends ship a global LM config rather than per-session
	// ModelRefs; surface it so the Settings current line stays meaningful.
	if currentModel == "" && a.lmProviderInfo != nil && a.lmProviderInfo.Configured && a.lmProviderInfo.Model != "" {
		currentModel = a.lmProviderInfo.Provider + "/" + a.lmProviderInfo.Model
	}
	return currentModel, currentAgent
}

func (c *settingsComponent) rowLine(selected bool, primaryText, secondaryText string, width, innerWidth int, activeTab int) string {
	t := c.app.Theme
	marker := "  "
	titleStyle := lipgloss.NewStyle().Foreground(t.Fg)
	descStyle := lipgloss.NewStyle().Foreground(t.FgMuted)
	if selected {
		marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
		titleStyle = titleStyle.Foreground(t.Secondary).Bold(true)
	}
	rowBudget := width - 2
	if activeTab == 1 {
		rowBudget = modalScrollableContentWidth(width)
	}
	line := marker + titleStyle.Render(primaryText)
	if secondaryText != "" {
		secondaryBudget := rowBudget - lipgloss.Width(ansi.Strip(marker)) - lipgloss.Width(primaryText) - 2
		if secondaryBudget > 0 {
			line += "  " + descStyle.Render(textutil.Truncate(secondaryText, secondaryBudget))
		}
	}
	out := textutil.Truncate(line, rowBudget)
	if selected {
		out = lipgloss.NewStyle().Background(t.Bg).Width(innerWidth).Render(out)
	}
	return out
}
