package ui

import (
	"context"
	"fmt"
	"sort"
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
	gaps    map[string]gact.CapabilityGap
	tab     doctorTab
	scroll  int
}

// doctorTab switches between the integrations health view and the
// capability scorecard.
type doctorTab int

const (
	doctorTabHealth doctorTab = iota
	doctorTabCapabilities
	doctorTabGaps
)

// doctorFetchedMsg carries a completed /v1/health + /v1/capabilities
// fetch. Capabilities power the scorecard tab; both are pulled
// together so r-refresh updates the whole modal at once.
type doctorFetchedMsg struct {
	health gact.HealthResponse
	caps   gact.Capabilities
	gaps   map[string]gact.CapabilityGap
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
		gaps, _ := c.CapabilityGaps(ctx)
		return doctorFetchedMsg{health: h, caps: caps, gaps: gaps, err: cerr}
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
		a.doctor.tab = (a.doctor.tab + 1) % 3
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
	innerW := modalInnerWidth(w)

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
		{
			id:     "doctor-gaps",
			label:  "Gaps",
			active: a.doctor.tab == doctorTabGaps,
			action: func(app *App) tea.Cmd {
				if app.doctor != nil {
					app.doctor.tab = doctorTabGaps
				}
				return nil
			},
		},
	}
	var body string
	var rowHits []modalRowHit
	baseFooterHint := "Tab view  Up/Down scroll  r refresh  Esc close"
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
	case a.doctor.tab == doctorTabGaps:
		body = renderCapabilityGaps(a.doctor.gaps, t, innerW)
	default:
		body = renderDoctorBody(a.doctor.health, t, innerW)
		rowHits = a.doctorHealthRowHits(innerW)
	}
	footerHint := scrollableModalRowDetailFooter(baseFooterHint, rowHits)
	pageSize := compactModalBodyRows(body, a.doctorBodyPageSize(), 8)

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
		pageSize:    pageSize,
		scroll:      a.doctorScroll(),
		wheelID:     "doctor",
		footerHint:  footerHint,
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
	nameW := 34
	statusW := 14
	uiW := 14
	bucketW := innerW - nameW - statusW - uiW - 3
	if bucketW < 18 {
		bucketW = 18
	}
	out = append(out,
		lipgloss.NewStyle().Foreground(t.FgFaint).Bold(true).
			Render(padRight("CAPABILITY", nameW)+padRight("BACKEND", statusW)+padRight("TUI", uiW)+"BUCKET"),
	)
	for _, r := range rows {
		out = append(out, padRight(r.name, nameW)+
			padRight(capStatusCell(r.on, t), statusW)+
			padRight(capUISupportCell(r.ui, t), uiW)+
			capBucketLabel(r.bucket, t),
		)
	}
	return strings.Join(out, "\n")
}

func doctorCapabilityRows(caps gact.Capabilities) []capRow {
	return []capRow{
		// Core surfaces (v0.1).
		{"workspaces", caps.Capabilities.Workspaces, capCore, capUIFull, "workspace switch and current workspace label"},
		{"sessions", caps.Capabilities.Sessions, capCore, capUIFull, "session list, create, attach, messages, SSE"},
		{"subagents", caps.Capabilities.Subagents, capCore, capUIFull, "subsessions/nanoagent traces and child sessions"},
		{"mcp", caps.Capabilities.MCP, capCore, capUIFull, "MCP catalog, detail, install/remove/call evidence, and POST /v1/mcp/servers/{id}/reconnect"},
		{"files", caps.Capabilities.Files, capCore, capUIFull, "file picker/viewer and context attachment"},
		{"diffs", caps.Capabilities.Diffs, capCore, capUIFull, "diff list/detail/actions"},
		{"permissions", caps.Capabilities.Permissions, capCore, capUIFull, "permission banner, actions, audit/policies"},
		{"providers", caps.Capabilities.Providers, capCore, capUIFull, "provider/model configuration modal"},
		{"commands", caps.Capabilities.Commands, capCore, capUIFull, "slash command palette and command detail"},
		{"metrics", caps.Capabilities.Metrics, capCore, capUIFull, "metrics command/detail"},
		// Useful but optional.
		{"session_branching", caps.Capabilities.SessionBranching, capExtra, capUIGated, "decoded and gated; no primary CLIO workflow"},
		{"session_export", caps.Capabilities.SessionExport, capExtra, capUIGated, "decoded and gated; export UI not a 1.0 CLIO path"},
		{"session_summary", caps.Capabilities.SessionSummary, capExtra, capUIFull, "/compact uses POST /v1/sessions/{id}/summarize, refreshes backend truth, renders selected-session summary, and surfaces errors"},
		{"attachments_upload", caps.Capabilities.AttachmentsUpload, capExtra, capUIFull, "file detail upload action POSTs /v1/sessions/{id}/attachments and merges returned context provenance"},
		{"cost_tracking", caps.Capabilities.CostTracking, capExtra, capUIFull, "header/footer cost chips and detail rows"},
		{"thinking_blocks", caps.Capabilities.ThinkingBlocks, capExtra, capUIFull, "thinking part rendering and detail view"},
		{"edit_modes", caps.Capabilities.EditModes, capExtra, capUIGated, "decoded; no separate edit-mode switch"},
		{"plan_mode", caps.Capabilities.PlanMode, capExtra, capUIGated, "decoded; no separate plan-mode switch"},
		{"search_messages", caps.Capabilities.SearchMessages, capExtra, capUIFull, "palette query/message search"},
		{"session_tasks", caps.Capabilities.SessionTasks, capExtra, capUIFull, "task badges and task detail"},
		// v0.2 additions.
		{"agent_routing", caps.Capabilities.AgentRouting, capV02, capUIFull, "routing decisions, expert handoffs, route chains"},
		{"memory", caps.Capabilities.Memory, capV02, capUIFull, "memory chip, inspector, context frames"},
		{"structured_errors", caps.Capabilities.StructuredErrors, capV02, capUIFull, "typed error parts and detail surfaces"},
		{"integration_health", caps.Capabilities.IntegrationHealth, capV02, capUIFull, "doctor health tab and integration rows"},
		{"tool_telemetry", caps.Capabilities.ToolTelemetry, capV02, capUIFull, "tool cache/duration evidence"},
		// Vendor-specific (often unsupported).
		{"lsp", caps.Capabilities.LSP, capVendor, capUINotSurfaced, "not surfaced in current TUI"},
		{"voice", caps.Capabilities.Voice, capVendor, capUIGated, "voice command hook exists; no CLIO voice workflow"},
		{"scheduled_sessions", caps.Capabilities.ScheduledSessions, capVendor, capUINotSurfaced, "not surfaced in current TUI"},
		{"hooks", caps.Capabilities.Hooks, capVendor, capUIGated, "CLI support exists; TUI management not primary"},
		{"session_sharing", caps.Capabilities.SessionSharing, capVendor, capUINotSurfaced, "not surfaced in current TUI"},
		{"agent_write", caps.Capabilities.AgentWrite, capVendor, capUIFull, "create/clone/edit/delete surfaced with protected built-ins"},
		{"skills_extraction", caps.Capabilities.SkillsExtraction, capVendor, capUIFull, "current-session extraction surfaced from agents catalog"},
		{"x_clio_cancellation", caps.Capabilities.XClioCancellation != "" && caps.Capabilities.XClioCancellation != "none", capVendor, capUIPartial, "capability visible; Ctrl+X and /cancel post POST /v1/sessions/{id}/cancel when a session is active; #104 release proof remains required"},
		{"x_clio_executor_cancellation", caps.Capabilities.XClioExecutorCancellation, capVendor, capUIPartial, "capability visible; executor cancel is backend/runtime behavior surfaced through Ctrl+X, /cancel, truthful request state, and errors; #104 release proof remains required"},
		{"x_clio_text_streaming", caps.Capabilities.XClioTextStreaming != "" && caps.Capabilities.XClioTextStreaming != "none", capVendor, capUIFull, "streaming state and fallback rendering"},
		{"x_clio_synthetic_posthoc_streaming", caps.Capabilities.XClioSyntheticPosthocStreaming, capVendor, capUIFull, "posthoc stream provenance/fallback shown"},
		{"x_clio_stream_fallback_reasons", len(caps.Capabilities.XClioStreamFallbackReasons) > 0, capVendor, capUIFull, "fallback reasons decoded and shown in details"},
		{"x_clio_direct_delete_permissions", caps.Capabilities.XClioDirectDeletePermissions, capVendor, capUIFull, "direct permission delete policy surfaced"},
		{"x_clio_prompt_registry", caps.Capabilities.XClioPromptRegistry, capVendor, capUIFull, "browse/render/validate/save/reload profile overrides"},
		{"x_clio_expert_packs", caps.Capabilities.XClioExpertPacks, capVendor, capUIFull, "browse/detail/activate with validation metadata"},
		{"x_clio_agent_blueprints", caps.Capabilities.XClioAgentBlueprints, capVendor, capUIFull, "browse/install/validate/activate/update/delete/MCP enable"},
		{"x_clio_user_questions", caps.Capabilities.XClioUserQuestions, capVendor, capUIFull, "question SSE lifecycle and answer modal"},
		{"x_clio_retry_attempts", caps.Capabilities.XClioRetryAttempts, capVendor, capUIFull, "retry attempts and retry-with-model provenance"},
		{"x_clio_context_frames", caps.Capabilities.XClioContextFrames, capVendor, capUIFull, "frame list/detail fetch and memory tool detail"},
		{"x_clio_semantic_events", caps.Capabilities.XClioSemanticEvents, capVendor, capUIFull, "semantic.event and tool.call.* SSE frames reduce into live transcript evidence"},
		{"x_clio_semantic_trace_backend", caps.Capabilities.XClioSemanticTraceBackend != "", capVendor, capUIFull, "trace backend metadata visible"},
		{"x_clio_semantic_trace_detail", caps.Capabilities.XClioSemanticTraceDetail != "", capVendor, capUIFull, "trace detail metadata visible"},
		{"x_clio_hook_backend", caps.Capabilities.XClioHookBackend != "", capVendor, capUIFull, "hook backend metadata visible"},
		{"x_clio_hook_events", len(caps.Capabilities.XClioHookEvents) > 0, capVendor, capUIFull, "hook event metadata visible"},
		{"x_clio_files_content", caps.Capabilities.XClioFilesContent, capVendor, capUIFull, "GET /v1/sessions/{id}/context/files/content previews text, binary summaries, and truthful preview errors"},
		{"x_clio_capability_gaps", len(caps.Capabilities.XClioCapabilityGaps) > 0, capVendor, capUIFull, "doctor gaps tab and detail rows"},
	}
}

func renderCapabilityGaps(gaps map[string]gact.CapabilityGap, t Theme, innerW int) string {
	if len(gaps) == 0 {
		return lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("No explicit capability gaps reported by this backend.")
	}
	names := make([]string, 0, len(gaps))
	for name := range gaps {
		names = append(names, name)
	}
	sort.Strings(names)
	nameW := 22
	statusW := 14
	behaviorW := innerW - nameW - statusW - 2
	if behaviorW < 24 {
		behaviorW = 24
	}
	rows := []string{
		lipgloss.NewStyle().Foreground(t.FgMuted).
			Render("Backend-declared unsupported, deferred, or disabled surfaces."),
		"",
		lipgloss.NewStyle().Foreground(t.FgFaint).Bold(true).
			Render(padRight("GAP", nameW) + padRight("STATUS", statusW) + "CLIENT BEHAVIOR"),
	}
	for _, name := range names {
		gap := gaps[name]
		status := firstNonEmpty(gap.Status, "unknown")
		style := lipgloss.NewStyle().Foreground(t.Warning)
		if status == "unsupported" {
			style = lipgloss.NewStyle().Foreground(t.Danger)
		}
		rows = append(rows, padRight(name, nameW)+padRight(style.Render(status), statusW)+truncate(firstNonEmpty(gap.ClientBehavior, gap.Category, "not specified"), behaviorW))
		if len(gap.RelatedCommands) > 0 {
			rows = append(rows, "  commands: "+strings.Join(gap.RelatedCommands, ", "))
		}
		if len(gap.RelatedEndpoints) > 0 {
			rows = append(rows, "  endpoints: "+strings.Join(gap.RelatedEndpoints, ", "))
		}
		if len(gap.RecoveryActions) > 0 {
			rows = append(rows, "  recovery: "+strings.Join(gap.RecoveryActions, ", "))
		}
	}
	return strings.Join(rows, "\n")
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
	ui     capUISupport
	notes  string
}

type capUISupport int

const (
	capUIFull capUISupport = iota
	capUIPartial
	capUIGated
	capUINotSurfaced
)

func capStatusCell(on bool, t Theme) string {
	if on {
		return lipgloss.NewStyle().Foreground(t.Success).Bold(true).
			Render("● supported")
	}
	return lipgloss.NewStyle().Foreground(t.Danger).Bold(true).
		Render("● missing")
}

func capUISupportCell(s capUISupport, t Theme) string {
	style := lipgloss.NewStyle().Foreground(t.Success).Bold(true)
	label := "full"
	switch s {
	case capUIPartial:
		style = lipgloss.NewStyle().Foreground(t.Warning).Bold(true)
		label = "partial"
	case capUIGated:
		style = lipgloss.NewStyle().Foreground(t.FgMuted).Bold(true)
		label = "gated"
	case capUINotSurfaced:
		style = lipgloss.NewStyle().Foreground(t.Danger).Bold(true)
		label = "none"
	}
	return style.Render(label)
}

func capUISupportPlainLabel(s capUISupport) string {
	switch s {
	case capUIFull:
		return "full"
	case capUIPartial:
		return "partial"
	case capUIGated:
		return "gated"
	case capUINotSurfaced:
		return "not surfaced"
	default:
		return "unknown"
	}
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
		detailField{"tui_support", capUISupportPlainLabel(row.ui)},
		detailField{"bucket", capBucketPlainLabel(row.bucket)},
		detailField{"meaning", capabilityMeaning(row.name, row.bucket)},
		detailField{"tui_notes", orPlaceholder(row.notes, "none")},
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
