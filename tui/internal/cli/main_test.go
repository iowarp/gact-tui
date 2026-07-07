// Shared helpers for CLI integration tests. Command domains live in focused
// main_*_test.go files.
package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"
)

var (
	gactTestBinOnce sync.Once
	gactTestBinPath string
	gactTestBinErr  error
	gactTestBinOut  []byte
)

func pickPort(t *testing.T) int {
	t.Helper()
	l, _ := net.Listen("tcp", "127.0.0.1:0")
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

func testBinaryPath(dir, name string) string {
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return filepath.Join(dir, name)
}

func stableTestBinaryPath(t *testing.T, repoRoot, name string) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	dir := filepath.Join(repoRoot, ".tools", "test-bin")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("create test bin dir: %v", err)
	}
	return filepath.Join(dir, name)
}

func stopTestProcess(p *os.Process) {
	if runtime.GOOS == "windows" {
		_ = p.Kill()
		return
	}
	_ = p.Signal(os.Interrupt)
}

func startEmulator(t *testing.T) (string, func()) {
	t.Helper()
	_, file, _, _ := runtime.Caller(0)
	repoRoot := filepath.Join(filepath.Dir(file), "..", "..", "..")
	bin := stableTestBinaryPath(t, repoRoot, "emulator-server-tui-main")
	build := exec.Command("go", "build", "-o", bin, "./emulator/cmd/emulator-server")
	build.Dir = repoRoot
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build emulator: %v\n%s", err, out)
	}
	port := pickPort(t)
	cmd := exec.Command(bin, "-port", fmt.Sprintf("%d", port), "-timing", "fast")
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		t.Fatalf("start emulator: %v", err)
	}
	url := fmt.Sprintf("http://127.0.0.1:%d", port)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := http.Get(url + "/v1/health")
		if err == nil && resp.StatusCode == 200 {
			resp.Body.Close()
			return url, func() {
				stopTestProcess(cmd.Process)
				_ = cmd.Wait()
			}
		}
		time.Sleep(40 * time.Millisecond)
	}
	_ = cmd.Process.Kill()
	t.Fatal("emulator did not become healthy in 3s")
	return "", nil
}

// buildGact compiles the gact binary into the test's temp dir.
func buildGact(t *testing.T) string {
	t.Helper()
	_, file, _, _ := runtime.Caller(0)
	repoRoot := filepath.Join(filepath.Dir(file), "..", "..", "..")
	gactTestBinOnce.Do(func() {
		gactTestBinPath = stableTestBinaryPath(t, repoRoot, "gact-tui-main")
		cmd := exec.Command("go", "build", "-o", gactTestBinPath, ".")
		cmd.Dir = filepath.Join(repoRoot, "tui")
		gactTestBinOut, gactTestBinErr = cmd.CombinedOutput()
	})
	if gactTestBinErr != nil {
		t.Fatalf("build gact: %v\n%s", gactTestBinErr, gactTestBinOut)
	}
	return gactTestBinPath
}

// runGact runs the gact binary with the given args and env, returns
// stdout, stderr, and exit code.
func runGact(t *testing.T, bin string, env map[string]string, args ...string) (string, string, int) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Env = os.Environ()
	for k, v := range env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		t.Fatalf("gact command timed out after 60s: %s %v\nstdout:\n%s\nstderr:\n%s", bin, args, out.String(), errBuf.String())
	}
	exit := 0
	if ee, ok := err.(*exec.ExitError); ok {
		exit = ee.ExitCode()
	} else if err != nil {
		t.Fatalf("gact run: %v", err)
	}
	return out.String(), errBuf.String(), exit
}

// runGactWithDuration runs gact for a bounded duration then sends
// SIGTERM. Used by streaming tests (`tail`/`stream`/`watch`) that
// would otherwise block forever waiting for events.
func runGactWithDuration(t *testing.T, bin string, env map[string]string, d time.Duration, args ...string) (string, string, int) {
	t.Helper()
	cmd := exec.Command(bin, args...)
	cmd.Env = os.Environ()
	for k, v := range env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	if err := cmd.Start(); err != nil {
		t.Fatalf("gact start: %v", err)
	}
	timer := time.AfterFunc(d, func() { stopTestProcess(cmd.Process) })
	err := cmd.Wait()
	timer.Stop()
	exit := 0
	if ee, ok := err.(*exec.ExitError); ok {
		exit = ee.ExitCode()
	}
	return out.String(), errBuf.String(), exit
}

// createSession seeds an emulator session with one user message. Returns the
// session id.
func createSession(t *testing.T, baseURL, title string) string {
	t.Helper()
	body := bytes.NewBufferString(fmt.Sprintf(
		`{"workspace_id":"ws_default","title":%q}`, title))
	resp, err := http.Post(baseURL+"/v1/sessions", "application/json", body)
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create session: status %d", resp.StatusCode)
	}
	var s struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&s)
	if s.ID == "" {
		t.Fatal("create session: no id in response")
	}
	// Add a user message so export has something interesting.
	msgBody := bytes.NewBufferString(`{"parts":[{"type":"text","text":"hello world"}]}`)
	mr, _ := http.Post(baseURL+"/v1/sessions/"+s.ID+"/messages", "application/json", msgBody)
	if mr != nil {
		mr.Body.Close()
	}
	return s.ID
}
