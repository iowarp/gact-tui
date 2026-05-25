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
	caps    gact.Capabilities
	tab     doctorTab
}

// doctorTab switches between the integrations health view and the
// capability scorecard.
type doctorTab int

const (
	doctorTabHealth doctorTab = iota
	doctorTabCapabilities
)

// doctorFetchedMsg carries a completed /v1/health + /v1/capabilities
// fetch. Capabilities power the scorecard tab; both are pulled
// together so r-refresh updates the whole modal at once.
type doctorFetchedMsg struct {
	health gact.HealthResponse
	caps   gact.Capabilities
	err    error
}

// doctorFetchCmd fires GET /v1/health + /v1/capabilities in parallel.
// Short timeout; both endpoints are supposed to be fast (probe-level).
func doctorFetchCmd(c *client.Client) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		h, herr := c.Health(ctx)
		if herr != nil {
			return doctorFetchedMsg{health: h, err: herr}
		}
		caps, cerr := c.Capabilities(ctx)
		return doctorFetchedMsg{health: h, caps: caps, err: cerr}
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
		// Refresh — re-enter loading state and fetch again. Re-pulls
		// caps too so a backend that just landed a new feature
		// flips its scorecard cell on the next refresh.
		preserve := a.doctor.tab
		a.doctor = &doctorState{loading: true, tab: preserve}
		return a, doctorFetchCmd(a.c)
	case "tab", "right", "left":
		// Cycle between integrations + capabilities views.
		a.doctor.tab = (a.doctor.tab + 1) % 2
		return a, nil
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
	tabs := renderDoctorTabs(a.doctor.tab, t)

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
	case a.doctor.tab == doctorTabCapabilities:
		body = renderDoctorCapabilities(a.doctor.caps, t, w-4)
	default:
		body = renderDoctorBody(a.doctor.health, t, w-4)
	}

	hint := t.HintLabel.Render("Tab switch view  ·  r refresh  ·  Esc / q close")
	box := lipgloss.JoinVertical(lipgloss.Left, title, "", tabs, "", body, "", hint)
	modal := a.renderDefaultModalSurface(w, box)
	a.registerModalTabs(modal, 2, []menuTab{
		{
			id:    "doctor-health",
			label: "Health",
			action: func(app *App) tea.Cmd {
				if app.doctor != nil {
					app.doctor.tab = doctorTabHealth
				}
				return nil
			},
		},
		{
			id:    "doctor-capabilities",
			label: "Capabilities",
			action: func(app *App) tea.Cmd {
				if app.doctor != nil {
					app.doctor.tab = doctorTabCapabilities
				}
				return nil
			},
		},
	})
	return modal
}

// renderDoctorTabs draws the two-tab strip at the top of the modal.
func renderDoctorTabs(active doctorTab, t Theme) string {
	on := lipgloss.NewStyle().
		Background(t.Primary).
		Foreground(t.Bg).
		Bold(true).
		Padding(0, 2)
	off := lipgloss.NewStyle().
		Foreground(t.FgMuted).
		Padding(0, 2)
	healthStyle, capsStyle := off, off
	if active == doctorTabHealth {
		healthStyle = on
	} else {
		capsStyle = on
	}
	return healthStyle.Render("Health") + "  " +
		capsStyle.Render("Capabilities")
}

// renderDoctorCapabilities tabulates every spec capability as
// {name, status} where status is one of:
//   - "supported" (●  green) — backend advertises it true
//   - "missing"   (●  red)   — backend advertises it false
//   - "unknown"   (?  muted) — backend is missing the flag entirely
func renderDoctorCapabilities(caps gact.Capabilities, t Theme, innerW int) string {
	rows := []capRow{
		// Core surfaces (v0.1).
		{"workspaces", caps.Capabilities.Workspaces, capCore},
		{"sessions", caps.Capabilities.Sessions, capCore},
		{"subagents", caps.Capabilities.Subagents, capCore},
		{"mcp", caps.Capabilities.MCP, capCore},
		{"files", caps.Capabilities.Files, capCore},
		{"diffs", caps.Capabilities.Diffs, capCore},
		{"permissions", caps.Capabilities.Permissions, capCore},
		{"providers", caps.Capabilities.Providers, capCore},
		{"commands", caps.Capabilities.Commands, capCore},
		{"metrics", caps.Capabilities.Metrics, capCore},
		// Useful but optional.
		{"session_branching", caps.Capabilities.SessionBranching, capExtra},
		{"session_export", caps.Capabilities.SessionExport, capExtra},
		{"search_messages", caps.Capabilities.SearchMessages, capExtra},
		{"cost_tracking", caps.Capabilities.CostTracking, capExtra},
		{"thinking_blocks", caps.Capabilities.ThinkingBlocks, capExtra},
		{"session_tasks", caps.Capabilities.SessionTasks, capExtra},
		// v0.2 additions.
		{"agent_routing", caps.Capabilities.AgentRouting, capV02},
		{"memory", caps.Capabilities.Memory, capV02},
		{"structured_errors", caps.Capabilities.StructuredErrors, capV02},
		{"integration_health", caps.Capabilities.IntegrationHealth, capV02},
		{"tool_telemetry", caps.Capabilities.ToolTelemetry, capV02},
		// Vendor-specific (often unsupported).
		{"lsp", caps.Capabilities.LSP, capVendor},
		{"voice", caps.Capabilities.Voice, capVendor},
		{"scheduled_sessions", caps.Capabilities.ScheduledSessions, capVendor},
		{"hooks", caps.Capabilities.Hooks, capVendor},
		{"session_sharing", caps.Capabilities.SessionSharing, capVendor},
		{"edit_modes", caps.Capabilities.EditModes, capVendor},
		{"plan_mode", caps.Capabilities.PlanMode, capVendor},
		{"agent_write", caps.Capabilities.AgentWrite, capVendor},
		{"skills_extraction", caps.Capabilities.SkillsExtraction, capVendor},
	}

	// Score header — count supported across the core + v0.2 axes
	// since those map best to "is this backend actually GACT-capable?".
	supported := 0
	measured := 0
	for _, r := range rows {
		if r.bucket == capCore || r.bucket == capV02 {
			measured++
			if r.on {
				supported++
			}
		}
	}
	score := lipgloss.NewStyle().Bold(true).Foreground(t.Success).
		Render(fmt.Sprintf("%d/%d", supported, measured))
	if supported < measured {
		score = lipgloss.NewStyle().Bold(true).Foreground(t.Warning).
			Render(fmt.Sprintf("%d/%d", supported, measured))
	}
	header := lipgloss.NewStyle().Foreground(t.FgMuted).
		Render("Core + v0.2 capability scorecard: ") + score

	out := []string{header, ""}

	// Two-column table.
	nameW := 22
	statusW := 14
	bucketW := innerW - nameW - statusW - 2
	if bucketW < 18 {
		bucketW = 18
	}
	out = append(out,
		lipgloss.NewStyle().Foreground(t.FgFaint).Bold(true).
			Render(padRight("CAPABILITY", nameW)+padRight("STATUS", statusW)+"BUCKET"),
	)
	for _, r := range rows {
		out = append(out, padRight(r.name, nameW)+
			padRight(capStatusCell(r.on, t), statusW)+
			capBucketLabel(r.bucket, t),
		)
	}
	return strings.Join(out, "\n")
}

type capBucket int

const (
	capCore capBucket = iota
	capExtra
	capV02
	capVendor
)

type capRow struct {
	name   string
	on     bool
	bucket capBucket
}

func capStatusCell(on bool, t Theme) string {
	if on {
		return lipgloss.NewStyle().Foreground(t.Success).Bold(true).
			Render("● supported")
	}
	return lipgloss.NewStyle().Foreground(t.Danger).Bold(true).
		Render("● missing")
}

func capBucketLabel(b capBucket, t Theme) string {
	style := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
	switch b {
	case capCore:
		return style.Render("v0.1 core")
	case capExtra:
		return style.Render("v0.1 useful")
	case capV02:
		return style.Render("v0.2")
	case capVendor:
		return style.Render("vendor-specific")
	}
	return style.Render("?")
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

	// Column widths: name 12, status 12, detail = rest. Clamp to innerW.
	// Detail wraps onto continuation rows when it would otherwise truncate
	// — better to read a long lm config across two lines than to lose the
	// model id behind an ellipsis.
	nameW := 12
	statusW := 12
	detailW := innerW - nameW - statusW - 4 // 4 = padding
	if detailW < 30 {
		detailW = 30
	}

	tableHead := lipgloss.NewStyle().Foreground(t.FgFaint).Bold(true).
		Render(padRight("NAME", nameW) + padRight("STATUS", statusW) + "DETAIL")
	rows = append(rows, tableHead)

	for _, integ := range h.Integrations {
		statusCell := doctorStatusCell(integ.Status, t)
		// Wrap the detail to detailW and indent continuation lines so the
		// table grid stays aligned.
		wrapped := wrap(integ.Detail, detailW)
		wlines := strings.Split(wrapped, "\n")
		for i, wl := range wlines {
			if i == 0 {
				rows = append(rows,
					padRight(integ.Name, nameW)+
						padRight(statusCell, statusW)+wl)
			} else {
				rows = append(rows,
					strings.Repeat(" ", nameW+statusW)+wl)
			}
		}
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
