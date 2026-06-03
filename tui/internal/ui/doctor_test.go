package ui

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
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

func TestDoctorCapabilityRowsCoverDecodedCapabilityFlags(t *testing.T) {
	rows := doctorCapabilityRows(gact.Capabilities{})
	seen := map[string]bool{}
	for _, row := range rows {
		if row.name == "" {
			t.Fatal("capability row has empty name")
		}
		if seen[row.name] {
			t.Fatalf("duplicate capability row %q", row.name)
		}
		seen[row.name] = true
	}
	typ := reflect.TypeOf(gact.CapabilityFlags{})
	for i := 0; i < typ.NumField(); i++ {
		tag := typ.Field(i).Tag.Get("json")
		name := strings.Split(tag, ",")[0]
		if name == "" || name == "-" {
			continue
		}
		if !seen[name] {
			t.Fatalf("decoded capability flag %q is missing from doctorCapabilityRows", name)
		}
	}
}

func TestCapabilityMatrixDocCoversDoctorRows(t *testing.T) {
	matrixPath := capabilityMatrixPath()
	raw, err := os.ReadFile(matrixPath)
	if err != nil {
		t.Fatalf("read capability matrix: %v", err)
	}
	doc := string(raw)
	if !strings.Contains(doc, "# GACT TUI 1.0 Capability Matrix") {
		t.Fatal("capability matrix should be labeled as the active 1.0 release gate")
	}
	if strings.Contains(doc, "0.9 status") ||
		strings.Contains(doc, "CLIO 0.9") ||
		strings.Contains(doc, "standalone 0.9") {
		t.Fatal("capability matrix still contains stale 0.9 release-gate wording")
	}
	for _, row := range doctorCapabilityRows(gact.Capabilities{}) {
		if !strings.Contains(doc, "`"+row.name+"`") {
			t.Fatalf("capability matrix missing backend field %q", row.name)
		}
	}
}

func TestCapabilityMatrixDocMatchesDoctorSupportClasses(t *testing.T) {
	matrixPath := capabilityMatrixPath()
	raw, err := os.ReadFile(matrixPath)
	if err != nil {
		t.Fatalf("read capability matrix: %v", err)
	}
	docSupport := map[string]string{}
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "|") || !strings.Contains(line, "`") {
			continue
		}
		cols := strings.Split(line, "|")
		if len(cols) < 5 {
			continue
		}
		field := strings.Trim(strings.TrimSpace(cols[2]), "`")
		support := strings.TrimSpace(cols[3])
		if field != "" && support != "" && field != "Backend field" {
			docSupport[field] = support
		}
	}
	for _, row := range doctorCapabilityRows(gact.Capabilities{}) {
		want := capUISupportPlainLabel(row.ui)
		if want == "not surfaced" {
			want = "none"
		}
		got, ok := docSupport[row.name]
		if !ok {
			t.Fatalf("capability matrix missing support class for %q", row.name)
		}
		if got != want {
			t.Fatalf("capability matrix support for %q = %q, want Doctor support %q", row.name, got, want)
		}
	}
}

func TestCapabilityMatrixDocNonFullRowsCarryDisposition(t *testing.T) {
	matrixPath := capabilityMatrixPath()
	raw, err := os.ReadFile(matrixPath)
	if err != nil {
		t.Fatalf("read capability matrix: %v", err)
	}
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "|") || !strings.Contains(line, "`") {
			continue
		}
		cols := strings.Split(line, "|")
		if len(cols) < 5 {
			continue
		}
		field := strings.Trim(strings.TrimSpace(cols[2]), "`")
		support := strings.TrimSpace(cols[3])
		status := strings.ToLower(strings.TrimSpace(cols[4]))
		if field == "" || field == "Backend field" {
			continue
		}
		switch support {
		case "partial", "gated", "none":
			if !hasCapabilityDisposition(status) {
				t.Fatalf("capability matrix %s row %q needs issue/proof/deferred/non-goal disposition: %q", support, field, strings.TrimSpace(cols[4]))
			}
		}
	}
}

func hasCapabilityDisposition(status string) bool {
	for _, marker := range []string{"#", "proof", "non-goal", "defer"} {
		if strings.Contains(status, marker) {
			return true
		}
	}
	return false
}

func capabilityMatrixPath() string {
	return filepath.Join("..", "..", "..", "docs", "TUI_ONE_ZERO_CAPABILITY_MATRIX.md")
}

func TestDoctorCapabilityRowsExposeTUISupportStatus(t *testing.T) {
	rows := doctorCapabilityRows(gact.Capabilities{Capabilities: gact.CapabilityFlags{
		SessionSummary:                 true,
		AttachmentsUpload:              true,
		AgentWrite:                     true,
		SkillsExtraction:               true,
		XClioPromptRegistry:            true,
		XClioExpertPacks:               true,
		XClioAgentBlueprints:           true,
		XClioUserQuestions:             true,
		XClioRetryAttempts:             true,
		XClioContextFrames:             true,
		XClioSemanticEvents:            true,
		XClioSemanticTraceBackend:      "file",
		XClioSemanticTraceDetail:       "semantic",
		XClioHookBackend:               "python",
		XClioHookEvents:                map[string]any{"semantic.event": map[string]any{"status": "enabled"}},
		XClioFilesContent:              true,
		XClioCapabilityGaps:            map[string]any{"agent_write": map[string]any{"status": "full"}},
		XClioSyntheticPosthocStreaming: true,
		XClioStreamFallbackReasons:     map[string]any{"provider": map[string]any{"reason": "batch"}},
	}})
	byName := map[string]capRow{}
	for _, row := range rows {
		byName[row.name] = row
	}
	for name, want := range map[string]capUISupport{
		"session_summary":                    capUIFull,
		"attachments_upload":                 capUIFull,
		"agent_write":                        capUIFull,
		"skills_extraction":                  capUIFull,
		"x_clio_prompt_registry":             capUIFull,
		"x_clio_expert_packs":                capUIFull,
		"x_clio_agent_blueprints":            capUIFull,
		"x_clio_user_questions":              capUIFull,
		"x_clio_retry_attempts":              capUIFull,
		"x_clio_context_frames":              capUIFull,
		"x_clio_semantic_events":             capUIFull,
		"x_clio_semantic_trace_backend":      capUIFull,
		"x_clio_semantic_trace_detail":       capUIFull,
		"x_clio_hook_backend":                capUIFull,
		"x_clio_hook_events":                 capUIFull,
		"x_clio_files_content":               capUIFull,
		"x_clio_capability_gaps":             capUIFull,
		"x_clio_synthetic_posthoc_streaming": capUIFull,
		"x_clio_stream_fallback_reasons":     capUIFull,
	} {
		if got := byName[name].ui; got != want {
			t.Fatalf("%s TUI support = %s, want %s", name, capUISupportPlainLabel(got), capUISupportPlainLabel(want))
		}
		if strings.TrimSpace(byName[name].notes) == "" {
			t.Fatalf("%s missing TUI support notes", name)
		}
	}
}

func TestDoctorCapabilityRowsNameCurrentCLIORoutes(t *testing.T) {
	rows := doctorCapabilityRows(gact.Capabilities{Capabilities: gact.CapabilityFlags{
		MCP:                  true,
		SessionSummary:       true,
		AttachmentsUpload:    true,
		XClioSemanticEvents:  true,
		XClioFilesContent:    true,
	}})
	byName := map[string]capRow{}
	for _, row := range rows {
		byName[row.name] = row
	}
	for name, wants := range map[string][]string{
		"mcp":                    {"POST /v1/mcp/servers/{id}/reconnect"},
		"session_summary":        {"POST /v1/sessions/{id}/summarize"},
		"attachments_upload":     {"POST", "/v1/sessions/{id}/attachments"},
		"x_clio_semantic_events": {"semantic.event", "tool.call.*"},
		"x_clio_files_content":   {"GET /v1/sessions/{id}/context/files/content"},
	} {
		row, ok := byName[name]
		if !ok {
			t.Fatalf("missing capability row %q", name)
		}
		for _, want := range wants {
			if !strings.Contains(row.notes, want) {
				t.Fatalf("%s notes missing %q: %q", name, want, row.notes)
			}
		}
	}
}

func TestDoctorHealthFooterAdvertisesClickableDetails(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width, a.height = 120, 40
	a.doctorOpen = true
	a.doctor = &doctorState{
		health: gact.HealthResponse{
			Healthy:       true,
			OverallStatus: "ready",
			Integrations: []gact.Integration{{
				Name:   "lm",
				Status: "ready",
				Detail: "argonne/gpt-oss-120b configured",
			}},
		},
	}

	out := stripANSI(a.viewDoctor())
	if !strings.Contains(out, "click row details") {
		t.Fatalf("doctor footer should advertise mouse row details when rows are actionable:\n%s", out)
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

func TestDoctorCapabilitiesUseBoundedScrollWindow(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width, a.height = 120, 22
	a.doctorOpen = true
	a.doctor = &doctorState{
		tab: doctorTabCapabilities,
		caps: gact.Capabilities{Capabilities: gact.CapabilityFlags{
			Workspaces: true,
			Sessions:   true,
		}},
	}

	out := stripANSI(a.viewDoctor())
	if strings.Contains(out, "agent_write") || strings.Contains(out, "skills_extraction") {
		t.Fatalf("short doctor modal should window long capability list:\n%s", out)
	}
	if strings.Contains(out, "1-") {
		t.Fatalf("windowed doctor modal should not advertise numeric line range:\n%s", out)
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("windowed doctor modal should show a side scroll indicator:\n%s", out)
	}

	a.doctor.scroll = 1 << 30
	out = stripANSI(a.viewDoctor())
	if !strings.Contains(out, "x_clio_capability_gaps") {
		t.Fatalf("bottom-scrolled doctor modal should show final capability:\n%s", out)
	}
	if a.doctor.scroll <= 0 {
		t.Fatalf("render should clamp and persist positive doctor scroll, got %d", a.doctor.scroll)
	}
}

func TestDoctorModalHeightLeavesFooterGutter(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width, a.height = 120, 36
	a.doctorOpen = true
	a.doctor = &doctorState{tab: doctorTabCapabilities}

	out := stripANSI(a.viewDoctor())
	renderedHeight := len(strings.Split(out, "\n"))
	if renderedHeight > a.height-2 {
		t.Fatalf("doctor modal height = %d, want <= %d\n%s", renderedHeight, a.height-2, out)
	}
	if strings.Contains(out, "1-") {
		t.Fatalf("bounded doctor capabilities should not advertise numeric line range:\n%s", out)
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("bounded doctor capabilities should show a side scroll indicator:\n%s", out)
	}
}

func TestDoctorShortHealthUsesCompactSharedBodyHeight(t *testing.T) {
	short := newReadyApp(nil, nil)
	short.width, short.height = 150, 44
	short.doctorOpen = true
	short.doctor = &doctorState{
		health: gact.HealthResponse{
			Healthy:       true,
			OverallStatus: "ready",
			Integrations: []gact.Integration{{
				Name:   "api",
				Status: "ready",
				Detail: "ok",
			}},
		},
	}
	shortRect := overlayMouseRect(short.viewDoctor(), short.width, short.height)
	if shortRect.y != 3 {
		t.Fatalf("short doctor top = %d, want shared top row 3", shortRect.y)
	}

	long := newReadyApp(nil, nil)
	long.width, long.height = short.width, short.height
	long.doctorOpen = true
	long.doctor = &doctorState{tab: doctorTabCapabilities}
	longRect := overlayMouseRect(long.viewDoctor(), long.width, long.height)
	if shortRect.w != longRect.w {
		t.Fatalf("short doctor width = %d, long doctor width = %d; shared modal width should be stable", shortRect.w, longRect.w)
	}
	if shortRect.h >= longRect.h {
		t.Fatalf("short doctor height = %d, want less than capabilities height %d", shortRect.h, longRect.h)
	}
	if longRect.y != shortRect.y {
		t.Fatalf("long doctor top = %d, want same top as compact doctor %d", longRect.y, shortRect.y)
	}
}

func TestDoctorMouseWheelScrollsCapabilities(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width, a.height = 120, 22
	a.doctorOpen = true
	a.doctor = &doctorState{tab: doctorTabCapabilities}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "doctor:body:wheel")
	if !ok {
		t.Fatal("missing doctor body wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.doctor == nil || a.doctor.scroll != 1 {
		t.Fatalf("wheel down should advance doctor scroll, got %+v", a.doctor)
	}
	_ = a.View()
	target, ok = findHitTargetForTest(a, "doctor:body:wheel")
	if !ok {
		t.Fatal("missing doctor body wheel target after scroll")
	}
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelUp,
	}))
	a = model.(*App)
	if a.doctor == nil || a.doctor.scroll != 0 {
		t.Fatalf("wheel up should move doctor scroll back, got %+v", a.doctor)
	}
}
