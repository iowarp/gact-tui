package ui

// settings_tui_prefs.go renders TUI-preference stepper/action rows and their hit geometry.

import (
	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/charmbracelet/x/ansi"
)

type settingsTUIStepperRow struct {
	line         string
	detail       []string
	controlStart int
	controlEnd   int
}

func renderSettingsTUIActionRow(theme Theme, width int, selected bool, label, value, hint string) settingsTUIStepperRow {
	marker := "  "
	labelStyle := lipgloss.NewStyle().Foreground(theme.Fg)
	valueStyle := theme.HintLabel
	hintStyle := theme.HintLabel.Italic(true)
	if selected {
		marker = lipgloss.NewStyle().Foreground(theme.Secondary).Render("▌ ")
		labelStyle = labelStyle.Foreground(theme.Secondary).Bold(true)
		valueStyle = lipgloss.NewStyle().Foreground(theme.Secondary).Bold(true)
	}
	leftCol := lipgloss.Width(ansi.Strip(marker)) + lipgloss.Width(label) + 2
	control := value
	controlEnd := leftCol + lipgloss.Width(control)
	line := marker + labelStyle.Render(label) + "  " + valueStyle.Render(control)
	detail := []string{}
	if hint != "" && selected {
		detailWidth := minInt(maxInt(12, width-6), 72)
		for _, row := range textutil.WrapPlainRows(hint, detailWidth, "") {
			detailLine := "  " + hintStyle.Render(row)
			detailLine = lipgloss.NewStyle().Background(theme.Bg).Width(width).Render(detailLine)
			detail = append(detail, detailLine)
			if len(detail) >= 2 {
				break
			}
		}
	}
	if selected {
		line = lipgloss.NewStyle().Background(theme.Bg).Width(width).Render(line)
	}
	return settingsTUIStepperRow{
		line:         line,
		detail:       detail,
		controlStart: leftCol,
		controlEnd:   controlEnd,
	}
}

func renderSettingsTUIStepperRow(theme Theme, width int, selected bool, label, value, hint string) settingsTUIStepperRow {
	marker := "  "
	labelStyle := lipgloss.NewStyle().Foreground(theme.Fg)
	valueStyle := theme.HintLabel
	hintStyle := theme.HintLabel.Italic(true)
	if selected {
		marker = lipgloss.NewStyle().Foreground(theme.Secondary).Render("▌ ")
		labelStyle = labelStyle.Foreground(theme.Secondary).Bold(true)
		valueStyle = lipgloss.NewStyle().Foreground(theme.Secondary).Bold(true)
	}
	leftCol := lipgloss.Width(ansi.Strip(marker)) + lipgloss.Width(label) + 2
	control := "◀ " + value + " ▶"
	controlEnd := leftCol + lipgloss.Width(control)
	line := marker + labelStyle.Render(label) + "  " + valueStyle.Render(control)
	detail := []string{}
	if hint != "" && selected {
		detailWidth := minInt(maxInt(12, width-6), 72)
		for _, row := range textutil.WrapPlainRows(hint, detailWidth, "") {
			detailLine := "  " + hintStyle.Render(row)
			detailLine = lipgloss.NewStyle().Background(theme.Bg).Width(width).Render(detailLine)
			detail = append(detail, detailLine)
			if len(detail) >= 2 {
				break
			}
		}
	}
	if selected {
		line = lipgloss.NewStyle().Background(theme.Bg).Width(width).Render(line)
	}
	return settingsTUIStepperRow{
		line:         line,
		detail:       detail,
		controlStart: leftCol,
		controlEnd:   controlEnd,
	}
}

func (r settingsTUIStepperRow) rows() []string {
	rows := []string{r.line}
	rows = append(rows, r.detail...)
	return rows
}

func (r settingsTUIStepperRow) height() int {
	return maxInt(1, 1+len(r.detail))
}

func (r settingsTUIStepperRow) decrementHit() (int, int) {
	return r.stepperHit(false)
}

func (r settingsTUIStepperRow) incrementHit() (int, int) {
	return r.stepperHit(true)
}

func (r settingsTUIStepperRow) stepperHit(increment bool) (int, int) {
	return splitStepperControlHit(r.controlStart, r.controlEnd, increment)
}

// tuiPrefsRowCount is the number of editable rows in the TUI tab.
// Bump when adding new knobs; key navigation clamps against this.
// Rows: 0=collapse threshold, 1=cost warn, 2=cost danger,
// 3=paste-compress threshold (YYYYY1), 4=intro splash (YYYYY1),
// 5=terminal mouse capture, 6=sidebar layout editor.
const tuiPrefsRowCount = 7

// YYYYY1: paste-compress threshold steps by 1 line (small range
// — 2 means "compress almost everything", 20 means "rarely
// bother") and the intro toggle is just on/off.
const (
	pasteThresholdMin = 2
	pasteThresholdMax = 20
)

// LLLLL1: cost token thresholds adjust in 25k-token increments —
// fine enough to land on practical values (50K/75K/100K…), coarse
// enough that one keypress moves the dial meaningfully. Min 1k so
// the warn band can't be silenced entirely; max 1M covers the
// largest current context windows with headroom.
const (
	costStep = 25_000
	costMin  = 1_000
	costMax  = 1_000_000
)

// boolPretty renders a bool as "on"/"off" for the TUI-prefs tab.
func boolPretty(b bool) string {
	if b {
		return "on"
	}
	return "off"
}

// localizedBoolPretty renders a bool as the localized on/off label for the
// TUI-prefs tab. A package free function taking the localizer so it isn't a
// method on the coordinator; distinct from the hardcoded boolPretty above.
func localizedBoolPretty(loc Localizer, b bool) string {
	if b {
		return loc.t(msgSettingsOn, nil)
	}
	return loc.t(msgSettingsOff, nil)
}
