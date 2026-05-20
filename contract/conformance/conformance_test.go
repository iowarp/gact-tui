package conformance

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// TestConformance_AgainstEmulator runs the full suite against a freshly
// built emulator-server binary. If the suite passes against the canonical
// reference implementation, adapters can be judged by the same yardstick.
//
// This test skips (rather than fails) when the emulator binary isn't
// findable — a fresh checkout on CI may not have run `go build` yet,
// and we don't want the conformance module to hard-depend on the
// emulator via go.mod (keeping the module small is the whole point).
func TestConformance_AgainstEmulator(t *testing.T) {
	bin := findEmulatorBinary(t)
	if bin == "" {
		t.Skip("emulator-server binary not found; run `go build -o emulator/emulator-server ./emulator/cmd/emulator-server` first")
	}

	port, err := freePort()
	if err != nil {
		t.Fatalf("find free port: %v", err)
	}
	url := fmt.Sprintf("http://127.0.0.1:%d", port)

	cmd := exec.Command(bin, "--port", fmt.Sprint(port), "--timing", "fast")
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		t.Fatalf("start emulator: %v", err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	})

	// Wait for /v1/health to come up. Keeps the test resilient to slow
	// CI machines where the binary takes a beat to bind its port.
	if err := waitHealthy(url, 5*time.Second); err != nil {
		t.Fatalf("emulator never became healthy: %v", err)
	}

	Run(FromTest(t), url, Options{})
}

// findEmulatorBinary resolves the emulator-server path. Checks common
// locations first; if absent, builds it on the fly so CI doesn't need
// a prerequisite step. Returns "" only if both lookup AND build fail.
func findEmulatorBinary(t *testing.T) string {
	t.Helper()
	candidates := []string{
		testBinaryPath("../../emulator", "emulator-server"),
		testBinaryPath("emulator", "emulator-server"),
	}
	for _, p := range candidates {
		if abs, err := filepath.Abs(p); err == nil {
			if st, err := os.Stat(abs); err == nil && !st.IsDir() && st.Mode()&0111 != 0 {
				return abs
			}
		}
	}

	// Try to locate the emulator source and build a one-shot binary
	// into a temp dir. Keeps the test self-contained on CI without
	// requiring a pre-build step in the workflow.
	srcDir, err := filepath.Abs("../../emulator")
	if err != nil {
		return ""
	}
	if _, err := os.Stat(filepath.Join(srcDir, "go.mod")); err != nil {
		return ""
	}
	out := testBinaryPath(t.TempDir(), "emulator-server")
	cmd := exec.Command("go", "build", "-o", out, "./cmd/emulator-server")
	cmd.Dir = srcDir
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		t.Logf("on-the-fly emulator build failed: %v", err)
		return ""
	}
	return out
}

func testBinaryPath(dir, name string) string {
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return filepath.Join(dir, name)
}

func freePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

func waitHealthy(baseURL string, budget time.Duration) error {
	deadline := time.Now().Add(budget)
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+"/v1/health", nil)
		resp, err := http.DefaultClient.Do(req)
		cancel()
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				return nil
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	return fmt.Errorf("never became healthy within %s", budget)
}

// TestConformance_OptionsSkip verifies the skip-flag plumbing — a
// backend that only wires /v1/health should still pass the suite when
// every other section is skipped.
func TestConformance_OptionsSkip(t *testing.T) {
	// Stand up a tiny hand-rolled server that only implements health.
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"healthy":true,"uptime_s":0}`))
	})
	mux.HandleFunc("/v1/", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"not implemented"}`, http.StatusNotImplemented)
	})
	srv := &http.Server{Addr: "127.0.0.1:0", Handler: mux}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() { _ = srv.Serve(ln) }()
	t.Cleanup(func() { _ = srv.Close() })

	Run(FromTest(t), "http://"+ln.Addr().String(), Options{
		SkipCapabilities:  true,
		SkipWorkspaces:    true,
		SkipSessions:      true,
		SkipCreateSession: true,
		SkipPostMessage:   true,
		SkipMessageList:   true,
		SkipSessionExport: true,
		SkipSSE:           true,
		SkipCommands:      true,
		SkipTools:         true,
		SkipMetrics:       true,
		SkipAgents:        true,
	})
}
