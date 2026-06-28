// Package ui contains the Bubbletea models, views, and update logic for the
// GACT TUI client.
package ui

// styles.go declares the Theme struct and finalizes/applies its derived lipgloss styles.

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

	// PasteCompressThreshold is the minimum line count a bracketed
	// paste must have before it gets the [pasted content: N lines]
	// placeholder treatment. Below this the paste falls through to
	// the textarea verbatim. 0 means "use built-in default" (3).
	// User-controllable via Settings → TUI. (YYYYY1)
	PasteCompressThreshold int
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
		Foreground(t.Fg).Background(t.Bg).Border(lipgloss.RoundedBorder()).
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
	// YYYYY1: paste-compress threshold defaults to 3 lines, matching
	// the previous hard-coded value in the bracketed-paste handler.
	if t.PasteCompressThreshold == 0 {
		t.PasteCompressThreshold = 3
	}
}
