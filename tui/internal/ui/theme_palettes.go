package ui

// theme_palettes.go defines the built-in theme color palettes.

import "charm.land/lipgloss/v2"

// DefaultTheme returns a dark-leaning palette tuned for terminals.
// Historical name kept so older code paths still compile.
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

// LightTheme is the cleaned-up light palette. The previous incarnation
// lost tool-call accent colors against the near-paper background;
// this version uses warmer cream tones (Gruvbox-inspired) with
// saturated accents that survive a low-contrast display.
func LightTheme() Theme {
	return Theme{
		Bg:            lipgloss.Color("#FBF1C7"), // cream
		BgSubtle:      lipgloss.Color("#EBDBB2"),
		Fg:            lipgloss.Color("#3C3836"),
		FgMuted:       lipgloss.Color("#7C6F64"),
		FgFaint:       lipgloss.Color("#BDAE93"),
		Primary:       lipgloss.Color("#B16286"), // magenta
		Secondary:     lipgloss.Color("#076678"), // teal
		Success:       lipgloss.Color("#79740E"),
		Warning:       lipgloss.Color("#B57614"),
		Danger:        lipgloss.Color("#9D0006"),
		Border:        lipgloss.Color("#D5C4A1"),
		BorderFocus:   lipgloss.Color("#B16286"),
		RoleUser:      lipgloss.Color("#076678"),
		RoleAssistant: lipgloss.Color("#8F3F71"),
		RoleSystem:    lipgloss.Color("#7C6F64"),
		RoleTool:      lipgloss.Color("#B57614"),
	}.finalize()
}

// DraculaTheme is the canonical Dracula palette (dracula.io).
// Purple/pink/cyan on near-black; high contrast across the board.
func DraculaTheme() Theme {
	return Theme{
		Bg:            lipgloss.Color("#282A36"),
		BgSubtle:      lipgloss.Color("#1E1F29"),
		Fg:            lipgloss.Color("#F8F8F2"),
		FgMuted:       lipgloss.Color("#A4A6B5"),
		FgFaint:       lipgloss.Color("#6272A4"),
		Primary:       lipgloss.Color("#BD93F9"), // purple
		Secondary:     lipgloss.Color("#50FA7B"), // green
		Success:       lipgloss.Color("#50FA7B"),
		Warning:       lipgloss.Color("#FFB86C"),
		Danger:        lipgloss.Color("#FF5555"),
		Border:        lipgloss.Color("#44475A"),
		BorderFocus:   lipgloss.Color("#BD93F9"),
		RoleUser:      lipgloss.Color("#8BE9FD"), // cyan
		RoleAssistant: lipgloss.Color("#FF79C6"), // pink
		RoleSystem:    lipgloss.Color("#6272A4"),
		RoleTool:      lipgloss.Color("#F1FA8C"), // yellow
	}.finalize()
}

// SolarizedDarkTheme is Solarized's dark variant. Low-contrast by
// design — lets long reading sessions not tire the eyes.
func SolarizedDarkTheme() Theme {
	return Theme{
		Bg:            lipgloss.Color("#002B36"), // base03
		BgSubtle:      lipgloss.Color("#073642"), // base02
		Fg:            lipgloss.Color("#93A1A1"), // base1
		FgMuted:       lipgloss.Color("#839496"), // base0
		FgFaint:       lipgloss.Color("#586E75"), // base01
		Primary:       lipgloss.Color("#268BD2"), // blue
		Secondary:     lipgloss.Color("#2AA198"), // cyan
		Success:       lipgloss.Color("#859900"), // green
		Warning:       lipgloss.Color("#B58900"), // yellow
		Danger:        lipgloss.Color("#DC322F"), // red
		Border:        lipgloss.Color("#586E75"),
		BorderFocus:   lipgloss.Color("#268BD2"),
		RoleUser:      lipgloss.Color("#268BD2"),
		RoleAssistant: lipgloss.Color("#6C71C4"), // violet
		RoleSystem:    lipgloss.Color("#586E75"),
		RoleTool:      lipgloss.Color("#CB4B16"), // orange
	}.finalize()
}

// SolarizedLightTheme is the paper-inspired variant. Same accent
// colours as SolarizedDark on an inverted base.
func SolarizedLightTheme() Theme {
	return Theme{
		Bg:            lipgloss.Color("#FDF6E3"), // base3
		BgSubtle:      lipgloss.Color("#EEE8D5"), // base2
		Fg:            lipgloss.Color("#586E75"), // base01
		FgMuted:       lipgloss.Color("#657B83"), // base00
		FgFaint:       lipgloss.Color("#93A1A1"), // base1
		Primary:       lipgloss.Color("#268BD2"),
		Secondary:     lipgloss.Color("#2AA198"),
		Success:       lipgloss.Color("#859900"),
		Warning:       lipgloss.Color("#B58900"),
		Danger:        lipgloss.Color("#DC322F"),
		Border:        lipgloss.Color("#93A1A1"),
		BorderFocus:   lipgloss.Color("#268BD2"),
		RoleUser:      lipgloss.Color("#268BD2"),
		RoleAssistant: lipgloss.Color("#6C71C4"),
		RoleSystem:    lipgloss.Color("#93A1A1"),
		RoleTool:      lipgloss.Color("#CB4B16"),
	}.finalize()
}

// NordTheme is the arctic-blue Nord palette — calm, low-saturation
// tones on a deep navy background.
func NordTheme() Theme {
	return Theme{
		Bg:            lipgloss.Color("#2E3440"), // nord0
		BgSubtle:      lipgloss.Color("#3B4252"), // nord1
		Fg:            lipgloss.Color("#ECEFF4"), // nord6
		FgMuted:       lipgloss.Color("#D8DEE9"), // nord4
		FgFaint:       lipgloss.Color("#616E88"),
		Primary:       lipgloss.Color("#88C0D0"), // nord8 — frost
		Secondary:     lipgloss.Color("#A3BE8C"), // nord14 — aurora green
		Success:       lipgloss.Color("#A3BE8C"),
		Warning:       lipgloss.Color("#EBCB8B"), // nord13
		Danger:        lipgloss.Color("#BF616A"), // nord11
		Border:        lipgloss.Color("#434C5E"),
		BorderFocus:   lipgloss.Color("#88C0D0"),
		RoleUser:      lipgloss.Color("#81A1C1"), // nord9
		RoleAssistant: lipgloss.Color("#B48EAD"), // nord15 — aurora purple
		RoleSystem:    lipgloss.Color("#4C566A"),
		RoleTool:      lipgloss.Color("#D08770"), // nord12 — aurora orange
	}.finalize()
}

// TokyoNightTheme is deep-navy on near-black with neon accents —
// the "cyberpunk glow" look popular in VS Code.
func TokyoNightTheme() Theme {
	return Theme{
		Bg:            lipgloss.Color("#1A1B26"),
		BgSubtle:      lipgloss.Color("#16161E"),
		Fg:            lipgloss.Color("#C0CAF5"),
		FgMuted:       lipgloss.Color("#A9B1D6"),
		FgFaint:       lipgloss.Color("#565F89"),
		Primary:       lipgloss.Color("#BB9AF7"), // purple
		Secondary:     lipgloss.Color("#7AA2F7"), // blue
		Success:       lipgloss.Color("#9ECE6A"), // green
		Warning:       lipgloss.Color("#E0AF68"), // orange
		Danger:        lipgloss.Color("#F7768E"), // pink-red
		Border:        lipgloss.Color("#3B4261"),
		BorderFocus:   lipgloss.Color("#BB9AF7"),
		RoleUser:      lipgloss.Color("#7DCFFF"), // cyan
		RoleAssistant: lipgloss.Color("#BB9AF7"),
		RoleSystem:    lipgloss.Color("#565F89"),
		RoleTool:      lipgloss.Color("#E0AF68"),
	}.finalize()
}
