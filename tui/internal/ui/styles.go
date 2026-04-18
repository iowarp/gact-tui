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

	// CollapseThreshold is the line-count above which tool_result
	// output is preview-collapsed in the conversation pane (the full
	// content is still reachable via Ctrl+E). 0 disables collapse.
	// User-controllable via Settings > TUI; default 5 matches the
	// feedback ask.
	CollapseThreshold int

	// ShowTimestamps toggles a dim "2026-04-18 20:34" line under
	// each message's role header. Flipped by `t` on body focus; not
	// persisted (local debugging aid, not a real preference).
	ShowTimestamps bool

	// CostWarnTokens and CostDangerTokens are the input-token
	// thresholds that tint the footer's token counter. 0 means
	// "use the built-in defaults": 100K / 150K — sized for Claude
	// Sonnet/Opus context windows. Local models with 32K or 8K
	// windows can lower them via config.json or the CLI flag.
	CostWarnTokens   int
	CostDangerTokens int
}

// ThemeMode identifies which named palette to load. New palettes get a
// new constant and a branch in ThemeForMode + ParseThemeMode.
type ThemeMode int

const (
	// ModeDark uses the high-contrast dark palette (default).
	ModeDark ThemeMode = iota
	// ModeLight uses the cleaned-up light palette (Gruvbox-inspired
	// warm background).
	ModeLight
	// ModeDracula is the classic Dracula palette — purple+cyan on
	// near-black. Popular and contrast-heavy enough that every
	// accent colour pops even with the background.
	ModeDracula
	// ModeSolarizedDark is the Solarized low-contrast dark variant.
	ModeSolarizedDark
	// ModeSolarizedLight is Solarized's paper-inspired light variant.
	// Usable where the stock light theme fails.
	ModeSolarizedLight
	// ModeNord pairs the arctic-blue Nord palette with a slightly
	// warmer foreground for body text so long assistant replies stay
	// legible.
	ModeNord
	// ModeTokyoNight is deep-navy on near-black with neon accents —
	// popular in the VS Code / Vim ecosystem.
	ModeTokyoNight
	// ModeCustom points to whatever palette was loaded from
	// ~/.config/gact/theme.json at startup. Only surfaces in the
	// Theme picker when IsCustomThemeAvailable() is true.
	ModeCustom
)

// AllThemeModes is the pickable list rendered by Settings > Theme.
// Built-in ordering is append-only for muscle memory; ModeCustom is
// appended at runtime by registerCustomTheme when a custom palette
// loads successfully.
var AllThemeModes = []ThemeMode{
	ModeDark,
	ModeLight,
	ModeDracula,
	ModeSolarizedDark,
	ModeSolarizedLight,
	ModeNord,
	ModeTokyoNight,
}

// registerCustomTheme appends ModeCustom to AllThemeModes. Idempotent
// so LoadCustomTheme can call it unconditionally.
func registerCustomTheme() {
	for _, m := range AllThemeModes {
		if m == ModeCustom {
			return
		}
	}
	AllThemeModes = append(AllThemeModes, ModeCustom)
}

// ThemeModeName returns the string identifier used in config.json /
// CLI flags for a given ThemeMode. Inverse of ParseThemeMode.
func ThemeModeName(m ThemeMode) string {
	switch m {
	case ModeLight:
		return "light"
	case ModeDracula:
		return "dracula"
	case ModeSolarizedDark:
		return "solarized-dark"
	case ModeSolarizedLight:
		return "solarized-light"
	case ModeNord:
		return "nord"
	case ModeTokyoNight:
		return "tokyo-night"
	case ModeCustom:
		return "custom"
	}
	return "dark"
}

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
		Bg:       lipgloss.Color("#FBF1C7"), // cream
		BgSubtle: lipgloss.Color("#EBDBB2"),
		Fg:       lipgloss.Color("#3C3836"),
		FgMuted:  lipgloss.Color("#7C6F64"),
		FgFaint:  lipgloss.Color("#BDAE93"),
		Primary:  lipgloss.Color("#B16286"), // magenta
		Secondary: lipgloss.Color("#076678"), // teal
		Success:  lipgloss.Color("#79740E"),
		Warning:  lipgloss.Color("#B57614"),
		Danger:   lipgloss.Color("#9D0006"),
		Border:   lipgloss.Color("#D5C4A1"),
		BorderFocus: lipgloss.Color("#B16286"),
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
		Bg:        lipgloss.Color("#282A36"),
		BgSubtle:  lipgloss.Color("#1E1F29"),
		Fg:        lipgloss.Color("#F8F8F2"),
		FgMuted:   lipgloss.Color("#A4A6B5"),
		FgFaint:   lipgloss.Color("#6272A4"),
		Primary:   lipgloss.Color("#BD93F9"), // purple
		Secondary: lipgloss.Color("#50FA7B"), // green
		Success:   lipgloss.Color("#50FA7B"),
		Warning:   lipgloss.Color("#FFB86C"),
		Danger:    lipgloss.Color("#FF5555"),
		Border:    lipgloss.Color("#44475A"),
		BorderFocus: lipgloss.Color("#BD93F9"),
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
		Bg:        lipgloss.Color("#002B36"), // base03
		BgSubtle:  lipgloss.Color("#073642"), // base02
		Fg:        lipgloss.Color("#93A1A1"), // base1
		FgMuted:   lipgloss.Color("#839496"), // base0
		FgFaint:   lipgloss.Color("#586E75"), // base01
		Primary:   lipgloss.Color("#268BD2"), // blue
		Secondary: lipgloss.Color("#2AA198"), // cyan
		Success:   lipgloss.Color("#859900"), // green
		Warning:   lipgloss.Color("#B58900"), // yellow
		Danger:    lipgloss.Color("#DC322F"), // red
		Border:    lipgloss.Color("#586E75"),
		BorderFocus: lipgloss.Color("#268BD2"),
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
		Bg:        lipgloss.Color("#FDF6E3"), // base3
		BgSubtle:  lipgloss.Color("#EEE8D5"), // base2
		Fg:        lipgloss.Color("#586E75"), // base01
		FgMuted:   lipgloss.Color("#657B83"), // base00
		FgFaint:   lipgloss.Color("#93A1A1"), // base1
		Primary:   lipgloss.Color("#268BD2"),
		Secondary: lipgloss.Color("#2AA198"),
		Success:   lipgloss.Color("#859900"),
		Warning:   lipgloss.Color("#B58900"),
		Danger:    lipgloss.Color("#DC322F"),
		Border:    lipgloss.Color("#93A1A1"),
		BorderFocus: lipgloss.Color("#268BD2"),
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
		Bg:        lipgloss.Color("#2E3440"), // nord0
		BgSubtle:  lipgloss.Color("#3B4252"), // nord1
		Fg:        lipgloss.Color("#ECEFF4"), // nord6
		FgMuted:   lipgloss.Color("#D8DEE9"), // nord4
		FgFaint:   lipgloss.Color("#616E88"),
		Primary:   lipgloss.Color("#88C0D0"), // nord8 — frost
		Secondary: lipgloss.Color("#A3BE8C"), // nord14 — aurora green
		Success:   lipgloss.Color("#A3BE8C"),
		Warning:   lipgloss.Color("#EBCB8B"), // nord13
		Danger:    lipgloss.Color("#BF616A"), // nord11
		Border:    lipgloss.Color("#434C5E"),
		BorderFocus: lipgloss.Color("#88C0D0"),
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
		Bg:        lipgloss.Color("#1A1B26"),
		BgSubtle:  lipgloss.Color("#16161E"),
		Fg:        lipgloss.Color("#C0CAF5"),
		FgMuted:   lipgloss.Color("#A9B1D6"),
		FgFaint:   lipgloss.Color("#565F89"),
		Primary:   lipgloss.Color("#BB9AF7"), // purple
		Secondary: lipgloss.Color("#7AA2F7"), // blue
		Success:   lipgloss.Color("#9ECE6A"), // green
		Warning:   lipgloss.Color("#E0AF68"), // orange
		Danger:    lipgloss.Color("#F7768E"), // pink-red
		Border:    lipgloss.Color("#3B4261"),
		BorderFocus: lipgloss.Color("#BB9AF7"),
		RoleUser:      lipgloss.Color("#7DCFFF"), // cyan
		RoleAssistant: lipgloss.Color("#BB9AF7"),
		RoleSystem:    lipgloss.Color("#565F89"),
		RoleTool:      lipgloss.Color("#E0AF68"),
	}.finalize()
}

// finalize runs applyStyles on a palette-only Theme so all the
// pre-styled fields (Header, Pane, HintKey, etc.) pick up the
// palette's colours. Value receiver because callers want the
// returned Theme to be passed around by value.
func (t Theme) finalize() Theme {
	t.applyStyles()
	return t
}

// applyStyles fills the prebuilt style fields from the colour palette.
// Shared across every palette constructor so visual affordances stay
// consistent (pane borders, padding, hint styling, etc.).
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
	if t.CollapseThreshold == 0 {
		t.CollapseThreshold = 5
	}
	// Cost-meter thresholds — default to Claude-sized windows. Users
	// on smaller local models lower them through Settings > TUI or
	// config.json.
	if t.CostWarnTokens == 0 {
		t.CostWarnTokens = 100_000
	}
	if t.CostDangerTokens == 0 {
		t.CostDangerTokens = 150_000
	}
}

// ThemeForMode returns the Theme bound to a ThemeMode. Unknown mode →
// ModeDark (fail closed so a bad config value doesn't crash the TUI).
func ThemeForMode(m ThemeMode) Theme {
	switch m {
	case ModeLight:
		return LightTheme()
	case ModeDracula:
		return DraculaTheme()
	case ModeSolarizedDark:
		return SolarizedDarkTheme()
	case ModeSolarizedLight:
		return SolarizedLightTheme()
	case ModeNord:
		return NordTheme()
	case ModeTokyoNight:
		return TokyoNightTheme()
	case ModeCustom:
		return customTheme()
	}
	return DefaultTheme()
}

// ThemeModeFor returns the ThemeMode whose palette matches the
// given Theme's background colour. Used by SaveConfig to serialise
// the currently-active theme back to disk — we don't track the mode
// on the Theme struct itself so this round-trip goes via colour
// identity. Unknown Bg → ModeDark (safest fallback).
//
// Custom themes are checked first so a user-loaded palette that
// happens to match a built-in by coincidence still round-trips as
// ModeCustom (the user's file wins over the shipped palette).
func ThemeModeFor(t Theme) ThemeMode {
	if IsCustomThemeAvailable() {
		custom := customTheme()
		if sameColor(custom.Bg, t.Bg) && sameColor(custom.Fg, t.Fg) {
			return ModeCustom
		}
	}
	for _, m := range AllThemeModes {
		if m == ModeCustom {
			continue // already handled above
		}
		candidate := ThemeForMode(m)
		if sameColor(candidate.Bg, t.Bg) && sameColor(candidate.Fg, t.Fg) {
			return m
		}
	}
	return ModeDark
}

// sameColor compares two color.Color values by their 16-bit RGBA
// channels. Direct equality fails because the lipgloss "#RRGGBB" ctor
// can return different concrete types across calls.
func sameColor(a, b color.Color) bool {
	ar, ag, ab, aa := a.RGBA()
	br, bg, bb, ba := b.RGBA()
	return ar == br && ag == bg && ab == bb && aa == ba
}

// ParseThemeMode maps a CLI/string value to a ThemeMode. Unknown → dark.
// Names mirror ThemeModeName so a round-trip config write-then-read
// lands at the same palette.
func ParseThemeMode(s string) ThemeMode {
	switch s {
	case "light":
		return ModeLight
	case "dracula":
		return ModeDracula
	case "solarized-dark":
		return ModeSolarizedDark
	case "solarized-light":
		return ModeSolarizedLight
	case "nord":
		return ModeNord
	case "tokyo-night":
		return ModeTokyoNight
	case "custom":
		return ModeCustom
	default:
		return ModeDark
	}
}
