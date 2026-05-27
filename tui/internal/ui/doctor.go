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
	scroll  int
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
		a.doctor.scroll = 0
		return a, nil
	case "up", "k":
		a.doctor.scroll--
		return a, nil
	case "down", "j":
		a.doctor.scroll++
		return a, nil
	case "pgup", "ctrl+u":
		a.doctor.scroll -= a.doctorBodyPageSize()
		return a, nil
	case "pgdown", "ctrl+d":
		a.doctor.scroll += a.doctorBodyPageSize()
		return a, nil
	case "g", "home":
		a.doctor.scroll = 0
		return a, nil
	case "G", "end":
		a.doctor.scroll = 1 << 30
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
	innerW := w - 4

	buttons := []menuButton{
		{
			id:    "doctor:refresh",
			label: "refresh",
			action: func(app *App) tea.Cmd {
				if app.doctor == nil {
					return nil
				}
				preserve := app.doctor.tab
				app.doctor = &doctorState{loading: true, tab: preserve}
				return doctorFetchCmd(app.c)
			},
		},
		closeMenuButton("doctor:close", func(app *App) {
			app.doctorOpen = false
			app.doctor = nil
		}),
	}
	tabs := []menuTab{
		{
			id:     "doctor-health",
			label:  "Health",
			active: a.doctor.tab == doctorTabHealth,
			action: func(app *App) tea.Cmd {
				if app.doctor != nil {
					app.doctor.tab = doctorTabHealth
				}
				return nil
			},
		},
		{
			id:     "doctor-capabilities",
			label:  "Capabilities",
			active: a.doctor.tab == doctorTabCapabilities,
			action: func(app *App) tea.Cmd {
				if app.doctor != nil {
					app.doctor.tab = doctorTabCapabilities
				}
				return nil
			},
		},
	}
	var body string
	var rowHits []modalRowHit
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
		body = renderDoctorCapabilities(a.doctor.caps, t, innerW)
		rowHits = a.doctorCapabilityRowHits()
	default:
		body = renderDoctorBody(a.doctor.health, t, innerW)
		rowHits = a.doctorHealthRowHits(innerW)
	}

	hintStyle := t.HintLabel
	rendered := a.renderScrollableModalFrame(scrollableModalFrameOptions{
		frame: modalFrameOptions{
			width:      w,
			title:      "Doctor — Backend Health",
			buttons:    buttons,
			tabs:       tabs,
			tabPadding: 2,
			tabSpacing: 2,
		},
		content:     body,
		pageSize:    a.doctorBodyPageSize(),
		scroll:      a.doctorScroll(),
		wheelID:     "doctor",
		footerHint:  "Tab view  Up/Down scroll  r refresh  Esc close",
		footerStyle: &hintStyle,
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			if app.doctor != nil {
				app.doctor.scroll = moveScrollOffsetByWheel(app.doctor.scroll, button)
			}
			return nil
		},
		scrollTo: func(app *App, scroll int) tea.Cmd {
			if app.doctor != nil {
				app.doctor.scroll = scroll
			}
			return nil
		},
	})
	if a.doctor != nil {
		a.doctor.scroll = rendered.window.scroll
	}
	a.registerScrollableModalRowHits(rendered.modalFrameRender, rendered.window, rowHits)
	return rendered.modal
}

func (a *App) doctorBodyPageSize() int {
	return a.modalBodyRows(18)
}

func (a *App) doctorScroll() int {
	if a.doctor != nil {
		return a.doctor.scroll
	}
	return 0
}

// renderDoctorCapabilities tabulates every spec capability as
// {name, status} where status is one of:
//   - "supported" (●  green) — backend advertises it true
//   - "missing"   (●  red)   — backend advertises it false
//   - "unknown"   (?  muted) — backend is missing the flag entirely
func renderDoctorCapabilities(caps gact.Capabilities, t Theme, innerW int) string {
	rows := doctorCapabilityRows(caps)

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

func doctorCapabilityRows(caps gact.Capabilities) []capRow {
	return []capRow{
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
}

func (a *App) doctorCapabilityRowHits() []modalRowHit {
	if a.doctor == nil {
		return nil
	}
	rows := doctorCapabilityRows(a.doctor.caps)
	hits := make([]modalRowHit, 0, len(rows))
	for i, row := range rows {
		row := row
		hits = append(hits, modalRowHit{
			id:     "doctor:capability:" + row.name,
			start:  3 + i,
			height: 1,
			action: func(app *App) tea.Cmd {
				app.openDoctorCapabilityDetail(row)
				return nil
			},
		})
	}
	return hits
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
	overall := h.OverallStatus
	if overall == "" {
		if h.Healthy {
			overall = "ready"
		} else {
			overall = "unavailable"
		}
	}
	rows := appendDetailSection(nil, "Overview",
		detailField{"status", doctorStatusText(overall)},
		detailField{"uptime", formatUptime(h.UptimeS)},
	)
	if len(h.Integrations) == 0 {
		rows = appendDetailSection(rows, "Integrations",
			detailField{"", "(no integrations reported by this backend)"},
		)
		return strings.Join(rows, "\n")
	}

	fields := make([]detailField, 0, len(h.Integrations))
	for _, integ := range h.Integrations {
		value := doctorIntegrationValue(integ, innerW)
		fields = append(fields, detailField{integ.Name, value})
	}
	rows = appendDetailSection(rows, "Integrations", fields...)
	return strings.Join(rows, "\n")
}

func (a *App) doctorHealthRowHits(innerW int) []modalRowHit {
	if a.doctor == nil || len(a.doctor.health.Integrations) == 0 {
		return nil
	}
	rows := appendDetailSection(nil, "Overview",
		detailField{"status", doctorStatusText(a.doctor.health.OverallStatus)},
		detailField{"uptime", formatUptime(a.doctor.health.UptimeS)},
	)
	start := len(rows) + 2 // blank separator + Integrations section title.
	hits := make([]modalRowHit, 0, len(a.doctor.health.Integrations))
	for _, integ := range a.doctor.health.Integrations {
		integ := integ
		rowHeight := len(detailFieldRows(integ.Name, doctorIntegrationValue(integ, innerW)))
		if rowHeight < 1 {
			rowHeight = 1
		}
		hits = append(hits, modalRowHit{
			id:     "doctor:integration:" + integ.Name,
			start:  start,
			height: rowHeight,
			action: func(app *App) tea.Cmd {
				app.openDoctorIntegrationDetail(integ)
				return nil
			},
		})
		start += rowHeight
	}
	return hits
}

func (a *App) openDoctorIntegrationDetail(integ gact.Integration) {
	rows := appendDetailSection(nil, "Integration",
		detailField{"name", integ.Name},
		detailField{"status", doctorStatusText(integ.Status)},
		detailField{"detail", orPlaceholder(integ.Detail, "not reported")},
	)
	if a.doctor != nil {
		overall := a.doctor.health.OverallStatus
		if overall == "" {
			if a.doctor.health.Healthy {
				overall = "ready"
			} else {
				overall = "unavailable"
			}
		}
		rows = appendDetailSection(rows, "Backend",
			detailField{"overall_status", doctorStatusText(overall)},
			detailField{"uptime", formatUptime(a.doctor.health.UptimeS)},
		)
	}
	a.detailView = &bulkyPartRef{
		messageID: "doctor",
		partID:    "integration:" + integ.Name,
		title:     "Doctor · " + integ.Name,
		fullText:  strings.Join(rows, "\n"),
	}
	a.detailViewOpen = true
	a.detailScroll = 0
}

func (a *App) openDoctorCapabilityDetail(row capRow) {
	rows := appendDetailSection(nil, "Capability",
		detailField{"name", row.name},
		detailField{"status", capabilityStatusText(row.on)},
		detailField{"bucket", capBucketPlainLabel(row.bucket)},
		detailField{"meaning", capabilityMeaning(row.name, row.bucket)},
	)
	if a.doctor != nil {
		rows = appendDetailSection(rows, "Backend",
			detailField{"contract_version", orPlaceholder(a.doctor.caps.ContractVersion, "unknown")},
			detailField{"name", orPlaceholder(a.doctor.caps.Backend.Name, "unknown")},
			detailField{"version", orPlaceholder(a.doctor.caps.Backend.Version, "unknown")},
			detailField{"vendor", orPlaceholder(a.doctor.caps.Backend.Vendor, "unknown")},
		)
	}
	a.detailView = &bulkyPartRef{
		messageID: "doctor",
		partID:    "capability:" + row.name,
		title:     "Capability · " + row.name,
		fullText:  strings.Join(rows, "\n"),
	}
	a.detailViewOpen = true
	a.detailScroll = 0
}

func capabilityStatusText(on bool) string {
	if on {
		return "supported"
	}
	return "missing"
}

func capBucketPlainLabel(b capBucket) string {
	switch b {
	case capCore:
		return "v0.1 core"
	case capExtra:
		return "v0.1 useful"
	case capV02:
		return "v0.2"
	case capVendor:
		return "vendor-specific"
	default:
		return "unknown"
	}
}

func capabilityMeaning(name string, bucket capBucket) string {
	switch name {
	case "integration_health":
		return "backend exposes per-subsystem health rows in /v1/health"
	case "memory":
		return "backend exposes ARC/context memory statistics through /v1/memory/stats"
	case "agent_routing":
		return "backend can surface routing decisions and multi-tier agent handoffs"
	case "tool_telemetry":
		return "tool results can include duration/cache telemetry"
	case "structured_errors":
		return "backend can return typed error_info payloads instead of plain text only"
	}
	switch bucket {
	case capCore:
		return "core GACT contract surface expected by the TUI"
	case capExtra:
		return "optional GACT surface that improves navigation or observability"
	case capV02:
		return "v0.2 GACT extension used for richer CLIO evidence"
	case capVendor:
		return "vendor-specific extension; absence is usually acceptable"
	default:
		return "capability flag reported by /v1/capabilities"
	}
}

func doctorIntegrationValue(integ gact.Integration, innerW int) string {
	status := doctorStatusText(integ.Status)
	detail := strings.TrimSpace(integ.Detail)
	if detail == "" {
		return status
	}
	w := innerW - lipgloss.Width(integ.Name) - lipgloss.Width(status) - 8
	if w < 24 {
		w = 24
	}
	lines := wrapPlainRows(detail, w, "")
	if len(lines) == 0 {
		return status
	}
	out := status + " · " + lines[0]
	if len(lines) > 1 {
		out += "\n" + strings.Join(lines[1:], "\n")
	}
	return out
}

func doctorStatusText(status string) string {
	switch strings.TrimSpace(status) {
	case "":
		return "unknown"
	default:
		return status
	}
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
