// End-to-end TUI test: drives the real Bubbletea App via teatest while
// talking to a freshly-built emulator binary over real HTTP. Runs with
// AltScreen disabled so teatest's PTY simulator can capture output
// reliably (see App.DisableAltScreen).
package ui

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/exp/teatest/v2"
)

func pickPort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("pick port: %v", err)
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

func startEmulator(t *testing.T) (string, func()) {
	t.Helper()
	tmp := t.TempDir()
	bin := filepath.Join(tmp, "emulator-server")
	_, file, _, _ := runtime.Caller(0)
	repoRoot := filepath.Join(filepath.Dir(file), "..", "..", "..")
	build := exec.Command("go", "build", "-o", bin, "./emulator/cmd/emulator-server")
	build.Dir = repoRoot
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}

	port := pickPort(t)
	cmd := exec.Command(bin, "-port", fmt.Sprintf("%d", port), "-timing", "fast")
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		t.Fatalf("start: %v", err)
	}
	url := fmt.Sprintf("http://127.0.0.1:%d", port)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := http.Get(url + "/v1/health")
		if err == nil && resp.StatusCode == 200 {
			resp.Body.Close()
			return url, func() {
				_ = cmd.Process.Signal(os.Interrupt)
				_ = cmd.Wait()
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	_ = cmd.Process.Kill()
	t.Fatal("emulator failed to come up")
	return "", nil
}

// newTestApp builds an App with AltScreen disabled and (optionally) a
// non-default theme so teatest can capture output deterministically.
func newTestApp(url string) *App {
	app := New(url)
	app.DisableAltScreen = true
	return app
}

// waitForOutput blocks until the predicate matches the streaming output
// or the timeout elapses.
func waitForOutput(t *testing.T, tm *teatest.TestModel, pred func(string) bool, timeout time.Duration) {
	t.Helper()
	teatest.WaitFor(t, tm.Output(),
		func(b []byte) bool { return pred(string(b)) },
		teatest.WithDuration(timeout),
		teatest.WithCheckInterval(40*time.Millisecond),
	)
}

func TestE2E_TUI_HappyPath(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()

	app := newTestApp(url)
	tm := teatest.NewTestModel(t, app, teatest.WithInitialTermSize(140, 40))
	t.Cleanup(func() { _ = tm.Quit() })

	// Wait for both: SESSIONS title + the empty-state callout. Both
	// land in the same render burst when StageReady arrives.
	waitForOutput(t, tm, func(s string) bool {
		return strings.Contains(s, "SESSIONS") &&
			(strings.Contains(s, "first conversation") || strings.Contains(s, "Other things to try"))
	}, 3*time.Second)

	// Create a session via Ctrl+N.
	tm.Send(tea.KeyPressMsg{Code: 'n', Mod: tea.ModCtrl})

	waitForOutput(t, tm, func(s string) bool {
		return strings.Contains(s, "session: ")
	}, 3*time.Second)

	// Send a message via the textarea (which has focus).
	tm.Type("read main.go")
	tm.Send(tea.KeyPressMsg{Code: tea.KeyEnter})

	// teatest.WaitFor consumes the reader between calls, so combine
	// asserting all three in one predicate. The full assistant turn
	// (thinking → tool_call → tool result) renders within ~5s on Fast.
	// L4 reshaped tool rendering: `ReadFile(path)` header + `⎿` glyph
	// leading the indented output (no `● TOOL` row between them, since
	// the L4 polish nests tool_result under its call).
	waitForOutput(t, tm, func(s string) bool {
		return strings.Contains(s, "ASSISTANT") &&
			strings.Contains(s, "ReadFile(") &&
			strings.Contains(s, "⎿")
	}, 8*time.Second)

	tm.Send(tea.KeyPressMsg{Code: 'c', Mod: tea.ModCtrl})
	_, _ = io.ReadAll(tm.FinalOutput(t, teatest.WithFinalTimeout(3*time.Second)))
}

func TestE2E_TUI_PermissionFlow(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()

	app := newTestApp(url)
	tm := teatest.NewTestModel(t, app, teatest.WithInitialTermSize(140, 40))
	t.Cleanup(func() { _ = tm.Quit() })

	waitForOutput(t, tm, func(s string) bool { return strings.Contains(s, "SESSIONS") },
		3*time.Second)

	tm.Send(tea.KeyPressMsg{Code: 'n', Mod: tea.ModCtrl})
	waitForOutput(t, tm, func(s string) bool { return strings.Contains(s, "session: ") },
		3*time.Second)

	tm.Type("delete the temp directory")
	tm.Send(tea.KeyPressMsg{Code: tea.KeyEnter})

	waitForOutput(t, tm, func(s string) bool {
		return strings.Contains(s, "Permission needed")
	}, 5*time.Second)

	// 'a' to allow.
	tm.Send(tea.KeyPressMsg{Code: 'a', Text: "a"})

	waitForOutput(t, tm, func(s string) bool {
		return strings.Contains(s, "Removed") || strings.Contains(s, "directory was removed")
	}, 5*time.Second)

	tm.Send(tea.KeyPressMsg{Code: 'c', Mod: tea.ModCtrl})
	_, _ = io.ReadAll(tm.FinalOutput(t, teatest.WithFinalTimeout(3*time.Second)))
}

func TestE2E_TUI_PaletteAndHelp(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()

	app := newTestApp(url)
	tm := teatest.NewTestModel(t, app, teatest.WithInitialTermSize(140, 40))
	t.Cleanup(func() { _ = tm.Quit() })

	waitForOutput(t, tm, func(s string) bool { return strings.Contains(s, "SESSIONS") },
		3*time.Second)

	tm.Send(tea.KeyPressMsg{Code: '?', Text: "?"})
	waitForOutput(t, tm, func(s string) bool {
		return strings.Contains(s, "Keybindings")
	}, 2*time.Second)

	tm.Send(tea.KeyPressMsg{Code: tea.KeyEscape})
	time.Sleep(80 * time.Millisecond)

	tm.Send(tea.KeyPressMsg{Code: '/', Text: "/"})
	waitForOutput(t, tm, func(s string) bool {
		return strings.Contains(s, "Commands") && strings.Contains(s, "filter:")
	}, 2*time.Second)

	tm.Send(tea.KeyPressMsg{Code: tea.KeyEscape})
	tm.Send(tea.KeyPressMsg{Code: 'c', Mod: tea.ModCtrl})
	_, _ = io.ReadAll(tm.FinalOutput(t, teatest.WithFinalTimeout(3*time.Second)))
}
