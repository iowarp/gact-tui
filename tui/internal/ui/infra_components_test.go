package ui

import (
	"errors"
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// errFake is a sentinel error for the failure-path assertions below.
var errFake = errors.New("boom")

// --- tickerComponent ------------------------------------------------------

func TestTickerSpinnerCharFallsBackWhenNoFrames(t *testing.T) {
	a := newReadyApp(nil, nil)
	saved := spinnerFrames
	spinnerFrames = nil
	defer func() { spinnerFrames = saved }()
	if got := a.ticker.spinnerChar(); got != "●" {
		t.Fatalf("spinnerChar with no frames = %q, want ●", got)
	}
}

func TestTickerSpinnerCharCyclesFrames(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.spinnerFrame = len(spinnerFrames) + 2 // exercise the modulo
	want := spinnerFrames[2]
	if got := a.ticker.spinnerChar(); got != want {
		t.Fatalf("spinnerChar = %q, want %q", got, want)
	}
}

func TestTickerHandleSpinnerTickRearmsWhileRunning(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1", Status: gact.StatusRunning}}, nil)
	a.session.currentStatus = gact.StatusRunning
	before := a.spinnerFrame
	_, cmd := a.ticker.handleSpinnerTick(spinnerTickMsg{})
	if a.spinnerFrame != before+1 {
		t.Fatalf("spinnerFrame = %d, want %d", a.spinnerFrame, before+1)
	}
	if cmd == nil {
		t.Fatal("expected re-arm command while a session is running")
	}
}

func TestTickerHandleSpinnerTickStopsWhenIdle(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1", Status: gact.StatusIdle}}, nil)
	a.session.currentStatus = gact.StatusIdle
	before := a.spinnerFrame
	_, cmd := a.ticker.handleSpinnerTick(spinnerTickMsg{})
	if a.spinnerFrame != before+1 {
		t.Fatalf("spinnerFrame = %d, want %d", a.spinnerFrame, before+1)
	}
	if cmd != nil {
		t.Fatal("expected no re-arm command when everything is idle")
	}
}

func TestTickerTickDelayClamps(t *testing.T) {
	a := newReadyApp(nil, nil)

	a.IntroFrameDelay = 0
	if got := a.ticker.tickDelay(); got != introFrameDelay {
		t.Fatalf("tickDelay(0) = %v, want fallback %v", got, introFrameDelay)
	}

	a.IntroFrameDelay = 5 * time.Millisecond
	if got := a.ticker.tickDelay(); got != 20*time.Millisecond {
		t.Fatalf("tickDelay(5ms) = %v, want clamp to 20ms", got)
	}

	a.IntroFrameDelay = 10 * time.Second
	if got := a.ticker.tickDelay(); got != 1*time.Second {
		t.Fatalf("tickDelay(10s) = %v, want clamp to 1s", got)
	}

	a.IntroFrameDelay = 200 * time.Millisecond
	if got := a.ticker.tickDelay(); got != 200*time.Millisecond {
		t.Fatalf("tickDelay(200ms) = %v, want passthrough", got)
	}
}

func TestTickerHandleIntroTickAdvancesOnlyInIntroStage(t *testing.T) {
	a := newReadyApp(nil, nil)

	// Off the intro stage: no advance, no re-arm.
	a.stage = StageReady
	a.introFrameIdx = 3
	_, cmd := a.ticker.handleIntroTick(introTickMsg{})
	if a.introFrameIdx != 3 {
		t.Fatalf("introFrameIdx changed off intro stage: %d", a.introFrameIdx)
	}
	if cmd != nil {
		t.Fatal("expected no re-arm off the intro stage")
	}

	// On the intro stage: advance + re-arm.
	a.stage = StageIntro
	a.introFrameIdx = 0
	_, cmd = a.ticker.handleIntroTick(introTickMsg{})
	if a.introFrameIdx != 1 {
		t.Fatalf("introFrameIdx = %d, want 1 after advance", a.introFrameIdx)
	}
	if cmd == nil {
		t.Fatal("expected re-arm command while on the intro stage")
	}
}

// --- permissionComponent --------------------------------------------------

func TestPermissionHandleKeyEmptyQueueNoOp(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
	a.session.pendingPermissions = nil
	cmd, handled := a.permission.handleKey(tea.KeyPressMsg{Code: 'a', Text: "a"})
	if handled {
		t.Fatal("empty queue should not handle the key")
	}
	if cmd != nil {
		t.Fatal("empty queue should not dispatch a command")
	}
}

func TestPermissionHandleKeyDispatchesForEachAction(t *testing.T) {
	for _, key := range []string{"a", "d", "s", "w"} {
		a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
		a.session.pendingPermissions = []client.PermissionWire{{
			PermissionRequest: gact.PermissionRequest{ID: "perm_1", SessionID: "s1"},
			Status:            "pending",
		}}
		cmd, handled := a.permission.handleKey(tea.KeyPressMsg{Code: rune(key[0]), Text: key})
		if !handled {
			t.Fatalf("key %q should be handled", key)
		}
		if cmd == nil {
			t.Fatalf("key %q should dispatch a response command", key)
		}
	}
}

func TestPermissionHandleKeyUnknownKeyNotHandled(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
	a.session.pendingPermissions = []client.PermissionWire{{
		PermissionRequest: gact.PermissionRequest{ID: "perm_1", SessionID: "s1"},
		Status:            "pending",
	}}
	cmd, handled := a.permission.handleKey(tea.KeyPressMsg{Code: 'x', Text: "x"})
	if handled || cmd != nil {
		t.Fatalf("unknown key should be ignored, got handled=%v cmd=%v", handled, cmd != nil)
	}
}

func TestPermissionRenderBannerContainsMessageAndActions(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
	p := client.PermissionWire{
		PermissionRequest: gact.PermissionRequest{
			ID:      "perm_1",
			Summary: "run shell command: echo hi",
			ToolCall: gact.PermissionToolCall{
				ToolName: "bash",
				Input:    map[string]any{"command": "echo hi"},
			},
		},
	}
	rendered, actions := a.permission.renderBanner(p, 120)
	if len(actions) != 4 {
		t.Fatalf("expected 4 banner actions, got %d", len(actions))
	}
	for _, want := range []string{"A:allow", "D:deny", "S:sess", "W:work"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("banner missing action label %q:\n%s", want, rendered)
		}
	}
	if !strings.Contains(rendered, "Approval needed") {
		t.Fatalf("banner missing approval message:\n%s", rendered)
	}
	// Action columns must be laid out left-to-right in order.
	for i := 1; i < len(actions); i++ {
		if actions[i].col <= actions[i-1].col {
			t.Fatalf("action %d col %d not after previous %d", i, actions[i].col, actions[i-1].col)
		}
	}
}

func TestPermissionRenderBannerClampsTinyWidth(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
	p := client.PermissionWire{
		PermissionRequest: gact.PermissionRequest{ID: "perm_1", Summary: "operator decision"},
	}
	// contentWidth < 1 must be clamped to 1 without panicking.
	rendered, actions := a.permission.renderBanner(p, 0)
	if len(actions) != 4 {
		t.Fatalf("expected 4 actions even at tiny width, got %d", len(actions))
	}
	if rendered == "" {
		t.Fatal("expected non-empty banner even at tiny width")
	}
}

// --- memoryComponent ------------------------------------------------------

func TestMemoryHandleStatsCachesSnapshot(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
	stats := gact.MemoryStats{
		Metadata: map[string]any{"marker": "v1"},
	}
	model, cmd := a.memory.handleStats(memoryStatsMsg{stats: stats})
	if cmd != nil {
		t.Fatal("handleStats should not dispatch a command")
	}
	if model.(*App) != a {
		t.Fatal("handleStats should return the same app model")
	}
	if got, _ := a.session.memoryStats.Metadata["marker"].(string); got != "v1" {
		t.Fatalf("memoryStats not cached, metadata = %#v", a.session.memoryStats.Metadata)
	}
}

func TestMemoryHandleStatsOverwritesPrevious(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
	a.memory.handleStats(memoryStatsMsg{stats: gact.MemoryStats{Metadata: map[string]any{"marker": "old"}}})
	a.memory.handleStats(memoryStatsMsg{stats: gact.MemoryStats{Metadata: map[string]any{"marker": "new"}}})
	if got, _ := a.session.memoryStats.Metadata["marker"].(string); got != "new" {
		t.Fatalf("memoryStats not overwritten, marker = %q", got)
	}
}

// --- pluginsComponent -----------------------------------------------------

func newPluginApp(t *testing.T) *App {
	t.Helper()
	a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
	a.SetPlugins([]PluginsLoaded{{
		Name:      "demo",
		SourceDir: "/plugins/demo",
		Commands: []PluginsCommand{
			{ID: "/hello", Title: "Hello", Description: "say hi", Command: "echo", Args: []string{"hi"}},
			{ID: "/bye", Title: "Bye", Command: "echo", Args: []string{"bye"}},
		},
	}})
	return a
}

func TestPluginsFindCommand(t *testing.T) {
	a := newPluginApp(t)
	got := a.plugins.findCommand("/hello")
	if got == nil {
		t.Fatal("findCommand(/hello) returned nil")
	}
	if got.Title != "Hello" || got.SourceDir != "/plugins/demo" {
		t.Fatalf("findCommand returned wrong tuple: %#v", got)
	}
	if a.plugins.findCommand("/missing") != nil {
		t.Fatal("findCommand(/missing) should return nil")
	}
}

func TestPluginsHandleExecSurfacesOutputHint(t *testing.T) {
	a := newPluginApp(t)
	_, cmd := a.plugins.handleExec(pluginExecMsg{ID: "/hello", Output: "first line\nsecond line"})
	if !strings.Contains(a.transientHint, "plugin /hello: first line") {
		t.Fatalf("hint = %q, want plugin output first line", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("handleExec should schedule a hint expiry command")
	}
}

func TestPluginsHandleExecSurfacesFailureHint(t *testing.T) {
	a := newPluginApp(t)
	a.plugins.handleExec(pluginExecMsg{ID: "/hello", Output: "boom", Err: errFake})
	if !strings.Contains(a.transientHint, "plugin /hello failed: boom") {
		t.Fatalf("hint = %q, want failure hint", a.transientHint)
	}
}

func TestPluginsHandleExecEmptyOutputUsesDoneHint(t *testing.T) {
	a := newPluginApp(t)
	a.plugins.handleExec(pluginExecMsg{ID: "/hello", Output: ""})
	if !strings.Contains(a.transientHint, "plugin /hello done") {
		t.Fatalf("hint = %q, want done hint", a.transientHint)
	}
}

// --- contextFilesComponent ------------------------------------------------

func TestContextFilesHandleFilesLoadedReplacesForCurrentSession(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
	files := []gact.ContextFile{{Path: "main.go", Mode: "read"}}
	a.contextFiles.handleFilesLoaded(contextFilesLoadedMsg{sessionID: "s1", files: files})
	if len(a.session.contextFiles) != 1 || a.session.contextFiles[0].Path != "main.go" {
		t.Fatalf("context files not loaded: %#v", a.session.contextFiles)
	}
}

func TestContextFilesHandleFilesLoadedIgnoresStaleSession(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
	a.session.contextFiles = []gact.ContextFile{{Path: "keep.go"}}
	a.contextFiles.handleFilesLoaded(contextFilesLoadedMsg{sessionID: "other", files: []gact.ContextFile{{Path: "stale.go"}}})
	if len(a.session.contextFiles) != 1 || a.session.contextFiles[0].Path != "keep.go" {
		t.Fatalf("stale-session load should be ignored: %#v", a.session.contextFiles)
	}
}

func TestContextFilesHandleAddedMergesAndHints(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
	a.contextFiles.handleAdded(contextFileAddedMsg{sessionID: "s1", file: gact.ContextFile{Path: "added.go", Mode: "read"}})
	if len(a.session.contextFiles) != 1 || a.session.contextFiles[0].Path != "added.go" {
		t.Fatalf("added file not merged: %#v", a.session.contextFiles)
	}
	if !strings.Contains(a.transientHint, "added added.go to context") {
		t.Fatalf("hint = %q", a.transientHint)
	}
}

func TestContextFilesHandleAddedErrorHintsAndSkipsMerge(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
	a.contextFiles.handleAdded(contextFileAddedMsg{sessionID: "s1", file: gact.ContextFile{Path: "x.go"}, err: errFake})
	if len(a.session.contextFiles) != 0 {
		t.Fatalf("failed add should not merge: %#v", a.session.contextFiles)
	}
	if !strings.Contains(a.transientHint, "add failed") {
		t.Fatalf("hint = %q, want add-failed", a.transientHint)
	}
}

func TestContextFilesHandleUploadedUsesLocalBaseWhenPathEmpty(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
	a.contextFiles.handleUploaded(contextFileUploadedMsg{
		sessionID: "s1",
		localPath: "/tmp/report.csv",
		file:      gact.ContextFile{Path: "report.csv"},
	})
	if !strings.Contains(a.transientHint, "uploaded report.csv to context") {
		t.Fatalf("hint = %q", a.transientHint)
	}
	if len(a.session.contextFiles) != 1 {
		t.Fatalf("uploaded file not merged: %#v", a.session.contextFiles)
	}
}

func TestContextFilesHandleRemovedDropsEntry(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
	a.session.contextFiles = []gact.ContextFile{{Path: "a.go"}, {Path: "b.go"}}
	a.contextFiles.handleRemoved(contextFileRemovedMsg{sessionID: "s1", path: "a.go"})
	if len(a.session.contextFiles) != 1 || a.session.contextFiles[0].Path != "b.go" {
		t.Fatalf("removed file still present: %#v", a.session.contextFiles)
	}
	if !strings.Contains(a.transientHint, "removed a.go from context") {
		t.Fatalf("hint = %q", a.transientHint)
	}
}

func TestContextFilesHandleRemovedErrorHints(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
	a.session.contextFiles = []gact.ContextFile{{Path: "a.go"}}
	a.contextFiles.handleRemoved(contextFileRemovedMsg{sessionID: "s1", path: "a.go", err: errFake})
	if len(a.session.contextFiles) != 1 {
		t.Fatalf("failed remove should not drop entry: %#v", a.session.contextFiles)
	}
	if !strings.Contains(a.transientHint, "remove failed") {
		t.Fatalf("hint = %q, want remove-failed", a.transientHint)
	}
}

func TestContextFilesHandleRemovedClosesMatchingDetail(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
	a.session.contextFiles = []gact.ContextFile{{Path: "a.go"}}
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{messageID: "context", partID: "a.go"}
	a.contextFiles.handleRemoved(contextFileRemovedMsg{sessionID: "s1", path: "a.go"})
	if a.detail.visible {
		t.Fatal("removing the open context file should close its detail")
	}
}

func TestContextFilesDetailRowsCoverFileSessionAndActions(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "sess_1", Title: "Demo", Status: "idle"}}, nil)
	a.session.selected = 0
	cf := gact.ContextFile{
		Path:     "src/app.go",
		Mode:     "edit",
		Size:     2048,
		Language: "go",
		Uploaded: false,
	}
	rows := a.contextFiles.detailRows(cf)
	joined := strings.Join(rows, "\n")
	for _, want := range []string{
		"File",
		"src/app.go",
		"edit (backend may propose changes)",
		"2.0 KiB (2048 bytes)",
		"go",
		"Session",
		"Demo",
		"sess_1",
		"Actions",
		"add another context file",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("detailRows missing %q:\n%s", want, joined)
		}
	}
}

func TestContextFilesByPath(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1"}}, nil)
	a.session.contextFiles = []gact.ContextFile{{Path: "found.go", Mode: "read"}}
	if cf, ok := a.contextFiles.byPath("found.go"); !ok || cf.Mode != "read" {
		t.Fatalf("byPath(found.go) = %#v, ok=%v", cf, ok)
	}
	if _, ok := a.contextFiles.byPath("missing.go"); ok {
		t.Fatal("byPath(missing.go) should report not found")
	}
}
