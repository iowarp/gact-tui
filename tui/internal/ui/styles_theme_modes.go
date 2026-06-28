package ui

// styles_theme_modes.go enumerates theme modes and maps between modes, names, and Theme values.

import "image/color"

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
