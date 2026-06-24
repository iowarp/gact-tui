// Custom theme loader (P2). Reads a palette JSON from
// ~/.config/gact/theme.json (or GACT_CONFIG_DIR/theme.json) at startup
// and registers it as ModeCustom so users can ship their own palette
// without rebuilding the binary.
//
// File schema: every field optional. Anything the user doesn't set
// falls back to the dark defaults — matches applyStyles' behaviour
// for the collapse threshold and cost meter.
//
// Example ~/.config/gact/theme.json:
//
//	{
//	  "name": "my-theme",
//	  "bg": "#0F0F14",
//	  "fg": "#EDEDED",
//	  "primary": "#FF79C6",
//	  "secondary": "#8BE9FD",
//	  "warning": "#F2C94C",
//	  "role_user": "#5BC0EB",
//	  "role_assistant": "#FF79C6"
//	}
//
// The fields mirror the Theme struct's colour-only fields. Style
// objects (Pane, Header, etc.) are rebuilt via applyStyles so users
// don't need to think about borders or padding.
package ui

// theme_custom.go loads, applies, exports, and saves the user's custom theme.

import (
	"encoding/json"
	"image/color"
	"os"
	"path/filepath"

	"charm.land/lipgloss/v2"
)

// setHex replaces *dst with lipgloss.Color(hex) when hex is non-empty.
// Short enough that inlining apply() stays readable; keeps the nil
// behaviour local to one helper.
func setHex(dst *color.Color, hex string) {
	if hex == "" {
		return
	}
	*dst = lipgloss.Color(hex)
}

// customThemeDoc is the JSON on-disk shape. Every field is optional;
// unspecified fields inherit from the dark baseline before
// applyStyles kicks in.
type customThemeDoc struct {
	Name          string `json:"name,omitempty"`
	Bg            string `json:"bg,omitempty"`
	BgSubtle      string `json:"bg_subtle,omitempty"`
	Fg            string `json:"fg,omitempty"`
	FgMuted       string `json:"fg_muted,omitempty"`
	FgFaint       string `json:"fg_faint,omitempty"`
	Primary       string `json:"primary,omitempty"`
	Secondary     string `json:"secondary,omitempty"`
	Success       string `json:"success,omitempty"`
	Warning       string `json:"warning,omitempty"`
	Danger        string `json:"danger,omitempty"`
	Border        string `json:"border,omitempty"`
	BorderFocus   string `json:"border_focus,omitempty"`
	RoleUser      string `json:"role_user,omitempty"`
	RoleAssistant string `json:"role_assistant,omitempty"`
	RoleSystem    string `json:"role_system,omitempty"`
	RoleTool      string `json:"role_tool,omitempty"`
}

// customThemeRegistry holds a loaded custom palette. nil when no file
// was loaded (or load failed); callers check IsCustomThemeAvailable
// before offering the user ModeCustom.
var customThemeRegistry *Theme

// LoadCustomTheme reads the named path and, on success, installs the
// resulting Theme as the registry entry for ModeCustom. Missing file
// is not an error — it just means no custom theme is available.
//
// Returns the loaded display name (for the Theme picker description)
// and any parse error. Parse errors don't install the theme so a
// malformed file doesn't break TUI startup.
func LoadCustomTheme(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil // no custom theme — not an error
		}
		return "", err
	}
	var doc customThemeDoc
	if err := json.Unmarshal(data, &doc); err != nil {
		return "", err
	}
	theme := doc.apply(DefaultTheme())
	customThemeRegistry = &theme
	customThemeDisplayName = doc.name()
	registerCustomTheme()
	return doc.name(), nil
}

// customThemeDisplayName is the user-facing label shown in Settings >
// Theme for ModeCustom. Populated by LoadCustomTheme; defaults to
// "custom" when no name is set in the JSON.
var customThemeDisplayName = "custom"

// IsCustomThemeAvailable reports whether a custom theme was loaded
// successfully. Used by the Theme picker to decide whether to show
// ModeCustom in the list.
func IsCustomThemeAvailable() bool { return customThemeRegistry != nil }

// customTheme returns the loaded theme, or DefaultTheme if none is
// available. Never panics.
func customTheme() Theme {
	if customThemeRegistry == nil {
		return DefaultTheme()
	}
	return *customThemeRegistry
}

// ExportThemeJSON serialises the given Theme to JSON matching the
// customThemeDoc schema. Pairs with LoadCustomTheme — a round trip
// (export, edit, re-load) is intentionally supported. The `name`
// field is populated from the active ThemeMode so a user exporting
// `solarized-dark` gets a `"name": "solarized-dark"` starting point
// to tweak.
func ExportThemeJSON(t Theme) ([]byte, error) {
	doc := customThemeDoc{
		Name:          ThemeModeName(ThemeModeFor(t)),
		Bg:            hexOf(t.Bg),
		BgSubtle:      hexOf(t.BgSubtle),
		Fg:            hexOf(t.Fg),
		FgMuted:       hexOf(t.FgMuted),
		FgFaint:       hexOf(t.FgFaint),
		Primary:       hexOf(t.Primary),
		Secondary:     hexOf(t.Secondary),
		Success:       hexOf(t.Success),
		Warning:       hexOf(t.Warning),
		Danger:        hexOf(t.Danger),
		Border:        hexOf(t.Border),
		BorderFocus:   hexOf(t.BorderFocus),
		RoleUser:      hexOf(t.RoleUser),
		RoleAssistant: hexOf(t.RoleAssistant),
		RoleSystem:    hexOf(t.RoleSystem),
		RoleTool:      hexOf(t.RoleTool),
	}
	return json.MarshalIndent(doc, "", "  ")
}

// SaveCustomTheme serialises `t` to `path`, creating parent dirs as
// needed. Wrapper around ExportThemeJSON + os.WriteFile so callers
// don't duplicate the disk-writing boilerplate.
func SaveCustomTheme(t Theme, path string) error {
	data, err := ExportThemeJSON(t)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// CustomThemeDefaultPath resolves the conventional path for the
// custom-theme file — same lookup order as config.Load. Returns the
// path even when the file doesn't exist so callers can Stat it.
func CustomThemeDefaultPath() (string, error) {
	if p := os.Getenv("GACT_THEME_FILE"); p != "" {
		return p, nil
	}
	if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		return filepath.Join(xdg, "gact", "theme.json"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "gact", "theme.json"), nil
}

// apply folds the custom-theme JSON onto a base Theme. Empty string
// fields leave the base value intact — that's the graceful-override
// behaviour users expect when they only want to change a couple of
// colours. Inline assignments so we don't need a generic pointer
// helper against the color.Color interface.
func (d customThemeDoc) apply(base Theme) Theme {
	setHex(&base.Bg, d.Bg)
	setHex(&base.BgSubtle, d.BgSubtle)
	setHex(&base.Fg, d.Fg)
	setHex(&base.FgMuted, d.FgMuted)
	setHex(&base.FgFaint, d.FgFaint)
	setHex(&base.Primary, d.Primary)
	setHex(&base.Secondary, d.Secondary)
	setHex(&base.Success, d.Success)
	setHex(&base.Warning, d.Warning)
	setHex(&base.Danger, d.Danger)
	setHex(&base.Border, d.Border)
	setHex(&base.BorderFocus, d.BorderFocus)
	setHex(&base.RoleUser, d.RoleUser)
	setHex(&base.RoleAssistant, d.RoleAssistant)
	setHex(&base.RoleSystem, d.RoleSystem)
	setHex(&base.RoleTool, d.RoleTool)
	base.applyStyles()
	return base
}

// name returns the display name for the custom theme. Falls back to
// "custom" so Theme picker always has something to render.
func (d customThemeDoc) name() string {
	if d.Name != "" {
		return d.Name
	}
	return "custom"
}
