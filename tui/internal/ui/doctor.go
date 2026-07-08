package ui

// doctor.go renders the doctor (health/capabilities) modal and routes its keys.

import (
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

// /doctor modal (v0.2 §3.4). Reads the backend's
// /v1/health response and renders the integrations[] array as a
// per-subsystem status table. Colour-coded: ready=green,
// degraded=amber, unavailable=red. Unknown statuses render muted.
//
// Gated on capabilities.integration_health — v0.1 backends that
// don't advertise the flag can't populate integrations and /doctor
// transitions to a "unsupported" hint instead of opening the modal.
//
// Keybindings: Esc / Ctrl+C / q close; r refreshes.

// view renders the modal. Mirrors the shape of viewMetrics / viewHelp so it
// fits with the rest of the overlay family.
func (d *doctorComponent) view() string {
	if !d.open {
		return ""
	}
	t := d.app.Theme
	w := d.app.modals.modalWidth()
	innerW := modalInnerWidth(w)

	buttons := []menuButton{
		{
			id:    "doctor:refresh",
			label: "refresh",
			action: func(app *App) tea.Cmd {
				return app.doctor.openModal(app.doctor.tab)
			},
		},
		closeMenuButton("doctor:close", func(app *App) {
			app.doctor.reset()
		}),
	}
	tabs := []menuTab{
		{
			id:     "doctor-health",
			label:  "Health",
			active: d.tab == doctorTabHealth,
			action: func(app *App) tea.Cmd {
				app.doctor.tab = doctorTabHealth
				return nil
			},
		},
		{
			id:     "doctor-capabilities",
			label:  "Capabilities",
			active: d.tab == doctorTabCapabilities,
			action: func(app *App) tea.Cmd {
				app.doctor.tab = doctorTabCapabilities
				return nil
			},
		},
		{
			id:     "doctor-gaps",
			label:  "Gaps",
			active: d.tab == doctorTabGaps,
			action: func(app *App) tea.Cmd {
				app.doctor.tab = doctorTabGaps
				return nil
			},
		},
	}
	var body string
	var rowHits []modalRowHit
	baseFooterHint := "Tab view  Up/Down scroll  r refresh  Esc close"
	switch {
	case d.loading:
		body = lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("fetching /v1/health…")
	case d.err != nil:
		body = lipgloss.NewStyle().Foreground(t.Danger).
			Render("fetch failed: "+d.err.Error()) + "\n\n" +
			lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render("press r to retry, Esc to close")
	case d.tab == doctorTabCapabilities:
		body = renderDoctorCapabilities(d.caps, t, innerW)
		rowHits = d.capabilityRowHits()
	case d.tab == doctorTabGaps:
		body = renderCapabilityGaps(d.gaps, t, innerW)
	default:
		body = renderDoctorBody(d.health, t, innerW)
		rowHits = d.healthRowHits(innerW)
	}
	footerHint := scrollableModalRowDetailFooter(baseFooterHint, rowHits)
	pageSize := compactModalBodyRows(body, d.bodyPageSize(), 8)

	hintStyle := t.HintLabel
	rendered := d.app.modals.renderScrollableModalFrame(scrollableModalFrameOptions{
		frame: modalFrameOptions{
			width:      w,
			title:      "Doctor - System Readiness",
			buttons:    buttons,
			tabs:       tabs,
			tabPadding: 2,
			tabSpacing: 2,
		},
		content:     body,
		pageSize:    pageSize,
		scroll:      d.scroll,
		wheelID:     "doctor",
		footerHint:  footerHint,
		footerStyle: &hintStyle,
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			app.doctor.scroll = moveScrollOffsetByWheel(app.doctor.scroll, button)
			return nil
		},
		scrollTo: func(app *App, scroll int) tea.Cmd {
			app.doctor.scroll = scroll
			return nil
		},
	})
	d.scroll = rendered.window.scroll
	d.app.interaction.registerScrollableModalRowHits(rendered.modalFrameRender, rendered.window, rowHits)
	return rendered.modal
}

func (d *doctorComponent) bodyPageSize() int {
	return d.app.modals.modalBodyRows(18)
}

// handleKey drives the modal while it is open.
func (d *doctorComponent) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c", "q", "Q":
		d.reset()
		return d.app, nil
	case "r", "R":
		return d.app, d.openModal(d.tab)
	case "tab", "right", "left":
		d.tab = (d.tab + 1) % 3
		d.scroll = 0
		return d.app, nil
	}
	if off, ok := applyScrollKey(d.scroll, d.bodyPageSize(), k); ok {
		d.scroll = off
	}
	return d.app, nil
}
