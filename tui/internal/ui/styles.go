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

	t.Header = lipgloss.NewStyle().
		Foreground(t.Fg).
		Background(t.BgSubtle).
		Padding(0, 1)
	t.HeaderTitle = lipgloss.NewStyle().
		Bold(true).
		Foreground(t.Fg).
		Background(t.Primary).
		Padding(0, 1)
	t.Footer = lipgloss.NewStyle().
		Foreground(t.FgMuted).
		Background(t.BgSubtle).
		Padding(0, 1)
	t.Pane = lipgloss.NewStyle().
		Foreground(t.Fg).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Border).
		Padding(0, 1)
	t.PaneFoc = t.Pane.BorderForeground(t.BorderFocus)
	t.StatusBadge = lipgloss.NewStyle().
		Foreground(t.Bg).
		Background(t.Secondary).
		Padding(0, 1).
		Bold(true)
	t.HintKey = lipgloss.NewStyle().
		Foreground(t.Secondary).
		Bold(true)
	t.HintLabel = lipgloss.NewStyle().
		Foreground(t.FgMuted)

	return t
}
