// View tests — construct App in known states and validate the rendered
// output against golden files. Bypasses tea.NewProgram and the SSE goroutine
// so the tests are deterministic.
package ui

import (
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

var update = flag.Bool("update-views", false, "update view-golden files")

// goldenPath returns the file path under testdata/ for the given test.
func goldenPath(t *testing.T) string {
	t.Helper()
	name := strings.ReplaceAll(t.Name(), "/", "_")
	return filepath.Join("testdata", name+".golden")
}

// assertGolden compares got to the golden file. Use -update to write a new one.
func assertGolden(t *testing.T, got string) {
	t.Helper()
	path := goldenPath(t)
	if *update {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(path, []byte(got), 0o644); err != nil {
			t.Fatalf("write golden: %v", err)
		}
		return
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read golden %s: %v (run with -update)", path, err)
	}
	got = strings.ReplaceAll(got, "\r\n", "\n")
	wantText := strings.ReplaceAll(string(want), "\r\n", "\n")
	got = trimLineRightSpace(got)
	wantText = trimLineRightSpace(wantText)
	if got != wantText {
		t.Errorf("output diverges from %s\n--- got ---\n%s\n--- want ---\n%s",
			path, got, wantText)
	}
}

func trimLineRightSpace(s string) string {
	lines := strings.Split(s, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimRight(line, " \t")
	}
	return strings.Join(lines, "\n")
}

// renderAtSize calls View() with the given dimensions and returns Content.
func renderAtSize(a *App, w, h int) string {
	a.width = w
	a.height = h
	return a.View().Content
}

// stripVolatile masks fields that change between runs (e.g. UTC clock).
// Without this, golden tests would fail every second.
func stripVolatile(s string) string {
	return clockRe.ReplaceAllString(s, "HH:MM:SSZ")
}

var clockRe = regexpMustCompile(`\d\d:\d\d:\d\dZ`)

// regexpMustCompile is a helper to keep the import lean.
func regexpMustCompile(p string) interface{ ReplaceAllString(string, string) string } {
	r := mustCompileImpl(p)
	return r
}

// --- Test cases -----------------------------------------------------------

func TestView_ConnectingStage(t *testing.T) {
	a := New("http://test.local")
	got := stripVolatile(renderAtSize(a, 80, 24))
	assertGolden(t, got)
}

func TestView_ErrorStage(t *testing.T) {
	a := New("http://test.local")
	a.stage = StageError
	a.stageError = "capabilities: dial tcp: connection refused"
	got := stripVolatile(renderAtSize(a, 80, 24))
	assertGolden(t, got)
}

func TestView_ReadyEmpty(t *testing.T) {
	a := newReadyApp(nil, nil)
	got := stripVolatile(renderAtSize(a, 100, 30))
	assertGolden(t, got)
}

func TestView_ReadyWithSessions(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{ID: "sess_1", Title: "refactor api", Status: gact.StatusIdle},
		{ID: "sess_2", Title: "add tests", Status: gact.StatusIdle},
		{ID: "sess_3", Title: "review pr #42", Status: gact.StatusIdle},
	}, nil)
	got := stripVolatile(renderAtSize(a, 110, 30))
	assertGolden(t, got)
}

func TestView_EmptyConversationHasNoHardcodedScenarioPrompts(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{ID: "sess_1", Title: "CLIO work", Status: gact.StatusIdle},
	}, nil)

	got := renderAtSize(a, 110, 30)

	for _, unwanted := range []string{
		"Try one of these",
		"read main.go",
		"delete the temp dir",
		"propose an edit to main.go",
		"many tools please",
	} {
		if strings.Contains(got, unwanted) {
			t.Fatalf("empty conversation includes hardcoded scenario prompt %q\n%s", unwanted, got)
		}
	}
}

func TestView_StreamingConversation(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusRunning}}
	msgs := []gact.Message{
		{
			ID: "msg_user", SessionID: "sess_1", Role: gact.RoleUser,
			CreatedAt: time.Date(2026, 4, 18, 5, 0, 0, 0, time.UTC),
			Parts:     []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "read main.go"}},
		},
		{
			ID: "msg_asst", SessionID: "sess_1", Role: gact.RoleAssistant,
			CreatedAt: time.Date(2026, 4, 18, 5, 0, 1, 0, time.UTC),
			Parts: []gact.Part{
				{ID: "p2", Type: gact.PartTypeThinking, Thinking: "Let me consider the right tool."},
				{ID: "p3", Type: gact.PartTypeText, Text: "I'll inspect the file."},
				{ID: "p4", Type: gact.PartTypeToolCall, CallID: "c1", ToolName: "read_file",
					Input: map[string]any{"path": "main.go"}},
			},
		},
	}
	a := newReadyApp(sessions, msgs)
	a.currentStatus = gact.StatusRunning
	got := stripVolatile(renderAtSize(a, 110, 30))
	assertGolden(t, got)
}

func TestView_PermissionBanner(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusWaitingPermission}}
	msgs := []gact.Message{{
		ID: "msg_user", SessionID: "sess_1", Role: gact.RoleUser,
		Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "delete temp dir"}},
	}}
	a := newReadyApp(sessions, msgs)
	a.currentStatus = gact.StatusWaitingPermission
	a.pendingPermissions = []client.PermissionWire{{
		PermissionRequest: gact.PermissionRequest{
			ID:        "perm_1",
			SessionID: "sess_1",
			Summary:   "Run shell command: rm -rf /tmp/scratch",
		},
		Status: "pending",
	}}
	got := stripVolatile(renderAtSize(a, 110, 30))
	assertGolden(t, got)
}

func TestView_HelpOverlay(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.helpOpen = true
	got := stripVolatile(renderAtSize(a, 110, 30))
	assertGolden(t, got)
}

func TestView_PaletteOpen(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.commands = []gact.Command{
		{ID: "/clear", Title: "Clear chat history", Source: "builtin"},
		{ID: "/diff", Title: "Show pending diffs", Source: "builtin"},
		{ID: "/model", Title: "Switch model", Source: "builtin"},
	}
	a.paletteOpen = true
	got := stripVolatile(renderAtSize(a, 110, 30))
	assertGolden(t, got)
}

func TestView_PaletteFiltered(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.commands = []gact.Command{
		{ID: "/clear", Title: "Clear chat history", Source: "builtin"},
		{ID: "/diff", Title: "Show pending diffs", Source: "builtin"},
		{ID: "/model", Title: "Switch model", Source: "builtin"},
		{ID: "/help", Title: "Show help", Source: "builtin"},
	}
	a.paletteOpen = true
	a.paletteFilter = "show"
	got := stripVolatile(renderAtSize(a, 110, 30))
	assertGolden(t, got)
}

// --- helpers --------------------------------------------------------------

func newReadyApp(sessions []gact.Session, msgs []gact.Message) *App {
	a := New("http://test.local")
	a.stage = StageReady
	a.workspaces = []gact.Workspace{{ID: "ws_default", Name: "default"}}
	a.wsID = "ws_default"
	a.sessions = sessions
	a.messages = msgs
	if len(sessions) > 0 {
		a.selected = 0
		a.currentStatus = sessions[0].Status
		// N1: the input buffer is associated with the initially-
		// selected session. Real app sets this via selectSession
		// on connectedMsg; tests bypass that path so wire it up by
		// hand or draft-preserve logic sees lastLoadedSessionID="".
		a.lastLoadedSessionID = sessions[0].ID
	} else {
		a.selected = -1
	}
	// Hide blink cursor for deterministic goldens.
	a.input.SetVirtualCursor(false)
	return a
}

// HHH1: connected deployment labels should replace raw backend URLs.
func TestRenderHeader_DeploymentLabel(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{
			ID: "sess_1", Title: "demo", Status: gact.StatusIdle,
			Model: gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-opus-4-7"},
			Agent: gact.AgentRef{ID: "default"},
		},
	}, nil)
	a.BackendLabel = "myclio (clio)"
	a.width = 200
	got := a.renderHeader()
	if !strings.Contains(got, "myclio (clio)") {
		t.Errorf("expected deployment label in header, got: %q", got)
	}
	if strings.Contains(got, "http://test.local") {
		t.Errorf("raw backend URL should be hidden when deployment label is available: %q", got)
	}
}

func TestRenderHeader_GlobalLMWinsOverStaleSessionModel(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{
			ID: "sess_1", Title: "demo", Status: gact.StatusIdle,
			Model: gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-opus-4-7"},
			Agent: gact.AgentRef{ID: "default"},
		},
	}, nil)
	a.lmProviderInfo = &client.LMProviderInfo{
		Configured: true,
		Provider:   "lm_studio",
		Model:      "qwopus3.5-9b-v3",
	}
	a.width = 200
	got := a.renderHeader()
	if !strings.Contains(got, "model: lm_studio/qwopus3.5-9b-v3") {
		t.Errorf("expected global LM model label in header, got: %q", got)
	}
	if strings.Contains(got, "claude-opus-4-7") {
		t.Errorf("stale per-session model should not appear when global LM is configured: %q", got)
	}
	if strings.Count(got, "model:") != 1 {
		t.Errorf("expected exactly one model label, got: %q", got)
	}
	if strings.Contains(got, "agent: default") {
		t.Errorf("default agent label should be suppressed, got: %q", got)
	}
	if !strings.Contains(got, "workspace: default") {
		t.Errorf("workspace label should be spelled out, got: %q", got)
	}
}

func TestRenderHeader_HistoricalSessionWithoutModelDoesNotBorrowCurrentLM(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{
			ID: "sess_1", Title: "persisted trace", Status: gact.StatusIdle,
			MessageCount: 4,
		},
	}, nil)
	a.lmProviderInfo = &client.LMProviderInfo{
		Configured: true,
		Provider:   "argonne",
		Model:      "gpt-oss-120b",
	}
	a.width = 200

	got := a.renderHeader()
	if strings.Contains(got, "model:") {
		t.Fatalf("historical session without recorded model should not borrow current backend model: %q", got)
	}
}

func TestRenderHeader_NonDefaultAgentAndRouting(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{
			ID: "sess_1", Title: "demo", Status: gact.StatusIdle,
			Agent:       gact.AgentRef{ID: "analysis", Mode: "review"},
			RoutingMode: "experts",
		},
	}, nil)
	a.width = 200
	got := a.renderHeader()
	if !strings.Contains(got, "agent: analysis (review)") {
		t.Errorf("expected non-default agent label in header, got: %q", got)
	}
	if !strings.Contains(got, "routing: experts") {
		t.Errorf("expected routing label in header, got: %q", got)
	}
}

// HHH1 narrow-window guard: model/agent get dropped, but session label
// still wins over them — header should never panic on tight widths.
func TestRenderHeader_NarrowDropsOptional(t *testing.T) {
	a := newReadyApp([]gact.Session{
		{
			ID: "sess_1", Title: "demo", Status: gact.StatusIdle,
			Model: gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-opus-4-7"},
			Agent: gact.AgentRef{ID: "default"},
		},
	}, nil)
	a.width = 50
	got := a.renderHeader()
	if !strings.Contains(got, "GACT") {
		t.Errorf("required GACT badge missing in narrow header: %q", got)
	}
}

// OOO1: pickAttachIndex chooses the right initial selection given
// AttachSessionID. Tested directly so we don't pay selectSession's
// network timeout per row in the suite.
func TestPickAttachIndex(t *testing.T) {
	cases := []struct {
		name        string
		attach      string
		sessions    []gact.Session
		wantIdx     int
		wantMissing bool
	}{
		{
			name: "no attach defaults to row 0",
			sessions: []gact.Session{
				{ID: "sess_a", Title: "alpha"},
				{ID: "sess_b", Title: "bravo"},
			},
			wantIdx: 0,
		},
		{
			name:   "match by sess_ id",
			attach: "sess_b",
			sessions: []gact.Session{
				{ID: "sess_a", Title: "alpha"},
				{ID: "sess_b", Title: "bravo"},
			},
			wantIdx: 1,
		},
		{
			name:   "match by title",
			attach: "alpha",
			sessions: []gact.Session{
				{ID: "sess_a", Title: "alpha"},
				{ID: "sess_b", Title: "bravo"},
			},
			wantIdx: 0,
		},
		{
			name:   "missing falls back to 0 with flag set",
			attach: "sess_nope",
			sessions: []gact.Session{
				{ID: "sess_a", Title: "alpha"},
			},
			wantIdx:     0,
			wantMissing: true,
		},
		// RRRRRRRR1: id-prefix match resolves an 8-char shortened sid.
		{
			name:   "match by id prefix",
			attach: "sess_b",
			sessions: []gact.Session{
				{ID: "sess_aaaa1111", Title: "alpha"},
				{ID: "sess_bbbb2222", Title: "bravo"},
			},
			wantIdx: 1,
		},
		// RRRRRRRR1: substring title, case-insensitive.
		{
			name:   "match by title substring (case-insensitive)",
			attach: "REFACTOR",
			sessions: []gact.Session{
				{ID: "sess_a", Title: "fix bug"},
				{ID: "sess_b", Title: "refactor api auth"},
			},
			wantIdx: 1,
		},
		// RRRRRRRR1: precedence — exact id beats prefix beats title sub.
		{
			name:   "exact id wins over title substring",
			attach: "sess_b",
			sessions: []gact.Session{
				{ID: "sess_aaaa", Title: "this contains sess_b somehow"},
				{ID: "sess_b", Title: "exact-target"},
			},
			wantIdx: 1,
		},
		// RRRRRRRR1: exact title wins over id prefix when both match.
		{
			name:   "exact title beats id prefix",
			attach: "alpha",
			sessions: []gact.Session{
				{ID: "alphabeta", Title: "other"},
				{ID: "sess_x", Title: "alpha"},
			},
			wantIdx: 1,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			a := New("http://test.local")
			a.AttachSessionID = tc.attach
			a.sessions = tc.sessions
			gotIdx, gotMissing := a.pickAttachIndex()
			if gotIdx != tc.wantIdx {
				t.Errorf("idx: got %d, want %d", gotIdx, tc.wantIdx)
			}
			if gotMissing != tc.wantMissing {
				t.Errorf("missing: got %v, want %v", gotMissing, tc.wantMissing)
			}
		})
	}
}

// IIIII1: Ctrl+Z is now a clean detach — sets DetachedSessionID
// to the current sid + returns tea.Quit. Main reads
// DetachedSessionID after p.Run() returns and prints a reattach
// hint. Replaces the previous LLL8b SIGTSTP suspend.
func TestUpdate_CtrlZDetachesCleanly(t *testing.T) {
	a := newReadyApp(
		[]gact.Session{{ID: "sess_alpha", Title: "alpha", Status: gact.StatusIdle}},
		nil,
	)
	out, cmd := a.Update(tea.KeyPressMsg{Code: 'z', Mod: tea.ModCtrl, Text: ""})
	got := out.(*App)
	if cmd == nil {
		t.Fatalf("expected non-nil cmd from Ctrl+Z")
	}
	if got.DetachedSessionID != "sess_alpha" {
		t.Errorf("expected DetachedSessionID=sess_alpha, got %q", got.DetachedSessionID)
	}
}

// And with no current session selected, Ctrl+Z still detaches
// cleanly (DetachedSessionID empty signals "no reattach hint").
func TestUpdate_CtrlZNoSession(t *testing.T) {
	a := newReadyApp(nil, nil)
	out, cmd := a.Update(tea.KeyPressMsg{Code: 'z', Mod: tea.ModCtrl, Text: ""})
	got := out.(*App)
	if cmd == nil {
		t.Fatalf("expected non-nil cmd from Ctrl+Z")
	}
	if got.DetachedSessionID != "" {
		t.Errorf("expected empty DetachedSessionID with no session, got %q",
			got.DetachedSessionID)
	}
}

// Verify the app responds to Tab without panicking.
func TestUpdate_TabCyclesFocus(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.focus = FocusInput
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyTab})
	got := out.(*App)
	if got.focus != FocusSidebar {
		t.Errorf("after tab from input, focus = %v, want sidebar", got.focus)
	}
}
