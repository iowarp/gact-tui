package ui

import (
	"errors"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// CLIO-BBBBBBBBBB4: doctor modal renders integrations[] as a
// per-row status table with colour-coded status cells.
func TestDoctor_RendersIntegrationsTable(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width, a.height = 120, 40
	a.doctorOpen = true
	a.doctor = &doctorState{
		health: gact.HealthResponse{
			Healthy:       true,
			UptimeS:       3725, // 1h 2m
			OverallStatus: "degraded",
			Integrations: []gact.Integration{
				{Name: "lm", Status: "ready", Detail: "openai/gpt-4o-mini"},
				{Name: "gateway", Status: "ready", Detail: "5 tools"},
				{Name: "clio_core", Status: "unavailable", Detail: "binary missing"},
			},
		},
	}

	out := stripANSI(a.viewDoctor())
	for _, want := range []string{
		"Doctor",             // modal title
		"degraded",           // overall_status chip
		"Overview",           // shared section heading
		"uptime: 1h 2m",      // shared detail field
		"Integrations",       // shared integration section
		"lm",                 // integration row
		"ready",              // status cell
		"openai/gpt-4o-mini", // detail column
		"clio_core",          // another row
		"unavailable",        // degraded row status
		"binary missing",     // its detail
		"Esc",                // keybinding hint
	} {
		if !strings.Contains(out, want) {
			t.Errorf("viewDoctor output missing %q; full:\n%s", want, out)
		}
	}
	if strings.Contains(out, "NAME") || strings.Contains(out, "STATUS") || strings.Contains(out, "DETAIL") {
		t.Errorf("health tab should use shared detail sections, not a bespoke table:\n%s", out)
	}
}

// CLIO-BBBBBBBBBB4: loading state shows a placeholder while the
// fetch is in flight.
func TestDoctor_LoadingStateShowsSpinnerText(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width, a.height = 120, 40
	a.doctorOpen = true
	a.doctor = &doctorState{loading: true}

	out := stripANSI(a.viewDoctor())
	if !strings.Contains(out, "fetching") {
		t.Errorf("loading state should render a 'fetching' placeholder; got:\n%s", out)
	}
}

// CLIO-BBBBBBBBBB4: fetch failure surfaces the error + a retry hint.
func TestDoctor_FetchErrorRendersMessage(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width, a.height = 120, 40
	a.doctorOpen = true
	a.doctor = &doctorState{err: errors.New("connection refused")}

	out := stripANSI(a.viewDoctor())
	if !strings.Contains(out, "connection refused") {
		t.Errorf("error message missing from render; got:\n%s", out)
	}
	if !strings.Contains(out, "press r to retry") {
		t.Errorf("retry hint missing; got:\n%s", out)
	}
}

// CLIO-BBBBBBBBBB4: Esc closes the modal; r triggers a refetch
// (non-nil cmd).
func TestDoctor_EscCloses(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width, a.height = 120, 40
	a.doctorOpen = true
	a.doctor = &doctorState{health: gact.HealthResponse{Healthy: true}}

	out, _ := a.handleDoctorKey(tea.KeyPressMsg{Code: tea.KeyEscape})
	got := out.(*App)
	if got.doctorOpen {
		t.Errorf("Esc should close the modal")
	}
	if got.doctor != nil {
		t.Errorf("doctor state should clear on close; got %+v", got.doctor)
	}
}

// CLIO-BBBBBBBBBB4: modal doesn't render when closed (defensive —
// stops overlay stack from painting empty boxes).
func TestDoctor_ClosedRendersEmpty(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width, a.height = 120, 40
	a.doctorOpen = false
	out := a.viewDoctor()
	if out != "" {
		t.Errorf("closed doctor should render empty string; got %q", out)
	}
}
