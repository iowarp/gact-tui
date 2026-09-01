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

	"github.com/JaimeCernuda/gact-tui/contract/gact"
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
	a.session.currentStatus = gact.StatusRunning
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
	a.session.currentStatus = gact.StatusWaitingPermission
	a.session.pendingPermissions = []client.PermissionWire{{
		PermissionRequest: gact.PermissionRequest{
			ID:        "perm_1",
			SessionID: "sess_1",
			Summary:   "Run shell command: rm -rf /tmp/scratch",
			ToolCall: gact.PermissionToolCall{
				ToolName: "shell",
				Input: map[string]any{
					"command": "rm -rf /tmp/scratch",
				},
				Annotations: gact.ToolAnnotations{DestructiveHint: true},
			},
		},
		Status: "pending",
	}}
	got := stripVolatile(renderAtSize(a, 110, 30))
	assertGolden(t, got)
}

func TestView_HelpOverlay(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.help.open = true
	got := stripVolatile(renderAtSize(a, 110, 30))
	assertGolden(t, got)
}

func TestView_PaletteOpen(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.cmdPalette.commands = []gact.Command{
		{ID: "/clear", Title: "Clear chat history", Source: "builtin"},
		{ID: "/diff", Title: "Show pending diffs", Source: "builtin"},
		{ID: "/model", Title: "Switch model", Source: "builtin"},
	}
	a.cmdPalette.paletteOpen = true
	got := stripVolatile(renderAtSize(a, 110, 30))
	assertGolden(t, got)
}

func TestView_PaletteFiltered(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.cmdPalette.commands = []gact.Command{
		{ID: "/clear", Title: "Clear chat history", Source: "builtin"},
		{ID: "/diff", Title: "Show pending diffs", Source: "builtin"},
		{ID: "/model", Title: "Switch model", Source: "builtin"},
		{ID: "/help", Title: "Show help", Source: "builtin"},
	}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "show"
	got := stripVolatile(renderAtSize(a, 110, 30))
	assertGolden(t, got)
}

// --- helpers --------------------------------------------------------------

func newReadyApp(sessions []gact.Session, msgs []gact.Message) *App {
	a := New("http://test.local")
	a.stage = StageReady
	a.session.workspaces = []gact.Workspace{{ID: "ws_default", Name: "default"}}
	a.session.wsID = "ws_default"
	a.session.sessions = sessions
	a.conversation.messages = msgs
	if len(sessions) > 0 {
		a.session.selected = 0
		a.session.currentStatus = sessions[0].Status
		// N1: the input buffer is associated with the initially-
		// selected session. Real app sets this via selectSession
		// on connectedMsg; tests bypass that path so wire it up by
		// hand or draft-preserve logic sees lastLoadedSessionID="".
		a.inputComposer.lastLoadedSessionID = sessions[0].ID
	} else {
		a.session.selected = -1
	}
	// Hide blink cursor for deterministic goldens.
	a.inputComposer.input.SetVirtualCursor(false)
	return a
}
