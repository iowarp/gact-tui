// Package ui contains the Bubbletea models, views, and update logic for the
// GACT TUI client.
package ui

import (
	"image/color"

	"charm.land/lipgloss/v2"
)

// Theme bundles the colour palette + reusable styles. Built once at startup
// and passed by value so styles don't need to recompute their internals.
type Theme struct {
	// Colours
	Bg          color.Color
	BgSubtle    color.Color
	Fg          color.Color
	FgMuted     color.Color
	FgFaint     color.Color
	Primary     color.Color
	Secondary   color.Color
	Success     color.Color
	Warning     color.Color
	Danger      color.Color
	Border      color.Color
	BorderFocus color.Color

	// Role colours
	RoleUser      color.Color
	RoleAssistant color.Color
	RoleSystem    color.Color
	RoleTool      color.Color

	// Pre-built styles
	Header      lipgloss.Style
	Footer      lipgloss.Style
	Pane        lipgloss.Style
	PaneFoc     lipgloss.Style
	HeaderTitle lipgloss.Style
	StatusBadge lipgloss.Style
	HintKey     lipgloss.Style
	HintLabel   lipgloss.Style
}

// ThemeMode picks which palette DefaultTheme returns.
type ThemeMode int

const (
	// ModeDark uses the high-contrast dark palette (default).
	ModeDark ThemeMode = iota
	// ModeLight uses palette tuned for light-background terminals.
	ModeLight
)

// LightTheme returns a palette tuned for light-background terminals.
// Foreground/background flip; accent colors shift to mid-tone variants
// that read against a light background.
func LightTheme() Theme {
	primary := lipgloss.Color("#5E3DC4")     // darker purple
	secondary := lipgloss.Color("#1A8F5C")   // darker green
	bg := lipgloss.Color("#FAFAF7")
	bgSub := lipgloss.Color("#EDEDE3")
	fg := lipgloss.Color("#1F1F2A")
	muted := lipgloss.Color("#5C6070")
	faint := lipgloss.Color("#9CA0AC")
	border := lipgloss.Color("#D6D6CB")
	borderFocus := lipgloss.Color("#5E3DC4")

	t := Theme{
		Bg: bg, BgSubtle: bgSub, Fg: fg, FgMuted: muted, FgFaint: faint,
		Primary: primary, Secondary: secondary,
		Success: lipgloss.Color("#1A8F5C"),
		Warning: lipgloss.Color("#B8860B"),
		Danger:  lipgloss.Color("#C82B2B"),
		Border:  border, BorderFocus: borderFocus,
		RoleUser:      lipgloss.Color("#0E5B86"),
		RoleAssistant: lipgloss.Color("#5E3DC4"),
		RoleSystem:    muted,
		RoleTool:      lipgloss.Color("#B8860B"),
	}
	t.applyStyles()
	return t
}

// applyStyles fills the prebuilt style fields from the colour palette.
// Shared between LightTheme and DefaultTheme so both stay in sync.
func (t *Theme) applyStyles() {
	t.Header = lipgloss.NewStyle().
		Foreground(t.Fg).Background(t.BgSubtle).Padding(0, 1)
	t.HeaderTitle = lipgloss.NewStyle().
		Bold(true).Foreground(t.Bg).Background(t.Primary).Padding(0, 1)
	t.Footer = lipgloss.NewStyle().
		Foreground(t.FgMuted).Background(t.BgSubtle).Padding(0, 1)
	t.Pane = lipgloss.NewStyle().
		Foreground(t.Fg).Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Border).Padding(0, 1)
	t.PaneFoc = t.Pane.BorderForeground(t.BorderFocus)
	t.StatusBadge = lipgloss.NewStyle().
		Foreground(t.Bg).Background(t.Secondary).Padding(0, 1).Bold(true)
	t.HintKey = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	t.HintLabel = lipgloss.NewStyle().Foreground(t.FgMuted)
}

// DefaultTheme returns a dark-leaning palette tuned for terminals.
func DefaultTheme() Theme {
	primary := lipgloss.Color("#7D56F4")
	secondary := lipgloss.Color("#73F59F")
	bg := lipgloss.Color("#0F0F14")
	bgSub := lipgloss.Color("#191923")
	fg := lipgloss.Color("#EDEDED")
	muted := lipgloss.Color("#7C7F8B")
	faint := lipgloss.Color("#4A4D58")
	border := lipgloss.Color("#2E2E3A")
	borderFocus := lipgloss.Color("#7D56F4")

	t := Theme{
		Bg: bg, BgSubtle: bgSub, Fg: fg, FgMuted: muted, FgFaint: faint,
		Primary: primary, Secondary: secondary,
		Success: lipgloss.Color("#73F59F"),
		Warning: lipgloss.Color("#F2C94C"),
		Danger:  lipgloss.Color("#FF6B6B"),
		Border:  border, BorderFocus: borderFocus,
		RoleUser:      lipgloss.Color("#5BC0EB"),
		RoleAssistant: lipgloss.Color("#B478FF"),
		RoleSystem:    lipgloss.Color("#7C7F8B"),
		RoleTool:      lipgloss.Color("#F2C94C"),
	}

	t.applyStyles()
	return t
}

// ThemeForMode returns DefaultTheme or LightTheme.
func ThemeForMode(m ThemeMode) Theme {
	if m == ModeLight {
		return LightTheme()
	}
	return DefaultTheme()
}

// ParseThemeMode maps a CLI/string value to a ThemeMode. Unknown → dark.
func ParseThemeMode(s string) ThemeMode {
	switch s {
	case "light":
		return ModeLight
	default:
		return ModeDark
	}
}
