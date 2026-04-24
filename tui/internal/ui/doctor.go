package ui

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// CLIO-BBBBBBBBBB4 (v0.2 §3.4): /doctor modal. Reads the backend's
// /v1/health response and renders the integrations[] array as a
// per-subsystem status table. Colour-coded: ready=green,
// degraded=amber, unavailable=red. Unknown statuses render muted.
//
// Gated on capabilities.integration_health — v0.1 backends that
// don't advertise the flag can't populate integrations and /doctor
// transitions to a "unsupported" hint instead of opening the modal.
//
// Keybindings: Esc / Ctrl+C / q close; r refreshes.

// doctorState holds the modal's backing data + loading flag.
type doctorState struct {
	loading bool
	err     error
	health  gact.HealthResponse
}

// doctorFetchedMsg carries a completed /v1/health fetch.
type doctorFetchedMsg struct {
	health gact.HealthResponse
	err    error
}

// doctorFetchCmd fires GET /v1/health. Short timeout; the endpoint
// is supposed to be fast (probe-level).
func doctorFetchCmd(c *client.Client) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		h, err := c.Health(ctx)
		return doctorFetchedMsg{health: h, err: err}
	}
}

// handleDoctorKey drives the modal while it's open.
func (a *App) handleDoctorKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c", "q", "Q":
		a.doctorOpen = false
		a.doctor = nil
		return a, nil
	case "r", "R":
		// Refresh — re-enter loading state and fetch again.
		a.doctor = &doctorState{loading: true}
		return a, doctorFetchCmd(a.c)
	}
	return a, nil
}

// viewDoctor renders the modal. Mirrors the shape of viewMetrics /
// viewHelp so it fits with the rest of the overlay family.
func (a *App) viewDoctor() string {
	if !a.doctorOpen || a.doctor == nil {
		return ""
	}
	t := a.Theme
	w := a.modalWidth()

	title := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render("Doctor — Backend Health")

	var body string
	switch {
	case a.doctor.loading:
		body = lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("fetching /v1/health…")
	case a.doctor.err != nil:
		body = lipgloss.NewStyle().Foreground(t.Danger).
			Render("fetch failed: "+a.doctor.err.Error()) + "\n\n" +
			lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render("press r to retry, Esc to close")
	default:
		body = renderDoctorBody(a.doctor.health, t, w-4)
	}

	hint := t.HintLabel.Render("r refresh  ·  Esc / q close")
	box := lipgloss.JoinVertical(lipgloss.Left, title, "", body, "", hint)
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Primary).
		Background(t.BgSubtle).
		Padding(1, 2).
		Width(w).
		Render(box)
}

// renderDoctorBody formats a HealthResponse into the modal body —
// header (overall_status + uptime + version) + integrations table.
func renderDoctorBody(h gact.HealthResponse, t Theme, innerW int) string {
	// Header row: overall_status chip + uptime + version if present.
	overall := h.OverallStatus
	if overall == "" {
		if h.Healthy {
			overall = "ready"
		} else {
			overall = "unavailable"
		}
	}
	chip := doctorStatusChip(overall, t)
	header := chip + "  " +
		lipgloss.NewStyle().Foreground(t.FgMuted).
			Render(fmt.Sprintf("uptime %s", formatUptime(h.UptimeS)))

	rows := []string{header, ""}
	if len(h.Integrations) == 0 {
		rows = append(rows,
			lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render("(no integrations reported by this backend)"))
		return strings.Join(rows, "\n")
	}

	// Column widths: name 16, status 14, detail = rest. Clamp to innerW.
	nameW := 16
	statusW := 14
	detailW := innerW - nameW - statusW - 4 // 4 = padding
	if detailW < 20 {
		detailW = 20
	}

	tableHead := lipgloss.NewStyle().Foreground(t.FgFaint).Bold(true).
		Render(padRight("NAME", nameW) + padRight("STATUS", statusW) + "DETAIL")
	rows = append(rows, tableHead)

	for _, integ := range h.Integrations {
		statusCell := doctorStatusCell(integ.Status, t)
		row := padRight(integ.Name, nameW) +
			padRight(statusCell, statusW) +
			truncateString(integ.Detail, detailW)
		rows = append(rows, row)
	}

	return strings.Join(rows, "\n")
}

// doctorStatusChip is the pill-shaped overall_status indicator in
// the modal header.
func doctorStatusChip(status string, t Theme) string {
	style := lipgloss.NewStyle().Background(t.Bg).Padding(0, 1).Bold(true)
	switch status {
	case "ready":
		return style.Foreground(t.Success).Render("● ready")
	case "degraded":
		return style.Foreground(t.Warning).Render("● degraded")
	case "unavailable":
		return style.Foreground(t.Danger).Render("● unavailable")
	default:
		return style.Foreground(t.FgMuted).Render("● " + status)
	}
}

// doctorStatusCell is the inline per-integration status string.
// Simpler than the chip (no background) so rows stay aligned with
// plain name + detail columns.
func doctorStatusCell(status string, t Theme) string {
	style := lipgloss.NewStyle().Bold(true)
	switch status {
	case "ready":
		return style.Foreground(t.Success).Render("ready")
	case "degraded":
		return style.Foreground(t.Warning).Render("degraded")
	case "unavailable":
		return style.Foreground(t.Danger).Render("unavailable")
	default:
		return lipgloss.NewStyle().Foreground(t.FgMuted).Render(status)
	}
}

// padRight pads a string (using lipgloss-aware width) so columns
// align even when the value itself contains styling escapes.
func padRight(s string, width int) string {
	w := lipgloss.Width(s)
	if w >= width {
		return s
	}
	return s + strings.Repeat(" ", width-w)
}

// formatUptime turns seconds into a compact human string.
//
//	< 60s   -> "42s"
//	< 1h    -> "5m 12s"
//	otherwise-> "2h 14m"
func formatUptime(sec int) string {
	if sec < 60 {
		return fmt.Sprintf("%ds", sec)
	}
	if sec < 3600 {
		return fmt.Sprintf("%dm %ds", sec/60, sec%60)
	}
	return fmt.Sprintf("%dh %dm", sec/3600, (sec%3600)/60)
}
