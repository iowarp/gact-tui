package ui

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

// settings.go provides settings-modal helpers: page size, tab purpose, selection seeding, and prefs persistence.

func (c *settingsComponent) bodyPageSize() int {
	return valuefmt.MinInt(24, c.app.modals.modalBodyRows(14))
}

func (c *settingsComponent) tabPurpose(tab int) string {
	switch tab {
	case 0:
		return "Provider/model runtime is managed through the shared " + brandName() + " provider modal."
	case 1:
		return "Choose the session expert and new-session workflow defaults."
	case 2:
		return "Preview terminal palettes before applying them."
	case 3:
		return "Tune transcript density, paste behavior, mouse capture, and sidebar layout."
	case 4:
		return "Switch TUI language labels without changing backend session data."
	default:
		return ""
	}
}

func orPlaceholder(s, placeholder string) string {
	if s == "" {
		return placeholder
	}
	return s
}

func (c *settingsComponent) seedSelections() {
	cur := ThemeModeFor(c.app.Theme)
	for i, mode := range AllThemeModes {
		if mode == cur {
			c.themeSel = i
			break
		}
	}
	c.languageSel = languageIndex(c.app.Locale())
}

func (c *settingsComponent) previewLanguage(idx int) {
	options := availableLanguageOptions()
	if idx < 0 || idx >= len(options) {
		return
	}
	c.app.SetLocale(options[idx].Locale)
}

// persistPrefs asks the host (main.go) to save the current Settings
// > TUI values to disk. No-op when SaveConfig isn't wired (tests,
// embedded-mode callers) so the in-memory UI still reflects the
// latest stepper click.
func (c *settingsComponent) persistPrefs() {
	if c.app.SaveConfig == nil {
		return
	}
	if err := c.app.SaveConfig(); err != nil {
		c.app.setHint("config save failed: " + err.Error())
	}
}

// itoa2 is a tiny int-to-string helper for small positive integers.
// Spelled out to avoid pulling strconv into this file; only used by
// the settings display.
func itoa2(n int) string {
	if n == 0 {
		return "0"
	}
	neg := false
	if n < 0 {
		neg = true
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
