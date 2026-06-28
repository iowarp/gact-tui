package ui

// settings_theme.go manages theme settings (preview, apply, export, import, localized names).

import (
	"os"

	tea "charm.land/bubbletea/v2"
)

func (c *settingsComponent) exportCurrentTheme() tea.Cmd {
	a := c.app
	path, pathErr := CustomThemeDefaultPath()
	if pathErr != nil {
		a.setHint("theme export: " + pathErr.Error())
		return scheduleHintExpire(a.transientHint)
	}
	if err := SaveCustomTheme(a.Theme, path); err != nil {
		a.setHint("theme export failed: " + err.Error())
	} else {
		a.setHint("exported " + ThemeModeName(ThemeModeFor(a.Theme)) + " -> " + path)
	}
	return scheduleHintExpire(a.transientHint)
}

func (c *settingsComponent) importCustomTheme() tea.Cmd {
	a := c.app
	path, pathErr := CustomThemeDefaultPath()
	if pathErr != nil {
		a.setHint("theme import: " + pathErr.Error())
		return scheduleHintExpire(a.transientHint)
	}
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			a.setHint("theme import: no theme.json at " + path)
		} else {
			a.setHint("theme import: " + err.Error())
		}
		return scheduleHintExpire(a.transientHint)
	}
	name, err := LoadCustomTheme(path)
	if err != nil {
		a.setHint("theme import failed: " + err.Error())
		return scheduleHintExpire(a.transientHint)
	}
	c.applyThemePalette(ThemeForMode(ModeCustom))
	c.tab = 2
	c.seedSelections()
	if name == "" {
		name = "custom"
	}
	a.setHint("loaded custom theme: " + name + " <- " + path)
	c.persistPrefs()
	return scheduleHintExpire(a.transientHint)
}

// themeName returns the canonical string identifier for a Theme.
// Used by the Theme tab's "current:" row, the settings hint, and
// the Ctrl+L / --theme config persistence round-trip. Previously
// keyed off background luminance (r,g,b > 60000 = light); now uses
// ThemeModeFor which matches against the known palettes exactly so
// adding new themes doesn't silently mislabel them.
func themeName(t Theme) string {
	return ThemeModeName(ThemeModeFor(t))
}

func (c *settingsComponent) localizedThemeName(mode ThemeMode) string {
	a := c.app
	switch mode {
	case ModeDark:
		return a.localizer.t(messageID("settings.theme.dark"), nil)
	case ModeLight:
		return a.localizer.t(messageID("settings.theme.light"), nil)
	case ModeDracula:
		return a.localizer.t(messageID("settings.theme.dracula"), nil)
	case ModeSolarizedDark:
		return a.localizer.t(messageID("settings.theme.solarized_dark"), nil)
	case ModeSolarizedLight:
		return a.localizer.t(messageID("settings.theme.solarized_light"), nil)
	case ModeNord:
		return a.localizer.t(messageID("settings.theme.nord"), nil)
	case ModeTokyoNight:
		return a.localizer.t(messageID("settings.theme.tokyo_night"), nil)
	case ModeCustom:
		return a.localizer.t(messageID("settings.theme.custom"), nil)
	default:
		return ThemeModeName(mode)
	}
}

func (c *settingsComponent) localizedThemeDescription(mode ThemeMode) string {
	a := c.app
	switch mode {
	case ModeDark:
		return a.localizer.t(messageID("settings.theme.desc.dark"), nil)
	case ModeLight:
		return a.localizer.t(messageID("settings.theme.desc.light"), nil)
	case ModeDracula:
		return a.localizer.t(messageID("settings.theme.desc.dracula"), nil)
	case ModeSolarizedDark:
		return a.localizer.t(messageID("settings.theme.desc.solarized_dark"), nil)
	case ModeSolarizedLight:
		return a.localizer.t(messageID("settings.theme.desc.solarized_light"), nil)
	case ModeNord:
		return a.localizer.t(messageID("settings.theme.desc.nord"), nil)
	case ModeTokyoNight:
		return a.localizer.t(messageID("settings.theme.desc.tokyo_night"), nil)
	case ModeCustom:
		return a.localizer.t(messageID("settings.theme.desc.custom"), nil)
	default:
		return ""
	}
}

// previewTheme live-swaps a.Theme as the user steps through the
// theme picker with ↑/↓. The current CollapseThreshold survives the
// swap — no one wants their pref reset just because they're
// flipping through palettes.
func (c *settingsComponent) previewTheme(idx int) {
	if idx < 0 || idx >= len(AllThemeModes) {
		return
	}
	c.applyThemePalette(ThemeForMode(AllThemeModes[idx]))
}

func (c *settingsComponent) applyThemePalette(next Theme) {
	a := c.app
	prevCT := a.Theme.CollapseThreshold
	prevW := a.Theme.CostWarnTokens
	prevD := a.Theme.CostDangerTokens
	prevPaste := a.Theme.PasteCompressThreshold
	a.Theme = next
	a.Theme.CollapseThreshold = prevCT
	a.Theme.CostWarnTokens = prevW
	a.Theme.CostDangerTokens = prevD
	a.Theme.PasteCompressThreshold = prevPaste
	a.Theme.applyStyles()
}
