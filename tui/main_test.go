// CLI integration tests for the export/import subcommands. Run the actual
// gact binary (built ad hoc) against a freshly-built emulator binary and
// verify the round trip via real HTTP.
package main

import (
	"bytes"
	"encoding/json"
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
)

func pickPort(t *testing.T) int {
	t.Helper()
	l, _ := net.Listen("tcp", "127.0.0.1:0")
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

func startEmulator(t *testing.T) (string, func()) {
	t.Helper()
	tmp := t.TempDir()
	bin := filepath.Join(tmp, "emulator-server")
	_, file, _, _ := runtime.Caller(0)
	repoRoot := filepath.Join(filepath.Dir(file), "..")
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
				_ = cmd.Process.Signal(os.Interrupt)
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
	tmp := t.TempDir()
	bin := filepath.Join(tmp, "gact")
	cmd := exec.Command("go", "build", "-o", bin, ".")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build gact: %v\n%s", err, out)
	}
	return bin
}

// runGact runs the gact binary with the given args and env, returns
// stdout, stderr, and exit code.
func runGact(t *testing.T, bin string, env map[string]string, args ...string) (string, string, int) {
	t.Helper()
	cmd := exec.Command(bin, args...)
	cmd.Env = append(os.Environ())
	for k, v := range env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	err := cmd.Run()
	exit := 0
	if ee, ok := err.(*exec.ExitError); ok {
		exit = ee.ExitCode()
	} else if err != nil {
		t.Fatalf("gact run: %v", err)
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
	var s struct{ ID string `json:"id"` }
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

// --- tests ----------------------------------------------------------------

func TestCLI_ExportToStdout(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "export demo")
	time.Sleep(200 * time.Millisecond) // let scenario produce messages

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "export", sid)
	if code != 0 {
		t.Fatalf("exit %d, stderr=%q", code, stderr)
	}
	var blob struct {
		Format   string         `json:"format"`
		Messages []any          `json:"messages"`
	}
	if err := json.Unmarshal([]byte(stdout), &blob); err != nil {
		t.Fatalf("decode: %v\nstdout: %s", err, stdout)
	}
	if blob.Format != "gact-v1" {
		t.Errorf("format = %q", blob.Format)
	}
	if len(blob.Messages) < 1 {
		t.Errorf("messages count = %d", len(blob.Messages))
	}
}

func TestCLI_ExportToFile_FlagAfterArg(t *testing.T) {
	// Verifies reorderFlagsFirst — `gact export SID -o file` should work
	// even though Go's flag package by default stops at the first positional.
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "flag-after demo")
	out := filepath.Join(t.TempDir(), "blob.json")

	_, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "export", sid, "-o", out)
	if code != 0 {
		t.Fatalf("exit %d, stderr=%q", code, stderr)
	}
	b, err := os.ReadFile(out)
	if err != nil {
		t.Fatalf("read out file: %v", err)
	}
	if !strings.Contains(string(b), `"gact-v1"`) {
		t.Errorf("output file missing format marker: %s", string(b)[:100])
	}
}

func TestCLI_ImportRoundTrip(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "round-trip")
	out := filepath.Join(t.TempDir(), "blob.json")
	_, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "export", "-o", out, sid)
	if code != 0 {
		t.Fatalf("export failed")
	}

	// Import should print the new session ID on stdout.
	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "import", out)
	if code != 0 {
		t.Fatalf("import: exit %d stderr=%q", code, stderr)
	}
	newID := strings.TrimSpace(stdout)
	if !strings.HasPrefix(newID, "sess_") {
		t.Errorf("expected new session ID on stdout, got %q", stdout)
	}
	if newID == sid {
		t.Errorf("imported ID equals source — should be a fresh session")
	}
}

func TestCLI_ImportFromStdin(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "stdin demo")
	out := filepath.Join(t.TempDir(), "blob.json")
	runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "export", "-o", out, sid)

	// Pipe the file as stdin.
	cmd := exec.Command(bin, "import", "-")
	cmd.Env = append(os.Environ(), "GACT_BACKEND="+url)
	f, _ := os.Open(out)
	cmd.Stdin = f
	defer f.Close()
	got, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("import stdin: %v output=%s", err, got)
	}
	if !bytes.Contains(got, []byte("sess_")) {
		t.Errorf("expected new session ID, got %q", got)
	}
}

func TestCLI_ImportRejectsMalformed(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	bad := filepath.Join(t.TempDir(), "bad.json")
	_ = os.WriteFile(bad, []byte(`{"not": "an export blob"}`), 0o644)

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "import", bad)
	if code == 0 {
		t.Errorf("expected non-zero exit for malformed input, got 0; stdout=%q", stdout)
	}
	if !strings.Contains(stderr, "format") {
		t.Errorf("stderr should mention missing format, got %q", stderr)
	}
}

func TestCLI_HelpFlag(t *testing.T) {
	bin := buildGact(t)
	stdout, _, code := runGact(t, bin, nil, "--help")
	if code != 0 {
		t.Errorf("exit %d", code)
	}
	if !strings.Contains(stdout, "gact export") {
		t.Errorf("help missing export usage: %s", stdout)
	}
}

func TestCLI_ExportMissingSession(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	_, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "export", "sess_nope")
	if code == 0 {
		t.Errorf("expected non-zero exit for missing session")
	}
	if !strings.Contains(stderr, "404") && !strings.Contains(stderr, "not found") {
		t.Errorf("stderr should mention 404 or not found, got %q", stderr)
	}
}

// Sanity import for unused linter happy.
var _ = io.Discard
