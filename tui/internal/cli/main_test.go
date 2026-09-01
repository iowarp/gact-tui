// Shared helpers for CLI integration tests. Command domains live in focused
// main_*_test.go files.
package cli

import (
	"bytes"
	"context"
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

// buildGact compiles the gact binary into the test's temp dir.
func buildGact(t *testing.T) string {
	t.Helper()
	_, file, _, _ := runtime.Caller(0)
	repoRoot := filepath.Join(filepath.Dir(file), "..", "..", "..")
	gactTestBinOnce.Do(func() {
		gactTestBinPath = stableTestBinaryPath(t, repoRoot, "gact-tui-main")
		revisionCmd := exec.Command("git", "rev-parse", "HEAD")
		revisionCmd.Dir = repoRoot
		revisionOut, revisionErr := revisionCmd.CombinedOutput()
		if revisionErr != nil {
			gactTestBinErr = revisionErr
			gactTestBinOut = revisionOut
			return
		}
		ldflags := "-X github.com/JaimeCernuda/gact-tui/tui/internal/version.BuildRevision=" +
			string(bytes.TrimSpace(revisionOut))
		cmd := exec.Command("go", "build", "-ldflags", ldflags, "-o", gactTestBinPath, ".")
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
