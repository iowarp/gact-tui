// CLI integration tests for the export/import subcommands. Run the actual
// gact binary (built ad hoc) against a freshly-built emulator binary and
// verify the round trip via real HTTP.
package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
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

func TestDiagClipboardProbeReportsNativeAndTerminalHints(t *testing.T) {
	t.Setenv("TERM", "xterm-256color")
	t.Setenv("TERM_PROGRAM", "UnitTerm")
	t.Setenv("COLORTERM", "truecolor")

	var out bytes.Buffer
	diagWriteClipboardProbe(&out)
	got := out.String()
	for _, want := range []string{
		"clipboard_native:",
		"clipboard_missing:",
		"clipboard_osc52:",
		"wl-copy",
		"xclip",
		"xsel",
		"clip.exe",
		"powershell.exe",
		"TERM=xterm-256color",
		"TERM_PROGRAM=UnitTerm",
		"COLORTERM=truecolor",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("diag clipboard probe missing %q:\n%s", want, got)
		}
	}
}

func startEmulator(t *testing.T) (string, func()) {
	t.Helper()
	_, file, _, _ := runtime.Caller(0)
	repoRoot := filepath.Join(filepath.Dir(file), "..")
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
	tmp := t.TempDir()
	bin := testBinaryPath(tmp, "gact")
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
	cmd.Env = os.Environ()
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

// --- tests ----------------------------------------------------------------

func TestCLI_VersionReportsBuildMetadata(t *testing.T) {
	bin := buildGact(t)
	headCmd := exec.Command("git", "rev-parse", "--short=12", "HEAD")
	headOut, err := headCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git rev-parse: %v\n%s", err, headOut)
	}
	head := strings.TrimSpace(string(headOut))

	stdout, stderr, code := runGact(t, bin, nil, "version")
	if code != 0 {
		t.Fatalf("version: exit %d, stderr=%q", code, stderr)
	}
	for _, want := range []string{
		"gact " + binaryVersion,
		"(contract " + contractVersion + ")",
		"revision: " + head,
		"go:",
	} {
		if !strings.Contains(stdout, want) {
			t.Fatalf("version output missing %q:\n%s", want, stdout)
		}
	}
}

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
		Format   string `json:"format"`
		Messages []any  `json:"messages"`
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

// TestCLI_Ping covers X2: exit 0 against a live emulator, exit 1
// against an unreachable backend.
func TestCLI_Ping(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	// Live backend → exit 0.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "ping")
	if code != 0 {
		t.Fatalf("ping live: exit %d, stdout=%q", code, stdout)
	}
	if !strings.Contains(stdout, "ok:") {
		t.Errorf("ping ok output missing: %q", stdout)
	}

	// Unreachable backend → exit 1.
	_, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": "http://127.0.0.1:1"}, "ping")
	if code != 1 {
		t.Errorf("ping unreachable: exit %d, want 1", code)
	}

	// LLLL1: --json emits a single-line JSON object on success +
	// failure (with error key on the unreachable case).
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "ping", "--json")
	if code != 0 {
		t.Fatalf("ping --json live: exit %d, stdout=%q", code, stdout)
	}
	var ok struct {
		OK      bool   `json:"ok"`
		Backend string `json:"backend"`
		UptimeS int    `json:"uptime_s"`
	}
	if err := json.Unmarshal([]byte(stdout), &ok); err != nil {
		t.Fatalf("ping --json parse: %v (raw=%q)", err, stdout)
	}
	if !ok.OK || ok.Backend != url {
		t.Errorf("expected ok=true, backend=%s; got %+v", url, ok)
	}
	stdout, _, code = runGact(t, bin,
		map[string]string{"GACT_BACKEND": "http://127.0.0.1:1"}, "ping", "--json")
	if code != 1 {
		t.Errorf("ping --json unreachable: exit %d, want 1", code)
	}
	var bad struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal([]byte(stdout), &bad); err != nil {
		t.Fatalf("ping --json fail parse: %v (raw=%q)", err, stdout)
	}
	if bad.OK || bad.Error == "" {
		t.Errorf("expected ok=false + non-empty error; got %+v", bad)
	}
}

// TestCLI_Diff covers SS1: trigger a diff scenario, list it
// (pending), apply it, list again (applied).
func TestCLI_Diff(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "diff-target")

	// Send "propose an edit" to trigger a file_diff in the scenario.
	_, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "propose an edit to main.go")
	if code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	if _, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait: exit %d", code)
	}

	stdout, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"diff", "list", sid)
	if !strings.Contains(stdout, "pending") {
		t.Fatalf("expected pending diff in list: %q", stdout)
	}

	if _, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"diff", "apply", sid); code != 0 {
		t.Fatalf("apply: exit %d", code)
	}

	stdout, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"diff", "list", sid)
	if !strings.Contains(stdout, "applied") {
		t.Errorf("expected applied diff after apply: %q", stdout)
	}
}

// TestCLI_ListFilters covers FFF1: --limit truncates, --status idle
// keeps everything (all sessions start idle), --status running drops
// everything, and an unknown --status returns exit 2.
func TestCLI_ListFilters(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	// Two fresh sessions so we can exercise --limit 1.
	_ = createSession(t, url, "list-filter-1")
	_ = createSession(t, url, "list-filter-2")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	if code != 0 {
		t.Fatalf("list: exit %d", code)
	}
	totalRows := strings.Count(strings.TrimSpace(stdout), "\n") + 1
	if totalRows < 2 {
		t.Fatalf("expected ≥2 sessions, got %d", totalRows)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"list", "--limit", "1")
	if code != 0 {
		t.Fatalf("list --limit: exit %d", code)
	}
	if got := strings.Count(strings.TrimSpace(stdout), "\n") + 1; got != 1 {
		t.Errorf("--limit 1: expected 1 row, got %d (%q)", got, stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"list", "--status", "idle")
	if code != 0 {
		t.Fatalf("list --status idle: exit %d", code)
	}
	idleRows := strings.Count(strings.TrimSpace(stdout), "\n") + 1
	if idleRows < 2 {
		t.Errorf("--status idle: expected ≥2 rows, got %d", idleRows)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"list", "--status", "running")
	if code != 0 {
		t.Fatalf("list --status running: exit %d", code)
	}
	if strings.TrimSpace(stdout) != "" {
		t.Errorf("--status running: expected empty (no running sessions), got %q", stdout)
	}

	if _, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"list", "--status", "bogus"); code != 2 {
		t.Errorf("list --status bogus: expected exit 2, got %d", code)
	}
}

// FFFFFFFFF1: `gact list` gains --detached-only + --sort that
// mirror dashboard (YYYYYYYY1 + KKKKKKKK1).
func TestCLI_ListDetachedOnlyAndSort(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	// 3 sessions with intentional delay so UpdatedAt is monotonic.
	_ = createSession(t, url, "list-old")
	time.Sleep(120 * time.Millisecond)
	_ = createSession(t, url, "list-mid")
	time.Sleep(120 * time.Millisecond)
	newestSid := createSession(t, url, "list-new")

	// --sort oldest flips backend default-newest-first to oldest-first.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"list", "--sort", "oldest")
	if code != 0 {
		t.Fatalf("list --sort oldest: exit %d", code)
	}
	iOld := strings.Index(stdout, "list-old")
	iNew := strings.Index(stdout, "list-new")
	if iOld < 0 || iNew < 0 {
		t.Fatalf("missing rows: %q", stdout)
	}
	if iOld >= iNew {
		t.Errorf("--sort oldest: older should come first; old@%d new@%d", iOld, iNew)
	}

	// --sort bogus fails fast.
	_, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"list", "--sort", "bogus")
	if code != 2 {
		t.Errorf("--sort bogus: exit %d, want 2", code)
	}
	if !strings.Contains(stderr, "unknown --sort") {
		t.Errorf("stderr: %q", stderr)
	}

	// --detached-only filters by local registry. Seed it with just
	// the newest sid, expect --detached-only output to be that one
	// row only.
	dir := t.TempDir()
	regPath := filepath.Join(dir, "detached.json")
	body := fmt.Sprintf(
		`{"records":[{"session_id":%q,"title":"list-new","backend":%q,"detached_at":"2026-04-20T08:00:00Z"}]}`,
		newestSid, url,
	)
	if err := os.WriteFile(regPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	stdout, _, code = runGact(t, bin, map[string]string{
		"GACT_BACKEND":       url,
		"GACT_DETACHED_PATH": regPath,
	}, "list", "--detached-only")
	if code != 0 {
		t.Fatalf("list --detached-only: exit %d", code)
	}
	if !strings.Contains(stdout, "list-new") {
		t.Errorf("--detached-only should keep the registered sid: %q", stdout)
	}
	for _, other := range []string{"list-old", "list-mid"} {
		if strings.Contains(stdout, other) {
			t.Errorf("--detached-only should drop non-registered %q: %q", other, stdout)
		}
	}
}

// TestCLI_McpResourceRead covers EEE1: read the seeded MCP resource
// at file:///docs/welcome.md and assert "demo content" lands on
// stdout.
func TestCLI_McpResourceRead(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "resource-read", "mcp_fake", "file:///docs/welcome.md")
	if code != 0 {
		t.Fatalf("mcp resource-read: exit %d", code)
	}
	if !strings.Contains(stdout, "demo content") {
		t.Errorf("expected 'demo content' in output: %q", stdout)
	}
}

// TestCLI_McpList covers JJJJ1: `gact mcp list` enumerates connected
// MCP servers; emulator's `default` scenario seeds one fake-mcp.
// Asserts both TSV header + row, and JSON encodes the seeded id.
func TestCLI_McpList(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "list")
	if code != 0 {
		t.Fatalf("mcp list: exit %d", code)
	}
	for _, want := range []string{
		"id\tname\tstatus\ttransport\tprotocol\tcaps\tlast_error",
		"mcp_fake\tfake-mcp\tready\t",
	} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in TSV: %q", want, stdout)
		}
	}
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "list", "--format", "json")
	if code != 0 {
		t.Fatalf("mcp list json: exit %d", code)
	}
	if !strings.Contains(stdout, `"id": "mcp_fake"`) {
		t.Errorf("expected mcp_fake id in json: %q", stdout)
	}
	// Unknown format: exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "list", "--format", "yaml"); code != 2 {
		t.Errorf("mcp list --format yaml: want exit 2, got %d", code)
	}
}

// TestCLI_Plugins covers MMM8: drop a manifest into a temp plugins
// dir, list it, verify the rendered output and JSON shape.
func TestCLI_Plugins(t *testing.T) {
	bin := buildGact(t) // doesn't talk to a backend

	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "git-pr"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	manifest := `{
		"name": "git-pr",
		"version": "0.1",
		"description": "Open PRs from the shell",
		"commands": [
			{"id": "/pr", "title": "Open PR", "command": "/bin/true"}
		]
	}`
	if err := os.WriteFile(filepath.Join(dir, "git-pr", "plugin.json"),
		[]byte(manifest), 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}

	stdout, _, code := runGact(t, bin, nil, "plugins", "list", "--dir", dir)
	if code != 0 {
		t.Fatalf("plugins list: exit %d", code)
	}
	for _, want := range []string{"git-pr", "0.1", "/pr", "Open PR"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in text output: %q", want, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, nil, "plugins", "list", "--dir", dir, "--format", "json")
	if code != 0 {
		t.Fatalf("plugins list json: exit %d", code)
	}
	if !strings.Contains(stdout, `"name": "git-pr"`) ||
		!strings.Contains(stdout, `"id": "/pr"`) {
		t.Errorf("expected JSON with name+id: %q", stdout)
	}

	// `plugins dir` prints the resolved root.
	stdout, _, code = runGact(t, bin, nil, "plugins", "dir", "--dir", dir)
	if code != 0 || strings.TrimSpace(stdout) != dir {
		t.Errorf("plugins dir: code=%d out=%q want %q", code, strings.TrimSpace(stdout), dir)
	}
}

// TestCLI_ThemeShow covers GGGG1: `gact theme show` prints the active
// palette as TSV. Resolution honors --name and GACT_THEME. Pure local
// — no emulator.
func TestCLI_ThemeShow(t *testing.T) {
	bin := buildGact(t)
	// Default: env override wins.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_THEME": "dracula"},
		"theme", "show")
	if code != 0 {
		t.Fatalf("theme show: exit %d", code)
	}
	if !strings.Contains(stdout, "name\tdracula") {
		t.Errorf("expected name\\tdracula row, got: %q", stdout)
	}
	for _, k := range []string{"bg\t#", "fg\t#", "primary\t#", "role_user\t#"} {
		if !strings.Contains(stdout, k) {
			t.Errorf("expected row prefix %q, got: %q", k, stdout)
		}
	}
	// --name flag overrides env.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_THEME": "dracula"},
		"theme", "show", "--name", "light")
	if code != 0 {
		t.Fatalf("theme show --name light: exit %d", code)
	}
	if !strings.Contains(stdout, "name\tlight") {
		t.Errorf("expected --name to override env, got: %q", stdout)
	}
	// Unknown verb is a usage error.
	if _, _, code := runGact(t, bin, nil, "theme", "wat"); code != 2 {
		t.Errorf("theme wat: want exit 2, got %d", code)
	}
}

// TestCLI_ThemeList covers HHHH1: `gact theme list` enumerates the
// known palettes and marks the resolved active one with `\t*`.
func TestCLI_ThemeList(t *testing.T) {
	bin := buildGact(t)
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_THEME": "nord"},
		"theme", "list")
	if code != 0 {
		t.Fatalf("theme list: exit %d", code)
	}
	for _, name := range []string{"dark", "light", "dracula", "nord", "tokyo-night"} {
		if !strings.Contains(stdout, name) {
			t.Errorf("expected %q in output, got: %q", name, stdout)
		}
	}
	// Active marker must be on the resolved theme line.
	if !strings.Contains(stdout, "nord\t*") {
		t.Errorf("expected 'nord\\t*' active marker, got: %q", stdout)
	}
	// And only one star total.
	if got := strings.Count(stdout, "*"); got != 1 {
		t.Errorf("expected exactly one '*' marker, got %d in: %q", got, stdout)
	}
	// Extra args → usage error.
	if _, _, code := runGact(t, bin, nil, "theme", "list", "extra"); code != 2 {
		t.Errorf("theme list extra: want exit 2, got %d", code)
	}
}

// TestCLI_ThemeSet covers IIII1: `gact theme set <name>` writes the
// chosen theme to config.json; unknown names exit 2 without touching
// the file. Uses a per-test XDG_CONFIG_HOME so we don't smear into
// the real user config.
func TestCLI_ThemeSet(t *testing.T) {
	bin := buildGact(t)
	tmp := t.TempDir()
	env := map[string]string{"XDG_CONFIG_HOME": tmp}

	// Happy path: write nord.
	stdout, _, code := runGact(t, bin, env, "theme", "set", "nord")
	if code != 0 {
		t.Fatalf("theme set nord: exit %d", code)
	}
	if !strings.Contains(stdout, "theme=nord saved to") {
		t.Errorf("expected save confirmation, got: %q", stdout)
	}
	cfgPath := tmp + "/gact/config.json"
	body, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	if !strings.Contains(string(body), `"theme": "nord"`) {
		t.Errorf("expected theme=nord in config, got: %s", body)
	}
	// theme list should now mark nord as active when reading from
	// the same XDG dir.
	stdout, _, code = runGact(t, bin, env, "theme", "list")
	if code != 0 {
		t.Fatalf("theme list: exit %d", code)
	}
	if !strings.Contains(stdout, "nord\t*") {
		t.Errorf("expected list to mark nord active, got: %q", stdout)
	}
	// Unknown theme: exit 2, file unchanged.
	bodyBefore, _ := os.ReadFile(cfgPath)
	if _, _, code := runGact(t, bin, env, "theme", "set", "nonsense"); code != 2 {
		t.Errorf("theme set nonsense: want exit 2, got %d", code)
	}
	bodyAfter, _ := os.ReadFile(cfgPath)
	if string(bodyBefore) != string(bodyAfter) {
		t.Errorf("config mutated on rejected theme: before=%q after=%q",
			bodyBefore, bodyAfter)
	}
	// Wrong arity: exit 2.
	if _, _, code := runGact(t, bin, env, "theme", "set"); code != 2 {
		t.Errorf("theme set (no arg): want exit 2, got %d", code)
	}
}

// TestCLI_TasksSummary covers FFFF1: aggregate task counts across
// sessions. Seeds two sessions with mixed-status tasks, asserts the
// summary table contains both rows + a TOTAL footer with correct
// aggregates.
func TestCLI_TasksSummary(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid1 := createSession(t, url, "summary-A")
	sid2 := createSession(t, url, "summary-B")

	addTask := func(sid, title string) string {
		stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"tasks", "add", sid, title)
		if code != 0 {
			t.Fatalf("tasks add: exit %d", code)
		}
		return strings.TrimSpace(stdout)
	}
	setStatus := func(tid, status string) {
		if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"tasks", "set", tid, "--status", status); code != 0 {
			t.Fatalf("tasks set: exit %d", code)
		}
	}
	addTask(sid1, "A pending")
	t1b := addTask(sid1, "A completed")
	setStatus(t1b, "completed")
	addTask(sid2, "B pending")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "summary")
	if code != 0 {
		t.Fatalf("tasks summary: exit %d", code)
	}
	// Both sids should appear; TOTAL row must show 2 pending + 1
	// completed (this run owns those tasks; emulator clears between
	// startEmulator calls so no other tests' tasks leak in).
	if !strings.Contains(stdout, sid1) || !strings.Contains(stdout, sid2) {
		t.Errorf("expected both sids in summary: %q", stdout)
	}
	if !strings.Contains(stdout, "TOTAL\t(2 sessions)\t2\t0\t1\t0") {
		t.Errorf("expected TOTAL row aggregating 2 sessions / 2P / 0R / 1C / 0F: %q", stdout)
	}
}

// TestCLI_TasksListStatusFilter covers WWWW1: --status filters
// tasks to one or a comma-separated list of statuses. Unknown
// values exit 2 without listing.
func TestCLI_TasksListStatusFilter(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid := createSession(t, url, "tasks-status-target")
	add := func(title string) string {
		stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"tasks", "add", sid, title)
		if code != 0 {
			t.Fatalf("tasks add %s: exit %d", title, code)
		}
		return strings.TrimSpace(stdout)
	}
	tP := add("pending one")
	tR := add("running one")
	tC := add("completed one")
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "set", tR, "--status", "running"); code != 0 {
		t.Fatalf("set running: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "set", tC, "--status", "completed"); code != 0 {
		t.Fatalf("set completed: exit %d", code)
	}

	// Single-status filter.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "list", sid, "--status", "pending")
	if code != 0 {
		t.Fatalf("tasks list --status pending: exit %d", code)
	}
	if !strings.Contains(stdout, tP) || strings.Contains(stdout, tR) || strings.Contains(stdout, tC) {
		t.Errorf("expected only pending row %s, got: %q", tP, stdout)
	}

	// Comma-list filter.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "list", sid, "--status", "pending,completed")
	if code != 0 {
		t.Fatalf("tasks list --status pending,completed: exit %d", code)
	}
	if !strings.Contains(stdout, tP) || !strings.Contains(stdout, tC) {
		t.Errorf("expected pending+completed in: %q", stdout)
	}
	if strings.Contains(stdout, tR) {
		t.Errorf("running %s should be filtered out: %q", tR, stdout)
	}

	// JSON mode + filter still emits an array shape.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "list", sid, "--status", "running", "--format", "json")
	if code != 0 {
		t.Fatalf("tasks list --status running --format json: exit %d", code)
	}
	var items []struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal([]byte(stdout), &items); err != nil {
		t.Fatalf("json parse: %v\n  raw=%q", err, stdout)
	}
	if len(items) != 1 || items[0].Status != "running" || items[0].ID != tR {
		t.Errorf("expected exactly 1 running task with id=%s, got: %+v", tR, items)
	}

	// Unknown status → exit 2 without listing.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "list", sid, "--status", "nonsense"); code != 2 {
		t.Errorf("tasks list --status nonsense: want exit 2, got %d", code)
	}
}

// TestCLI_Tasks covers MMM5: full session-task lifecycle via CLI.
func TestCLI_Tasks(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "tasks-target")

	// Add — should print a tsk_ id.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "add", sid, "Run unit tests")
	if code != 0 {
		t.Fatalf("tasks add: exit %d", code)
	}
	tid := strings.TrimSpace(stdout)
	if !strings.HasPrefix(tid, "tsk_") {
		t.Fatalf("expected tsk_ id, got %q", stdout)
	}

	// List — must show pending status + the title.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "list", sid)
	if code != 0 || !strings.Contains(stdout, tid) ||
		!strings.Contains(stdout, "pending") || !strings.Contains(stdout, "Run unit tests") {
		t.Fatalf("tasks list missing fields: code=%d out=%q", code, stdout)
	}

	// Set status to running — list should reflect it.
	if _, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "set", tid, "--status", "running"); code != 0 {
		t.Fatalf("tasks set: exit %d", code)
	}
	stdout, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "list", sid)
	if !strings.Contains(stdout, "running") {
		t.Errorf("expected running status after set: %q", stdout)
	}

	// Rm — list should be empty.
	if _, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "rm", tid); code != 0 {
		t.Fatalf("tasks rm: exit %d", code)
	}
	stdout, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "list", sid)
	if strings.TrimSpace(stdout) != "" {
		t.Errorf("expected empty list after rm: %q", stdout)
	}
}

// TestCLI_Rewind covers MMM7: send 3 turns, wait for each idle,
// rewind to msg 1, assert msgs after it are gone.
func TestCLI_Rewind(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "rewind-target")

	send := func(text string) string {
		stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"send", sid, text)
		if code != 0 {
			t.Fatalf("send %q: exit %d", text, code)
		}
		mid := strings.TrimSpace(stdout)
		// Wait for the scenario to finish before sending the next
		// message — otherwise rewind can race the scenario engine
		// updating a part on a now-deleted message (pre-existing
		// emulator quirk; not the rewind handler's bug).
		if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"wait", "--timeout", "30s", sid); code != 0 {
			t.Fatalf("wait after %q: exit %d", text, code)
		}
		return mid
	}
	m1 := send("first")
	_ = send("second")
	_ = send("third")

	// Rewind to m1: deletes everything newer (the second + third
	// user msgs and their assistant turns). Default keeps m1 itself.
	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"rewind", sid, m1)
	if code != 0 {
		t.Fatalf("rewind: exit %d (stderr=%q)", code, stderr)
	}
	if !strings.Contains(stderr, "deleted") {
		t.Errorf("expected 'deleted N' summary on stderr: %q", stderr)
	}
	if strings.TrimSpace(stdout) == "" {
		t.Errorf("expected at least one deleted mid on stdout")
	}

	// log must still contain m1 but NOT "second" / "third".
	logOut, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid)
	if !strings.Contains(logOut, "first") {
		t.Errorf("expected first user msg to remain: %q", logOut)
	}
	if strings.Contains(logOut, "second") || strings.Contains(logOut, "third") {
		t.Errorf("rewind didn't drop later messages: %q", logOut)
	}

	// --include-target removes m1 too.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"rewind", sid, m1, "--include-target"); code != 0 {
		t.Fatalf("rewind --include-target: exit %d", code)
	}
	logOut, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid)
	if strings.Contains(logOut, "first") {
		t.Errorf("--include-target should drop m1 too: %q", logOut)
	}
}

// TestCLI_LogJSON covers MMMM1: `gact log --format json` emits one
// message per line as NDJSON; each line parses to a Message-shaped
// object. Default text mode unchanged.
func TestCLI_LogJSON(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid := createSession(t, url, "log-json-target")
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "ping body"); code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait: exit %d", code)
	}

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid, "--format", "json", "--limit", "20")
	if code != 0 {
		t.Fatalf("log --format json: exit %d", code)
	}
	lines := strings.Split(strings.TrimRight(stdout, "\n"), "\n")
	if len(lines) < 2 {
		t.Fatalf("expected ≥2 NDJSON lines (user + assistant), got %d: %q", len(lines), stdout)
	}
	type msg struct {
		ID        string `json:"id"`
		SessionID string `json:"session_id"`
		Role      string `json:"role"`
		Parts     []any  `json:"parts"`
	}
	rolesSeen := map[string]bool{}
	for i, line := range lines {
		if line == "" {
			continue
		}
		var m msg
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			t.Fatalf("line %d not valid JSON: %v\n  raw=%q", i, err, line)
		}
		if m.ID == "" || m.SessionID != sid || m.Role == "" {
			t.Errorf("line %d malformed: %+v (raw=%q)", i, m, line)
		}
		rolesSeen[m.Role] = true
	}
	if !rolesSeen["user"] || !rolesSeen["assistant"] {
		t.Errorf("expected both user and assistant roles, got %v", rolesSeen)
	}

	// Unknown format → exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid, "--format", "yaml"); code != 2 {
		t.Errorf("log --format yaml: want exit 2, got %d", code)
	}
}

// TestCLI_PermsRulesListTSV covers KKKK1: --format tsv on `perms
// rules list` produces a human-scannable table; default stays JSON
// for back-compat.
func TestCLI_PermsRulesListTSV(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	dir := t.TempDir()
	policyFile := filepath.Join(dir, "policy.json")
	body := `{"policies":[
		{"scope":"workspace","tool_name_pattern":"shell","action":"ask"},
		{"scope":"workspace","scope_id":"ws_main","tool_name_pattern":"fs.write","path_pattern":"/tmp/*","action":"allow","annotations_filter":{"safe":true}}
	]}`
	if err := os.WriteFile(policyFile, []byte(body), 0o644); err != nil {
		t.Fatalf("write policy: %v", err)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "rules", "set", policyFile); code != 0 {
		t.Fatalf("perms rules set: exit %d", code)
	}

	// TSV mode.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "rules", "list", "--format", "tsv")
	if code != 0 {
		t.Fatalf("perms rules list --format tsv: exit %d", code)
	}
	for _, want := range []string{
		"scope\tscope_id\ttool_pattern\tpath_pattern\taction\tannotations",
		"workspace\t*\tshell\t-\task\t-",
		"workspace\tws_main\tfs.write\t/tmp/*\tallow\tsafe=true",
	} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected TSV row %q in: %q", want, stdout)
		}
	}

	// Default mode stays JSON (back-compat).
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "rules", "list")
	if code != 0 {
		t.Fatalf("perms rules list (default): exit %d", code)
	}
	if !strings.Contains(stdout, `"policies"`) {
		t.Errorf("expected default JSON shape, got: %q", stdout)
	}

	// Unknown format → exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "rules", "list", "--format", "yaml"); code != 2 {
		t.Errorf("--format yaml: want exit 2, got %d", code)
	}
}

// TestCLI_PermsRules covers MMM4: install a policy via the CLI,
// trigger a permission-requesting scenario, verify the request
// auto-resolves with the policy's action (no manual allow/deny).
func TestCLI_PermsRules(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	dir := t.TempDir()
	policyFile := filepath.Join(dir, "policy.json")
	if err := os.WriteFile(policyFile,
		[]byte(`{"policies":[{"scope":"workspace","tool_name_pattern":"shell","action":"deny"}]}`),
		0o644); err != nil {
		t.Fatalf("write policy: %v", err)
	}

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "rules", "set", policyFile); code != 0 {
		t.Fatalf("perms rules set: exit %d", code)
	}
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "rules", "list")
	if code != 0 || !strings.Contains(stdout, `"shell"`) ||
		!strings.Contains(stdout, `"deny"`) {
		t.Fatalf("perms rules list missing fields: code=%d out=%q", code, stdout)
	}

	// Trigger a permission scenario.
	sid := createSession(t, url, "rules-target")
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "delete the temp dir"); code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	// Wait for the scenario's permission step to fire + auto-resolve.
	deadline := time.Now().Add(3 * time.Second)
	var permsOut string
	for time.Now().Before(deadline) {
		permsOut, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"perms", "list", sid)
		if strings.Contains(permsOut, "resolved") && strings.Contains(permsOut, "deny") {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !strings.Contains(permsOut, "resolved") || !strings.Contains(permsOut, "deny") {
		t.Errorf("expected auto-resolved/deny permission, got %q", permsOut)
	}

	// Clear and verify the list is empty (and the next scenario would
	// stay pending — not exercised here to keep the test fast).
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "rules", "clear"); code != 0 {
		t.Fatalf("perms rules clear: exit %d", code)
	}
	stdout, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "rules", "list")
	if !strings.Contains(stdout, `"policies": []`) && !strings.Contains(stdout, `"policies": null`) {
		t.Errorf("expected empty policies after clear, got %q", stdout)
	}
}

// TestCLI_HooksListFilter covers XXXX1: --event filters by hook
// event type and --scope by scope kind (global|session|workspace).
// Seeds hooks in all three scopes so each filter has something to
// keep + drop.
func TestCLI_HooksListFilter(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid := createSession(t, url, "hooks-filter-target")
	add := func(args ...string) string {
		stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			append([]string{"hooks", "add", "--command", "/bin/true"}, args...)...)
		if code != 0 {
			t.Fatalf("hooks add %v: exit %d", args, code)
		}
		return strings.TrimSpace(stdout)
	}
	hGlobal := add("--event", "*")
	hSess := add("--event", "tool.call.completed", "--session", sid)
	hWS := add("--event", "session.status_changed", "--workspace", "ws_default")

	// --event "*" keeps only global one.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "list", "--event", "*")
	if code != 0 {
		t.Fatalf("--event *: exit %d", code)
	}
	if !strings.Contains(stdout, hGlobal) {
		t.Errorf("expected global hook %s in --event * output: %q", hGlobal, stdout)
	}
	if strings.Contains(stdout, hSess) || strings.Contains(stdout, hWS) {
		t.Errorf("--event * leaked non-* hooks: %q", stdout)
	}

	// --scope session keeps only the session-scoped one.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "list", "--scope", "session")
	if code != 0 {
		t.Fatalf("--scope session: exit %d", code)
	}
	if !strings.Contains(stdout, hSess) {
		t.Errorf("expected session-scoped hook %s in: %q", hSess, stdout)
	}
	if strings.Contains(stdout, hGlobal) || strings.Contains(stdout, hWS) {
		t.Errorf("--scope session leaked others: %q", stdout)
	}

	// --scope workspace keeps only the workspace-scoped one.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "list", "--scope", "workspace")
	if code != 0 {
		t.Fatalf("--scope workspace: exit %d", code)
	}
	if !strings.Contains(stdout, hWS) {
		t.Errorf("expected workspace-scoped hook %s in: %q", hWS, stdout)
	}
	if strings.Contains(stdout, hGlobal) || strings.Contains(stdout, hSess) {
		t.Errorf("--scope workspace leaked others: %q", stdout)
	}

	// Combined filter: --event * --scope global keeps global hook.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "list", "--event", "*", "--scope", "global")
	if code != 0 {
		t.Fatalf("combined filter: exit %d", code)
	}
	if !strings.Contains(stdout, hGlobal) {
		t.Errorf("combined filter dropped global hook: %q", stdout)
	}

	// Unknown --scope → exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "list", "--scope", "nope"); code != 2 {
		t.Errorf("--scope nope: want exit 2, got %d", code)
	}
}

// TestCLI_Hooks covers MMM3: register a hook, trigger an event,
// verify the hook script captured the event JSON, then delete it.
func TestCLI_Hooks(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	dir := t.TempDir()
	captured := filepath.Join(dir, "hook-fired.json")
	hookCommand := filepath.Join(dir, "hook.sh")
	if runtime.GOOS == "windows" {
		src := filepath.Join(dir, "hook.go")
		if err := os.WriteFile(src, []byte(fmt.Sprintf(`package main

import (
	"io"
	"os"
)

func main() {
	body, err := io.ReadAll(os.Stdin)
	if err != nil {
		os.Exit(1)
	}
	if err := os.WriteFile(%q, body, 0o644); err != nil {
		os.Exit(1)
	}
}
`, captured)), 0o644); err != nil {
			t.Fatalf("write hook helper source: %v", err)
		}
		hookCommand = testBinaryPath(dir, "hook")
		build := exec.Command("go", "build", "-o", hookCommand, src)
		if out, err := build.CombinedOutput(); err != nil {
			t.Fatalf("build hook helper: %v\n%s", err, out)
		}
	} else if err := os.WriteFile(hookCommand,
		[]byte("#!/bin/sh\ncat > "+captured+"\n"), 0o755); err != nil {
		t.Fatalf("write hook script: %v", err)
	}

	// Register a hook on the `notification` event firing the script.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "add", "--event", "notification", "--command", hookCommand)
	if code != 0 {
		t.Fatalf("hooks add: exit %d", code)
	}
	hid := strings.TrimSpace(stdout)
	if !strings.HasPrefix(hid, "hk_") {
		t.Fatalf("hooks add returned bad id %q", stdout)
	}

	// Listing must show the hook with our script as the target.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "list")
	if code != 0 || !strings.Contains(stdout, hid) || !strings.Contains(stdout, hookCommand) {
		t.Fatalf("hooks list missing entry: code=%d out=%q", code, stdout)
	}

	// Trigger a notification by reconnecting an MCP server (MMM1
	// emits one). The dispatcher fires asynchronously — give it a
	// moment to write the file.
	if _, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "reconnect", "mcp_fake"); code != 0 {
		t.Fatalf("mcp reconnect: exit %d", code)
	}
	deadline := time.Now().Add(3 * time.Second)
	var body []byte
	for time.Now().Before(deadline) {
		// Both checks: file must exist AND have non-empty body. The
		// hook script writes via `cat > file`, so file appears empty
		// briefly before the content lands. Polling Stat alone races.
		if b, err := os.ReadFile(captured); err == nil && len(b) > 0 {
			body = b
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if len(body) == 0 {
		t.Fatalf("hook never fired (no body within deadline)")
	}
	if !strings.Contains(string(body), `"notification"`) ||
		!strings.Contains(string(body), "MCP server reconnected") {
		t.Errorf("hook body missing expected fields: %s", body)
	}

	// Cleanup: rm the hook, list must drop to zero rows.
	if _, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "rm", hid); code != 0 {
		t.Fatalf("hooks rm: exit %d", code)
	}
	stdout, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "list")
	if strings.TrimSpace(stdout) != "" {
		t.Errorf("hooks list after rm: expected empty, got %q", stdout)
	}
}

// TestCLI_Grep covers WWW1: seed two sessions with a unique token
// + assert both hits surface in the cross-session search.
func TestCLI_Grep(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid1 := createSession(t, url, "grep-target-1")
	sid2 := createSession(t, url, "grep-target-2")
	for _, sid := range []string{sid1, sid2} {
		if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"send", sid, "the marker token is xyzzy_grep_999"); code != 0 {
			t.Fatalf("send: exit %d", code)
		}
	}

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"grep", "xyzzy_grep_999")
	if code != 0 {
		t.Fatalf("grep: exit %d", code)
	}
	for _, want := range []string{sid1, sid2, "xyzzy_grep_999"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in grep output: %q", want, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"grep", "xyzzy_grep_999", "--format", "json")
	if code != 0 {
		t.Fatalf("grep json: exit %d", code)
	}
	if !strings.Contains(stdout, `"sid"`) || !strings.Contains(stdout, `"snippet"`) {
		t.Errorf("expected JSON shape: %q", stdout)
	}
}

// TestCLI_GrepLimit covers VVVV1: --limit caps the output. Seeds 4
// sessions with the same marker so we have 4+ hits, asserts 0
// (default) returns ≥4 rows and --limit 2 returns exactly 2.
func TestCLI_GrepLimit(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	const N = 4
	const marker = "xyzzy_grep_limit_777"
	for i := 0; i < N; i++ {
		sid := createSession(t, url, fmt.Sprintf("grep-limit-%d", i))
		if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"send", sid, "the marker is "+marker); code != 0 {
			t.Fatalf("send %d: exit %d", i, code)
		}
	}

	// No limit → ≥N rows.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"grep", marker)
	if code != 0 {
		t.Fatalf("grep no limit: exit %d", code)
	}
	rows := strings.Count(strings.TrimSpace(stdout), "\n") + 1
	if rows < N {
		t.Errorf("expected ≥%d rows without limit, got %d: %q", N, rows, stdout)
	}

	// --limit 2 → exactly 2 rows.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"grep", marker, "--limit", "2")
	if code != 0 {
		t.Fatalf("grep --limit 2: exit %d", code)
	}
	rows = strings.Count(strings.TrimSpace(stdout), "\n") + 1
	if rows != 2 {
		t.Errorf("expected exactly 2 rows with --limit 2, got %d: %q", rows, stdout)
	}

	// Negative --limit → exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"grep", marker, "--limit", "-1"); code != 2 {
		t.Errorf("grep --limit -1: want exit 2, got %d", code)
	}
}

// DDDDDDDDD1: `gact grep --role` narrows hits to one or more roles.
// Mirrors VVVVVVVV1/WWWWWWWW1 on log+follow.
func TestCLI_GrepRoleFilter(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid := createSession(t, url, "grep-role-target")
	// Send "read main.go please" — produces user + assistant + tool +
	// assistant. The marker "please" appears only in the user turn.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "read main.go please"); code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait: exit %d", code)
	}

	// --role user keeps the user hit (contains "please").
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"grep", "please", "--role", "user")
	if code != 0 {
		t.Fatalf("grep --role user: exit %d", code)
	}
	if !strings.Contains(stdout, "user\t") && !strings.Contains(stdout, "\tuser\t") {
		t.Errorf("expected a user row: %q", stdout)
	}
	if strings.Contains(stdout, "\tassistant\t") || strings.Contains(stdout, "\ttool\t") {
		t.Errorf("--role user shouldn't keep other roles: %q", stdout)
	}

	// --role assistant → assistant turn doesn't contain "please" so
	// the result is empty (0 rows, exit 0).
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"grep", "please", "--role", "assistant")
	if code != 0 {
		t.Fatalf("grep --role assistant: exit %d", code)
	}
	if strings.TrimSpace(stdout) != "" {
		t.Errorf("--role assistant should yield empty output: %q", stdout)
	}

	// Unknown role → exit 2.
	_, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"grep", "please", "--role", "bogus")
	if code == 0 {
		t.Fatal("expected non-zero exit for unknown --role")
	}
	if !strings.Contains(stderr, "unknown --role") {
		t.Errorf("stderr should mention 'unknown --role': %q", stderr)
	}
}

// TestCLI_DashboardWatch covers BBBB1: --watch refreshes the table
// in place. Run for 2.5s with --interval 1s, expect ≥2 ANSI clear
// sequences in the output (initial + at least one refresh).
func TestCLI_DashboardWatch(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	_ = createSession(t, url, "watch-row")

	stdout, _, _ := runGactWithDuration(t, bin,
		map[string]string{"GACT_BACKEND": url},
		2500*time.Millisecond,
		"dashboard", "--watch", "--interval", "1s")
	clearCount := strings.Count(stdout, "\x1b[2J")
	if clearCount < 2 {
		t.Errorf("expected ≥2 clear-screen frames, got %d (%q)", clearCount, stdout)
	}
	if !strings.Contains(stdout, "watch-row") {
		t.Errorf("expected seeded session in watch output: %q", stdout)
	}
	if !strings.Contains(stdout, "Ctrl+C to exit") {
		t.Errorf("expected watch banner: %q", stdout)
	}
}

// TestCLI_DashboardStatusFilter covers YYYY1: --status filters
// dashboard rows by status (single value or comma-separated set).
// Seeds two sessions, fires a long-running scenario on one to make
// it briefly running, asserts the filter keeps only matching rows.
// Unknown status → exit 2.
func TestCLI_DashboardStatusFilter(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	idleSid := createSession(t, url, "dash-status-idle")
	waitingSid := createSession(t, url, "dash-status-waiting")
	// Trigger the permission scenario on waitingSid; the `delete`
	// keyword routes to a script that pauses on permission.requested,
	// which leaves the session in `waiting` status until we allow/deny.
	// `waiting` is observable on the emulator's fast timing (vs
	// `running` which can flit by sub-frame).
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", waitingSid, "delete the temp dir"); code != 0 {
		t.Fatalf("send delete: exit %d", code)
	}
	// Poll until waitingSid is actually waiting before asserting.
	deadline := time.Now().Add(5 * time.Second)
	var stdout string
	var code int
	for time.Now().Before(deadline) {
		stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"dashboard", "--format", "tsv", "--status", "waiting")
		if code == 0 && strings.Contains(stdout, waitingSid) {
			break
		}
		time.Sleep(150 * time.Millisecond)
	}
	if code != 0 {
		t.Fatalf("dashboard --status waiting: exit %d", code)
	}
	if !strings.Contains(stdout, waitingSid) {
		t.Fatalf("expected waiting sid %s in --status waiting within deadline, got: %q", waitingSid, stdout)
	}
	if strings.Contains(stdout, idleSid) {
		t.Errorf("idle sid %s leaked into --status waiting: %q", idleSid, stdout)
	}

	// Resolve the pending permission so waitingSid completes; needed
	// before --status idle assertion.
	plist, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "list", waitingSid)
	for _, line := range strings.Split(plist, "\n") {
		fields := strings.Split(line, "\t")
		if len(fields) > 0 && strings.HasPrefix(fields[0], "perm_") {
			_, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
				"perms", "deny", fields[0])
			break
		}
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", waitingSid); code != 0 {
		t.Fatalf("wait waitingSid idle: exit %d", code)
	}

	// --status idle: both should appear now.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dashboard", "--format", "tsv", "--status", "idle")
	if code != 0 {
		t.Fatalf("dashboard --status idle: exit %d", code)
	}
	if !strings.Contains(stdout, idleSid) || !strings.Contains(stdout, waitingSid) {
		t.Errorf("expected both sids idle, got: %q", stdout)
	}

	// Comma-list filter still works (idle,error).
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dashboard", "--format", "tsv", "--status", "idle,error")
	if code != 0 {
		t.Fatalf("dashboard --status idle,error: exit %d", code)
	}
	if !strings.Contains(stdout, idleSid) {
		t.Errorf("expected idle sid in comma-list filter: %q", stdout)
	}

	// Unknown --status → exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dashboard", "--status", "nonsense"); code != 2 {
		t.Errorf("dashboard --status nonsense: want exit 2, got %d", code)
	}
}

// TestCLI_Dashboard covers VVV1: pretty + tsv + json modes all
// surface session rows with the key columns.
func TestCLI_Dashboard(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	_ = createSession(t, url, "dash-row-1")
	_ = createSession(t, url, "dash-row-2")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "dashboard")
	if code != 0 {
		t.Fatalf("dashboard: exit %d", code)
	}
	for _, want := range []string{"ID", "STATUS", "MODEL", "COST", "dash-row-1", "dash-row-2"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in pretty output: %q", want, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dashboard", "--format", "tsv")
	if code != 0 {
		t.Fatalf("dashboard tsv: exit %d", code)
	}
	if !strings.Contains(stdout, "ID\tSTATUS\tTITLE") {
		t.Errorf("expected TSV header: %q", stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dashboard", "--format", "json")
	if code != 0 {
		t.Fatalf("dashboard json: exit %d", code)
	}
	if !strings.Contains(stdout, `"id"`) || !strings.Contains(stdout, `"cost_usd"`) {
		t.Errorf("expected JSON fields: %q", stdout)
	}
}

// KKKKKKKK1: `gact dashboard --sort` reorders rows. Default
// "newest" puts the most-recently-updated row at the top;
// "oldest" flips it. An unknown sort key errors out fast
// instead of silently rendering undefined order.
func TestCLI_DashboardSort(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	// Create in order: older → middle → newer, with sleep between
	// so UpdatedAt is monotonically increasing.
	_ = createSession(t, url, "dash-older")
	time.Sleep(150 * time.Millisecond)
	_ = createSession(t, url, "dash-middle")
	time.Sleep(150 * time.Millisecond)
	_ = createSession(t, url, "dash-newer")

	// Default = newest first.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "dashboard")
	if code != 0 {
		t.Fatalf("dashboard default: exit %d", code)
	}
	iNewer := strings.Index(stdout, "dash-newer")
	iOlder := strings.Index(stdout, "dash-older")
	if iNewer < 0 || iOlder < 0 {
		t.Fatalf("both rows should appear: %q", stdout)
	}
	if iNewer >= iOlder {
		t.Errorf("default sort should put newest first: newer@%d older@%d in %q",
			iNewer, iOlder, stdout)
	}

	// --sort oldest flips it.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dashboard", "--sort", "oldest")
	if code != 0 {
		t.Fatalf("dashboard --sort oldest: exit %d", code)
	}
	iNewer = strings.Index(stdout, "dash-newer")
	iOlder = strings.Index(stdout, "dash-older")
	if iOlder >= iNewer {
		t.Errorf("--sort oldest should put oldest first: older@%d newer@%d in %q",
			iOlder, iNewer, stdout)
	}

	// Unknown sort fails fast with a helpful error.
	_, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dashboard", "--sort", "bogus")
	if code == 0 {
		t.Fatal("expected non-zero exit for unknown --sort")
	}
	if !strings.Contains(stderr, "unknown sort") {
		t.Errorf("stderr should mention 'unknown sort': %q", stderr)
	}
}

// TestCLI_LogSince covers TTT1: send two messages with a sleep
// between, --since 50ms keeps only the latest, --since 1h keeps
// both.
// VVVVVVVV1: `gact log --role` drops messages whose role isn't in
// the keep-set. Accepts comma-separated list; an unknown role
// errors fast instead of silently empty-logging.
func TestCLI_LogRoleFilter(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "log-role-target")

	// Send a "read main.go" turn — produces user + thinking
	// assistant + tool + final assistant messages, so the role
	// mix includes user, assistant, and tool.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "read main.go please"); code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait: exit %d", code)
	}

	// --role user → only the user row.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid, "--role", "user")
	if code != 0 {
		t.Fatalf("log --role user: exit %d", code)
	}
	if !strings.Contains(stdout, "[USER @") {
		t.Errorf("expected [USER @ ...] row: %q", stdout)
	}
	if strings.Contains(stdout, "[ASSISTANT @") || strings.Contains(stdout, "[TOOL @") {
		t.Errorf("user filter should drop non-user rows: %q", stdout)
	}

	// --role assistant,tool → keeps both, drops user.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid, "--role", "assistant,tool")
	if code != 0 {
		t.Fatalf("log --role assistant,tool: exit %d", code)
	}
	if strings.Contains(stdout, "[USER @") {
		t.Errorf("assistant,tool filter should drop user: %q", stdout)
	}
	if !strings.Contains(stdout, "[ASSISTANT @") {
		t.Errorf("assistant,tool filter should keep assistant: %q", stdout)
	}

	// Unknown role → exit 2 with a helpful error.
	_, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid, "--role", "bogus")
	if code == 0 {
		t.Fatal("expected non-zero exit for unknown --role")
	}
	if !strings.Contains(stderr, "unknown --role") {
		t.Errorf("stderr should mention 'unknown --role': %q", stderr)
	}
}

// BBBBBBBBB1: `gact log --grep` drops messages whose flattened text
// doesn't match the regex. Case-insensitive by default.
func TestCLI_LogGrepFilter(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "log-grep-target")

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "read main.go please"); code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait: exit %d", code)
	}

	// All messages — should include user + assistant + tool turns.
	stdoutAll, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid)
	allRows := strings.Count(stdoutAll, "[USER @") +
		strings.Count(stdoutAll, "[ASSISTANT @") +
		strings.Count(stdoutAll, "[TOOL @")
	if allRows < 3 {
		t.Fatalf("expected ≥3 rows before filter, got %d: %q", allRows, stdoutAll)
	}

	// Grep for a string only the tool_result carries (the file
	// content contains "println" — case-insensitive).
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid, "--grep", "PRINTLN")
	if code != 0 {
		t.Fatalf("--grep PRINTLN: exit %d", code)
	}
	// At least one row survives; the user's "read main.go please"
	// doesn't contain "println" so it shouldn't match.
	if strings.Contains(stdout, "read main.go please") {
		t.Errorf("--grep PRINTLN shouldn't keep the USER row: %q", stdout)
	}
	if !strings.Contains(strings.ToLower(stdout), "println") {
		t.Errorf("--grep PRINTLN should have kept rows with println: %q", stdout)
	}

	// Unmatched pattern → empty output, no error.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid, "--grep", "zzznomatch")
	if code != 0 {
		t.Fatalf("--grep zzznomatch should still exit 0, got %d", code)
	}
	if strings.Contains(stdout, "[USER @") || strings.Contains(stdout, "[ASSISTANT @") {
		t.Errorf("unmatched pattern should yield empty rows: %q", stdout)
	}

	// Bad regex → exit 2 with helpful error.
	_, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid, "--grep", "[")
	if code == 0 {
		t.Fatal("expected non-zero exit for malformed regex")
	}
	if !strings.Contains(stderr, "bad --grep pattern") {
		t.Errorf("stderr should mention 'bad --grep pattern': %q", stderr)
	}
}

func TestCLI_LogSince(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "log-since-target")

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "AAA"); code != 0 {
		t.Fatalf("send AAA: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait AAA: exit %d", code)
	}
	// Sleep long enough that AAA's user msg falls outside a moderate
	// --since window even under slow-CI/parallel-test load. Window
	// math: if we sleep 5s and use --since 4s, AAA is ≥5s old (out)
	// while BBB has a generous 4s grace period to be queried before
	// it ages out (well above the worst-case wait+log RTT we've seen).
	time.Sleep(5 * time.Second)
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "BBB"); code != 0 {
		t.Fatalf("send BBB: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait BBB: exit %d", code)
	}

	// Wide window keeps both.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid, "--since", "1h", "--limit", "50")
	if code != 0 {
		t.Fatalf("log --since 1h: exit %d", code)
	}
	if !strings.Contains(stdout, "AAA") || !strings.Contains(stdout, "BBB") {
		t.Errorf("--since 1h should keep both: %q", stdout)
	}

	// Narrow window keeps only BBB (AAA was sent ≥5s ago).
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid, "--since", "4s", "--limit", "50")
	if code != 0 {
		t.Fatalf("log --since 4s: exit %d", code)
	}
	if strings.Contains(stdout, "AAA") {
		t.Errorf("--since 4s should drop AAA: %q", stdout)
	}
	if !strings.Contains(stdout, "BBB") {
		t.Errorf("--since 4s should keep BBB: %q", stdout)
	}
}

// TestCLI_Conformance covers SSS1: run the conformance suite against
// a freshly-started emulator and assert exit 0 + every section
// reports PASS in stderr.
func TestCLI_Conformance(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"conformance")
	if code != 0 {
		t.Fatalf("conformance: exit %d (stderr=%q stdout=%q)", code, stderr, stdout)
	}
	if !strings.Contains(stderr, "PASS") {
		t.Errorf("expected PASS in stderr, got %q", stderr)
	}
	// Every major section should appear in the output. Mcp is BBBBB1
	// (gated on capabilities.mcp), Providers is TTTTT1 (gated on
	// capabilities.providers), Files is UUUUU1 (gated on
	// capabilities.files), Diffs is BBBBBB1, Messages_Diffs is
	// CCCCCC1 (both gated on capabilities.diffs); the emulator
	// advertises all four caps.
	for _, want := range []string{"Health", "Capabilities", "Sessions_Create", "Tools_List", "Mcp", "Providers", "Files", "Diffs", "Messages_Diffs", "Agents"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected section %q in stdout: %q", want, stdout)
		}
	}
}

// TestCLI_TailFilter covers RRR1: --filter narrows the event stream
// to the named types. Asserts notification is included and
// server.connected is excluded when filter targets only "notification".
func TestCLI_TailFilter(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	// Background tail with filter; wait for it to attach, fire an
	// event, then stop tail and inspect output.
	tailDone := make(chan string, 1)
	go func() {
		stdout, _, _ := runGactWithDuration(t, bin,
			map[string]string{"GACT_BACKEND": url},
			2*time.Second,
			"tail", "--workspace", "ws_default", "--filter", "notification")
		tailDone <- stdout
	}()
	time.Sleep(400 * time.Millisecond) // SSE connect
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "reconnect", "mcp_fake"); code != 0 {
		t.Fatalf("reconnect: exit %d", code)
	}
	out := <-tailDone
	if !strings.Contains(out, `"notification"`) {
		t.Errorf("expected notification kept by filter: %q", out)
	}
	if strings.Contains(out, `"type":"server.connected"`) {
		t.Errorf("server.connected should have been filtered out: %q", out)
	}
}

// TestCLI_StreamFilter covers UUUU1: --filter on `gact stream`
// drops events whose type isn't in the keep set. Triggers a
// notification via mcp reconnect, asserts the human row appears
// while filtered-out types do not.
func TestCLI_StreamFilter(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	streamDone := make(chan string, 1)
	go func() {
		stdout, _, _ := runGactWithDuration(t, bin,
			map[string]string{"GACT_BACKEND": url},
			2*time.Second,
			"stream", "--workspace", "ws_default", "--filter", "notification")
		streamDone <- stdout
	}()
	time.Sleep(400 * time.Millisecond)
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "reconnect", "mcp_fake"); code != 0 {
		t.Fatalf("reconnect: exit %d", code)
	}
	out := <-streamDone
	if !strings.Contains(out, "notification") {
		t.Errorf("expected notification kept by filter: %q", out)
	}
	if strings.Contains(out, "server.connected") {
		t.Errorf("server.connected should have been filtered out: %q", out)
	}
}

// TestCLI_Bench covers QQQ1 + XXX1: serial run (concurrent=1) and
// parallel run (--concurrent 3 -n 2 = 6 samples), asserts summary
// fields appear and bench sessions are cleaned up.
func TestCLI_Bench(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	preList, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	preCount := strings.Count(preList, "\n")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"bench", "-n", "2", "--message", "hi")
	if code != 0 {
		t.Fatalf("bench: exit %d", code)
	}
	for _, want := range []string{"p50:", "p90:", "p99:", "n=2", "samples:  2"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in serial bench output: %q", want, stdout)
		}
	}
	if strings.Contains(stdout, "thrpt:") {
		t.Errorf("thrpt should be hidden when concurrent=1: %q", stdout)
	}

	// XXX1: --concurrent 3, -n 2 → 6 samples + thrpt line.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"bench", "-n", "2", "--concurrent", "3", "--message", "hi")
	if code != 0 {
		t.Fatalf("bench --concurrent: exit %d", code)
	}
	for _, want := range []string{"concurrent=3", "samples:  6", "thrpt:"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in concurrent bench output: %q", want, stdout)
		}
	}

	// Bench sessions must be deleted — list count back to baseline.
	postList, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	postCount := strings.Count(postList, "\n")
	if postCount != preCount {
		t.Errorf("bench leaked sessions: pre=%d post=%d", preCount, postCount)
	}
}

// TestCLI_Voice covers PPP1: feed an audio file to gact voice,
// verify the transcribed text comes back non-empty.
func TestCLI_Voice(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "voice-target")

	// Drop a non-empty file (content doesn't matter — emulator
	// returns canned text regardless of input).
	dir := t.TempDir()
	audio := filepath.Join(dir, "clip.wav")
	if err := os.WriteFile(audio, []byte("not real wav data"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"voice", sid, audio)
	if code != 0 {
		t.Fatalf("voice: exit %d", code)
	}
	if strings.TrimSpace(stdout) == "" {
		t.Errorf("voice: expected non-empty transcription, got %q", stdout)
	}

	// Empty file → exit 2.
	empty := filepath.Join(dir, "empty.wav")
	if err := os.WriteFile(empty, []byte{}, 0o644); err != nil {
		t.Fatalf("write empty: %v", err)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"voice", sid, empty); code != 2 {
		t.Errorf("empty audio: expected exit 2, got %d", code)
	}
}

// TestCLI_DumpBundleSince covers EEEE1: --since narrows the bundle
// to recently-active sessions. Seeds two sessions with a sleep
// between, asserts --since 500ms keeps only the latest.
func TestCLI_DumpBundleSince(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	_ = createSession(t, url, "dump-since-old")
	time.Sleep(2 * time.Second)
	newSid := createSession(t, url, "dump-since-new")

	// Wide window: includes both.
	dirAll := t.TempDir()
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dump-bundle", "-o", dirAll, "--since", "1h"); code != 0 {
		t.Fatalf("dump-bundle --since 1h: exit %d", code)
	}
	allEntries, _ := os.ReadDir(filepath.Join(dirAll, "sessions"))
	if len(allEntries) < 2 {
		t.Errorf("--since 1h should keep ≥2 sessions, got %d", len(allEntries))
	}

	// Narrow window: refresh `new` via rename so its UpdatedAt is
	// "now", then sleep a bit before the second touch + bundle call.
	// Window math: sleep 5s + --since 6s guarantees the fresh
	// session lands inside even if the dump-bundle subprocess takes
	// the worst-case ~1s to spin up under parallel-test load (the
	// previous 1s window was the source of a full-suite flake).
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"rename", newSid, "dump-since-new-touched"); code != 0 {
		t.Fatalf("rename to refresh UpdatedAt: exit %d", code)
	}
	time.Sleep(5 * time.Second)
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"rename", newSid, "dump-since-new-touched-2"); code != 0 {
		t.Fatalf("rename 2: exit %d", code)
	}
	dirNew := t.TempDir()
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dump-bundle", "-o", dirNew, "--since", "6s"); code != 0 {
		t.Fatalf("dump-bundle --since 6s: exit %d", code)
	}
	newEntries, _ := os.ReadDir(filepath.Join(dirNew, "sessions"))
	foundNew := false
	for _, e := range newEntries {
		if strings.HasPrefix(e.Name(), newSid) {
			foundNew = true
		}
	}
	if !foundNew {
		t.Errorf("--since 6s should include the fresh session %s, got %v",
			newSid, dirEntryNames(newEntries))
	}
	if len(newEntries) >= len(allEntries) {
		t.Errorf("--since 6s (got %d) should be narrower than 1h (got %d)",
			len(newEntries), len(allEntries))
	}
}

func dirEntryNames(es []os.DirEntry) []string {
	out := make([]string, len(es))
	for i, e := range es {
		out[i] = e.Name()
	}
	return out
}

// TestCLI_Env covers DDDD1: prints resolved config + GACT_* env
// vars. Pure local — no backend needed.
func TestCLI_Env(t *testing.T) {
	bin := buildGact(t)
	stdout, _, code := runGact(t, bin, map[string]string{
		"GACT_BACKEND": "http://example:9999",
		"GACT_THEME":   "dracula",
	}, "env")
	if code != 0 {
		t.Fatalf("env: exit %d", code)
	}
	for _, want := range []string{
		"BACKEND_URL\thttp://example:9999",
		"THEME\tdracula",
		"CONFIG_PATH\t",
		"PLUGINS_DIR\t",
		"--- ENV ---",
		"GACT_BACKEND=http://example:9999",
		"GACT_THEME=dracula",
	} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in env output: %q", want, stdout)
		}
	}
}

// TestCLI_EnvJSON covers MMMMM1: --format json emits a single
// object with the resolved config + a nested env snapshot. Default
// tsv mode unchanged.
func TestCLI_EnvJSON(t *testing.T) {
	bin := buildGact(t)
	stdout, _, code := runGact(t, bin, map[string]string{
		"GACT_BACKEND": "http://example:9999",
		"GACT_THEME":   "dracula",
	}, "env", "--format", "json")
	if code != 0 {
		t.Fatalf("env --format json: exit %d", code)
	}
	var out struct {
		BackendURL string            `json:"backend_url"`
		Theme      string            `json:"theme"`
		ConfigPath string            `json:"config_path"`
		PluginsDir string            `json:"plugins_dir"`
		Env        map[string]string `json:"env"`
	}
	if err := json.Unmarshal([]byte(stdout), &out); err != nil {
		t.Fatalf("parse: %v\n  raw=%q", err, stdout)
	}
	if out.BackendURL != "http://example:9999" {
		t.Errorf("backend_url = %q, want http://example:9999", out.BackendURL)
	}
	if out.Theme != "dracula" {
		t.Errorf("theme = %q, want dracula", out.Theme)
	}
	if out.PluginsDir == "" {
		t.Errorf("plugins_dir should not be empty")
	}
	if out.Env["GACT_BACKEND"] != "http://example:9999" {
		t.Errorf("env.GACT_BACKEND = %q, want http://example:9999", out.Env["GACT_BACKEND"])
	}
	if out.Env["GACT_THEME"] != "dracula" {
		t.Errorf("env.GACT_THEME = %q, want dracula", out.Env["GACT_THEME"])
	}
	// Unknown format → exit 2.
	if _, _, code := runGact(t, bin, nil, "env", "--format", "yaml"); code != 2 {
		t.Errorf("env --format yaml: want exit 2, got %d", code)
	}
}

// TestCLI_Replay covers CCCC1: export a session, replay the file,
// assert the imported session has the same messages (re-IDed but
// content preserved).
func TestCLI_Replay(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	srcSid := createSession(t, url, "replay-source")
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", srcSid, "the marker token is REPLAY_MARKER_42"); code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", srcSid); code != 0 {
		t.Fatalf("wait: exit %d", code)
	}

	dir := t.TempDir()
	exportFile := filepath.Join(dir, "export.json")
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"export", srcSid, "-o", exportFile); code != 0 {
		t.Fatalf("export: exit %d", code)
	}

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"replay", exportFile)
	if code != 0 {
		t.Fatalf("replay: exit %d (stderr=%q)", code, stderr)
	}
	newSid := strings.TrimSpace(stdout)
	if !strings.HasPrefix(newSid, "sess_") {
		t.Fatalf("replay should print new sid, got %q", stdout)
	}
	if newSid == srcSid {
		t.Errorf("imported session should have a fresh id, got same as src: %q", newSid)
	}

	// Log of the imported session should contain the marker token.
	logOut, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", newSid, "--limit", "100")
	if !strings.Contains(logOut, "REPLAY_MARKER_42") {
		t.Errorf("imported log missing marker: %q", logOut)
	}
}

// TestCLI_Follow covers ZZZ1: send a first message, start follow in
// the background (with deadline), then send a second; assert the
// follow output contains BOTH the seeded and the streamed message.
func TestCLI_Follow(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "follow-target")

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "snapshot ALPHA"); code != 0 {
		t.Fatalf("send ALPHA: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait ALPHA: exit %d", code)
	}

	followDone := make(chan string, 1)
	go func() {
		stdout, _, _ := runGactWithDuration(t, bin,
			map[string]string{"GACT_BACKEND": url},
			5*time.Second,
			"follow", sid)
		followDone <- stdout
	}()
	time.Sleep(800 * time.Millisecond) // let snapshot + SSE attach
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "stream BRAVO"); code != 0 {
		t.Fatalf("send BRAVO: exit %d", code)
	}

	out := <-followDone
	if !strings.Contains(out, "snapshot ALPHA") {
		t.Errorf("follow should print existing log: %q", out)
	}
	if !strings.Contains(out, "stream BRAVO") {
		t.Errorf("follow should stream new message: %q", out)
	}
}

// TestCLI_ContextListFilters covers AAAAA1: --mode and --glob filters
// on `gact context list`. Seeds 3 entries (read/pin/edit; .go and
// .md), asserts each filter narrows correctly, combined filters AND
// together, and bad values exit 2 client-side.
func TestCLI_ContextListFilters(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid := createSession(t, url, "context-filters-target")
	for _, item := range []struct{ path, mode string }{
		{"/tmp/alpha.go", "read"},
		{"/tmp/bravo.md", "pin"},
		{"/tmp/charlie.go", "edit"},
	} {
		if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"context", "add", sid, item.path, "--mode", item.mode); code != 0 {
			t.Fatalf("context add %s: exit %d", item.path, code)
		}
	}

	// --mode pin → only bravo.md.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"context", "list", sid, "--mode", "pin")
	if code != 0 {
		t.Fatalf("--mode pin: exit %d", code)
	}
	if !strings.Contains(stdout, "/tmp/bravo.md") || strings.Contains(stdout, "/tmp/alpha.go") || strings.Contains(stdout, "/tmp/charlie.go") {
		t.Errorf("--mode pin filtering wrong: %q", stdout)
	}

	// --glob '*.go' → alpha + charlie, not bravo.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"context", "list", sid, "--glob", "*.go")
	if code != 0 {
		t.Fatalf("--glob *.go: exit %d", code)
	}
	if !strings.Contains(stdout, "/tmp/alpha.go") || !strings.Contains(stdout, "/tmp/charlie.go") {
		t.Errorf("expected both .go files in --glob: %q", stdout)
	}
	if strings.Contains(stdout, "/tmp/bravo.md") {
		t.Errorf("bravo.md should be filtered out: %q", stdout)
	}

	// Combined filter: --mode edit --glob *.go → only charlie.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"context", "list", sid, "--mode", "edit", "--glob", "*.go")
	if code != 0 {
		t.Fatalf("combined: exit %d", code)
	}
	if !strings.Contains(stdout, "/tmp/charlie.go") || strings.Contains(stdout, "/tmp/alpha.go") || strings.Contains(stdout, "/tmp/bravo.md") {
		t.Errorf("combined filter wrong: %q", stdout)
	}

	// Bad --mode + bad --glob → exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"context", "list", sid, "--mode", "nope"); code != 2 {
		t.Errorf("--mode nope: want exit 2, got %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"context", "list", sid, "--glob", "[bad"); code != 2 {
		t.Errorf("--glob [bad: want exit 2, got %d", code)
	}
}

// TestCLI_ContextListJSON covers PPPP1: `gact context list --format
// json` emits the raw ContextFile array. Default tsv unchanged.
func TestCLI_ContextListJSON(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid := createSession(t, url, "context-json-target")
	for _, item := range []struct{ path, mode string }{
		{"/tmp/alpha.go", "read"},
		{"/tmp/bravo.md", "pin"},
	} {
		if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"context", "add", sid, item.path, "--mode", item.mode); code != 0 {
			t.Fatalf("context add %s: exit %d", item.path, code)
		}
	}

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"context", "list", sid, "--format", "json")
	if code != 0 {
		t.Fatalf("context list --format json: exit %d", code)
	}
	var files []struct {
		Path string `json:"path"`
		Mode string `json:"mode"`
	}
	if err := json.Unmarshal([]byte(stdout), &files); err != nil {
		t.Fatalf("parse: %v\n  raw=%q", err, stdout)
	}
	if len(files) != 2 {
		t.Fatalf("expected 2 files, got %d: %+v", len(files), files)
	}
	got := map[string]string{files[0].Path: files[0].Mode, files[1].Path: files[1].Mode}
	if got["/tmp/alpha.go"] != "read" || got["/tmp/bravo.md"] != "pin" {
		t.Errorf("unexpected files: %+v", got)
	}

	// Default tsv still works.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"context", "list", sid)
	if code != 0 {
		t.Fatalf("context list (default): exit %d", code)
	}
	if !strings.Contains(stdout, "read\t/tmp/alpha.go") ||
		!strings.Contains(stdout, "pin\t/tmp/bravo.md") {
		t.Errorf("default tsv missing rows: %q", stdout)
	}

	// Unknown format → exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"context", "list", sid, "--format", "yaml"); code != 2 {
		t.Errorf("--format yaml: want exit 2, got %d", code)
	}
}

func TestCLI_ContextShowTextJSONAndBinarySummary(t *testing.T) {
	requested := map[string]int{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/v1/sessions/s1/context/files/content" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		path := r.URL.Query().Get("path")
		requested[path]++
		switch path {
		case "docs/readme.md":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"file": gact.ContextFileContent{
					Path:        "docs/readme.md",
					DisplayPath: "docs/readme.md",
					Size:        22,
					MediaType:   "text/markdown; charset=utf-8",
					Encoding:    "base64",
					Data:        base64.StdEncoding.EncodeToString([]byte("# Readme\n\nCLI preview\n")),
				},
			})
		case "plots/waveform.png":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"file": gact.ContextFileContent{
					Path:      "plots/waveform.png",
					Size:      8,
					MediaType: "image/png",
					Encoding:  "base64",
					Data:      base64.StdEncoding.EncodeToString([]byte("\x89PNG\r\n\x1a\n")),
				},
			})
		default:
			http.Error(w, `{"error":{"code":"not_found","message":"missing"}}`, http.StatusNotFound)
		}
	}))
	defer srv.Close()
	bin := buildGact(t)

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "show", "s1", "docs/readme.md")
	if code != 0 {
		t.Fatalf("context show text exit %d stderr=%s", code, stderr)
	}
	for _, want := range []string{"path: docs/readme.md", "media_type: text/markdown; charset=utf-8", "preview:", "# Readme", "CLI preview"} {
		if !strings.Contains(stdout, want) {
			t.Fatalf("context show text missing %q:\n%s", want, stdout)
		}
	}
	if strings.Contains(stdout, base64.StdEncoding.EncodeToString([]byte("# Readme\n\nCLI preview\n"))) {
		t.Fatalf("context show text should not print raw base64:\n%s", stdout)
	}

	stdout, stderr, code = runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "show", "s1", "docs/readme.md", "--format", "json")
	if code != 0 {
		t.Fatalf("context show json exit %d stderr=%s", code, stderr)
	}
	var content gact.ContextFileContent
	if err := json.Unmarshal([]byte(stdout), &content); err != nil {
		t.Fatalf("parse context show json: %v\nraw=%s", err, stdout)
	}
	if content.Path != "docs/readme.md" || content.Data == "" {
		t.Fatalf("unexpected context show json: %+v", content)
	}

	stdout, stderr, code = runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "show", "s1", "plots/waveform.png")
	if code != 0 {
		t.Fatalf("context show binary exit %d stderr=%s", code, stderr)
	}
	if !strings.Contains(stdout, "preview: binary content not rendered") {
		t.Fatalf("binary context show should summarize preview:\n%s", stdout)
	}
	if strings.Contains(stdout, "iVBOR") {
		t.Fatalf("binary context show should not dump base64:\n%s", stdout)
	}
	if requested["docs/readme.md"] != 2 || requested["plots/waveform.png"] != 1 {
		t.Fatalf("unexpected request counts: %#v", requested)
	}
}

func TestCLI_ContextShowSurfacesBackendError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":{"code":"not_found","message":"context file missing"}}`, http.StatusNotFound)
	}))
	defer srv.Close()
	bin := buildGact(t)

	_, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "show", "s1", "missing.txt")
	if code != 1 {
		t.Fatalf("context show missing exit = %d, want 1", code)
	}
	if !strings.Contains(stderr, "context file missing") {
		t.Fatalf("context show should surface backend error, stderr=%q", stderr)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "show", "s1", "missing.txt", "--format", "yaml"); code != 2 {
		t.Fatalf("context show bad format exit = %d, want 2", code)
	}
}

func TestCLI_ContextUploadPostsLocalFileAndPrintsContextRow(t *testing.T) {
	tmp := t.TempDir()
	localPath := filepath.Join(tmp, "report.txt")
	if err := os.WriteFile(localPath, []byte("hello attachment\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/sessions/s1/attachments" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode upload body: %v", err)
		}
		_ = json.NewEncoder(w).Encode(gact.ContextFile{
			Path:     ".clio/attachments/s1/report.txt",
			Mode:     "pin",
			Size:     17,
			Uploaded: true,
		})
	}))
	defer srv.Close()
	bin := buildGact(t)

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "upload", "s1", localPath, "--mode", "pin")
	if code != 0 {
		t.Fatalf("context upload exit %d stderr=%s", code, stderr)
	}
	if got["filename"] != "report.txt" || got["mode"] != "pin" || got["mime_type"] != "text/plain; charset=utf-8" {
		t.Fatalf("upload metadata = %#v", got)
	}
	if got["file"] != base64.StdEncoding.EncodeToString([]byte("hello attachment\n")) {
		t.Fatalf("upload file = %#v", got["file"])
	}
	if strings.TrimSpace(stdout) != "pin\t.clio/attachments/s1/report.txt" {
		t.Fatalf("context upload stdout = %q", stdout)
	}
}

func TestCLI_ContextUploadJSONAndFailures(t *testing.T) {
	tmp := t.TempDir()
	localPath := filepath.Join(tmp, "plot.bin")
	if err := os.WriteFile(localPath, []byte{0x00, 0x01, 0x02}, 0o644); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(gact.ContextFile{
			Path:     ".clio/attachments/s1/plot.bin",
			Mode:     "read",
			Size:     3,
			Uploaded: true,
		})
	}))
	defer srv.Close()
	bin := buildGact(t)

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "upload", "s1", localPath, "--format", "json")
	if code != 0 {
		t.Fatalf("context upload json exit %d stderr=%s", code, stderr)
	}
	var cf gact.ContextFile
	if err := json.Unmarshal([]byte(stdout), &cf); err != nil {
		t.Fatalf("parse upload json: %v\nraw=%s", err, stdout)
	}
	if !cf.Uploaded || cf.Path != ".clio/attachments/s1/plot.bin" {
		t.Fatalf("upload json = %+v", cf)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "upload", "s1", localPath, "--mode", "bad"); code != 2 {
		t.Fatalf("bad mode exit = %d, want 2", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "upload", "s1", localPath, "--format", "yaml"); code != 2 {
		t.Fatalf("bad format exit = %d, want 2", code)
	}
	if _, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": srv.URL},
		"context", "upload", "s1", filepath.Join(tmp, "missing.txt")); code != 1 || !strings.Contains(stderr, "no such file") {
		t.Fatalf("missing file code=%d stderr=%q", code, stderr)
	}

	rejectSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":{"code":"upload_failed","message":"attachment rejected"}}`, http.StatusBadRequest)
	}))
	defer rejectSrv.Close()
	if _, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": rejectSrv.URL},
		"context", "upload", "s1", localPath); code != 1 || !strings.Contains(stderr, "attachment rejected") {
		t.Fatalf("backend reject code=%d stderr=%q", code, stderr)
	}
}

// TestCLI_InfoIncludePerms covers NNNNN1: `gact info --include perms`
// fetches all permission requests for the session (pending +
// resolved). Triggers the emulator's `delete` permission scenario,
// asserts the pending row appears in both text and JSON modes,
// then resolves it and asserts the resolved row's action surfaces.
func TestCLI_InfoIncludePerms(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid := createSession(t, url, "info-perms-target")
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "delete the temp dir"); code != 0 {
		t.Fatalf("send delete: exit %d", code)
	}
	// Wait for the perm to materialize (status flips to waiting).
	deadline := time.Now().Add(3 * time.Second)
	var permID string
	for time.Now().Before(deadline) {
		stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"perms", "list", sid)
		if code == 0 {
			for _, line := range strings.Split(stdout, "\n") {
				fields := strings.Split(line, "\t")
				if len(fields) > 0 && strings.HasPrefix(fields[0], "perm_") {
					permID = fields[0]
					break
				}
			}
		}
		if permID != "" {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if permID == "" {
		t.Fatalf("permission never appeared")
	}

	// Text mode: pending row visible under '--- perms ---'.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", sid, "--include", "perms")
	if code != 0 {
		t.Fatalf("info --include perms: exit %d", code)
	}
	for _, want := range []string{"--- perms ---", "pending\t" + permID} {
		if !strings.Contains(stdout, want) {
			t.Errorf("text mode missing %q in: %q", want, stdout)
		}
	}

	// JSON mode: parse + assert perms array contains the pending row.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", sid, "--include", "perms", "--format", "json")
	if code != 0 {
		t.Fatalf("info --include perms --format json: exit %d", code)
	}
	var out struct {
		Session struct {
			ID string `json:"id"`
		} `json:"session"`
		Perms []struct {
			ID     string `json:"id"`
			Status string `json:"status"`
			Action string `json:"action,omitempty"`
		} `json:"perms"`
	}
	if err := json.Unmarshal([]byte(stdout), &out); err != nil {
		t.Fatalf("json parse: %v\n  raw=%q", err, stdout)
	}
	if out.Session.ID != sid {
		t.Errorf("session.id mismatch: %q vs %q", out.Session.ID, sid)
	}
	if len(out.Perms) != 1 || out.Perms[0].ID != permID || out.Perms[0].Status != "pending" {
		t.Errorf("expected 1 pending perm with id=%s, got: %+v", permID, out.Perms)
	}

	// Resolve the perm, then assert action shows on the resolved row.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "deny", permID); code != 0 {
		t.Fatalf("perms deny: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait idle: exit %d", code)
	}
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", sid, "--include", "perms")
	if code != 0 {
		t.Fatalf("info --include perms (post-resolve): exit %d", code)
	}
	if !strings.Contains(stdout, "resolved\t"+permID) {
		t.Errorf("expected resolved status row, got: %q", stdout)
	}
	if !strings.Contains(stdout, "action=deny") {
		t.Errorf("expected action=deny suffix, got: %q", stdout)
	}
}

// TestCLI_InfoInclude covers OOOO1: `gact info --include tasks,hooks`
// pulls extra sections in both text and JSON modes. Seeds two tasks
// (one set to completed) + a session-scoped hook, asserts both
// appear in the composite output and JSON wrapping is correct.
func TestCLI_InfoInclude(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid := createSession(t, url, "info-include-target")
	add := func(verb string, args ...string) string {
		stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			append([]string{verb}, args...)...)
		if code != 0 {
			t.Fatalf("%s: exit %d", verb, code)
		}
		return strings.TrimSpace(stdout)
	}
	t1 := add("tasks", "add", sid, "do thing 1")
	t2 := add("tasks", "add", sid, "do thing 2")
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "set", t2, "--status", "completed"); code != 0 {
		t.Fatalf("tasks set: exit %d", code)
	}
	hid := add("hooks", "add", "--event", "*", "--command", "/bin/true", "--session", sid)

	// Text mode: should contain section headers + task/hook rows.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", sid, "--include", "tasks,hooks")
	if code != 0 {
		t.Fatalf("info --include: exit %d", code)
	}
	for _, want := range []string{
		"--- tasks ---", "do thing 1", "do thing 2", "completed\t" + t2,
		"--- hooks ---", hid, "session=" + sid,
	} {
		if !strings.Contains(stdout, want) {
			t.Errorf("text mode missing %q in: %q", want, stdout)
		}
	}
	if !strings.Contains(stdout, "pending\t"+t1) {
		t.Errorf("expected pending status row for t1=%s in: %q", t1, stdout)
	}

	// JSON mode: parse and check the wrapping shape.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", sid, "--include", "tasks,hooks", "--format", "json")
	if code != 0 {
		t.Fatalf("info --include --format json: exit %d", code)
	}
	var out struct {
		Session struct {
			ID string `json:"id"`
		} `json:"session"`
		Tasks []struct {
			ID     string `json:"id"`
			Status string `json:"status"`
		} `json:"tasks"`
		Hooks []struct {
			ID    string `json:"id"`
			Event string `json:"event"`
		} `json:"hooks"`
	}
	if err := json.Unmarshal([]byte(stdout), &out); err != nil {
		t.Fatalf("json parse: %v\n  raw=%q", err, stdout)
	}
	if out.Session.ID != sid {
		t.Errorf("session.id mismatch: %q vs %q", out.Session.ID, sid)
	}
	if len(out.Tasks) != 2 || len(out.Hooks) != 1 {
		t.Errorf("expected 2 tasks + 1 hook, got %d / %d", len(out.Tasks), len(out.Hooks))
	}

	// Bare info still works (no --include).
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", sid)
	if code != 0 {
		t.Fatalf("info bare: exit %d", code)
	}
	if strings.Contains(stdout, "--- tasks ---") {
		t.Errorf("bare info should not include tasks section: %q", stdout)
	}

	// Unknown include token → exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", sid, "--include", "nonsense"); code != 2 {
		t.Errorf("info --include nonsense: want exit 2, got %d", code)
	}
}

// TestCLI_FollowJSON covers NNNN1: `gact follow --format json`
// emits NDJSON for both the snapshot and streamed messages. Each
// line must parse as a Message-shaped object.
func TestCLI_FollowJSON(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "follow-json-target")

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "snapshot ALPHA"); code != 0 {
		t.Fatalf("send ALPHA: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait ALPHA: exit %d", code)
	}

	followDone := make(chan string, 1)
	go func() {
		stdout, _, _ := runGactWithDuration(t, bin,
			map[string]string{"GACT_BACKEND": url},
			5*time.Second,
			"follow", sid, "--format", "json")
		followDone <- stdout
	}()
	time.Sleep(800 * time.Millisecond)
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "stream BRAVO"); code != 0 {
		t.Fatalf("send BRAVO: exit %d", code)
	}

	out := <-followDone
	lines := strings.Split(strings.TrimRight(out, "\n"), "\n")
	if len(lines) < 2 {
		t.Fatalf("expected ≥2 NDJSON lines, got %d: %q", len(lines), out)
	}
	type msg struct {
		ID        string `json:"id"`
		SessionID string `json:"session_id"`
		Role      string `json:"role"`
		Parts     []struct {
			Type string `json:"type"`
			Text string `json:"text,omitempty"`
		} `json:"parts"`
	}
	sawAlpha, sawBravo := false, false
	for i, line := range lines {
		if line == "" {
			continue
		}
		var m msg
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			t.Fatalf("line %d not JSON: %v\n  raw=%q", i, err, line)
		}
		if m.SessionID != sid {
			t.Errorf("line %d wrong session_id: %q", i, m.SessionID)
		}
		for _, p := range m.Parts {
			if strings.Contains(p.Text, "snapshot ALPHA") {
				sawAlpha = true
			}
			if strings.Contains(p.Text, "stream BRAVO") {
				sawBravo = true
			}
		}
	}
	if !sawAlpha {
		t.Errorf("snapshot ALPHA not in NDJSON parts: %q", out)
	}
	if !sawBravo {
		t.Errorf("stream BRAVO not in NDJSON parts: %q", out)
	}
}

// TestCLI_WaitAnyOf covers YYY1: fire two async turns then wait for
// the first to finish; assert exit 0 and the printed sid is one of
// the two we passed.
func TestCLI_WaitAnyOf(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	tellSid := func(name string) string {
		stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"tell", name, "--async", "fire and watch")
		if code != 0 {
			t.Fatalf("tell %s: exit %d", name, code)
		}
		parts := strings.Split(strings.TrimSpace(stdout), "\t")
		if len(parts) != 2 {
			t.Fatalf("expected sid<TAB>mid, got %q", stdout)
		}
		return parts[0]
	}
	sid1 := tellSid("wait-any-A")
	sid2 := tellSid("wait-any-B")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--any-of", sid1+","+sid2, "--timeout", "30s")
	if code != 0 {
		t.Fatalf("wait --any-of: exit %d", code)
	}
	winner := strings.TrimSpace(stdout)
	if winner != sid1 && winner != sid2 {
		t.Errorf("expected winner ∈ {%q, %q}, got %q", sid1, sid2, winner)
	}
}

// TestCLI_TellAsync covers LLL8: --async returns immediately with
// sid<TAB>msg_id and exits before the assistant reply lands.
func TestCLI_TellAsync(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	name := "async-test"

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tell", name, "--async", "fire and forget")
	if code != 0 {
		t.Fatalf("tell --async: exit %d", code)
	}
	out := strings.TrimSpace(stdout)
	parts := strings.Split(out, "\t")
	if len(parts) != 2 {
		t.Fatalf("expected sid<TAB>msg_id, got %q", out)
	}
	sid, mid := parts[0], parts[1]
	if !strings.HasPrefix(sid, "sess_") {
		t.Errorf("sid prefix: got %q", sid)
	}
	if !strings.HasPrefix(mid, "msg_") {
		t.Errorf("msg_id prefix: got %q", mid)
	}

	// Second call with same name + --async still resolves to the
	// same session — proving --async didn't break the create-or-resume
	// behaviour.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tell", "--async", name, "second turn")
	if code != 0 {
		t.Fatalf("tell --async (resume): exit %d", code)
	}
	parts2 := strings.Split(strings.TrimSpace(stdout), "\t")
	if len(parts2) != 2 {
		t.Fatalf("expected sid<TAB>msg_id, got %q", stdout)
	}
	if parts2[0] != sid {
		t.Errorf("expected same sid on resume: first=%q second=%q", sid, parts2[0])
	}
}

// TestCLI_Tell covers user-flagged name-based session messaging:
// `gact tell <name> <msg>` creates a session by title on first call
// and resumes it on subsequent calls. One verb, idempotent resolution.
func TestCLI_Tell(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	name := "tell-name-roundtrip"

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tell", name, "hello, my name is jaime")
	if code != 0 {
		t.Fatalf("tell create: exit %d (stderr=%q)", code, stderr)
	}
	if strings.TrimSpace(stdout) == "" {
		t.Errorf("tell create: expected non-empty assistant reply, got %q", stdout)
	}
	if !strings.Contains(stderr, "created session") {
		t.Errorf("tell create: expected 'created session' notice on stderr, got %q", stderr)
	}

	// Second call with the same name MUST resolve to the same sid;
	// no "created session" notice.
	stdout, stderr, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tell", name, "what is my name")
	if code != 0 {
		t.Fatalf("tell resume: exit %d (stderr=%q)", code, stderr)
	}
	if strings.TrimSpace(stdout) == "" {
		t.Errorf("tell resume: expected non-empty assistant reply, got %q", stdout)
	}
	if strings.Contains(stderr, "created session") {
		t.Errorf("tell resume: should NOT recreate existing session, stderr=%q", stderr)
	}

	// Confirm both turns landed in the same session.
	sidStdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"list", "--status", "idle")
	if code != 0 {
		t.Fatalf("list: exit %d", code)
	}
	var sid string
	for _, line := range strings.Split(sidStdout, "\n") {
		if strings.Contains(line, name) {
			sid = strings.SplitN(line, "\t", 2)[0]
			break
		}
	}
	if sid == "" {
		t.Fatalf("could not find session %q in list: %q", name, sidStdout)
	}
	logOut, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid)
	if code != 0 {
		t.Fatalf("log: exit %d", code)
	}
	if !strings.Contains(logOut, "hello, my name is jaime") || !strings.Contains(logOut, "what is my name") {
		t.Errorf("log doesn't show both turns: %q", logOut)
	}

	// Empty message → exit 2 (usage).
	if _, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tell", name); code != 2 {
		t.Errorf("tell missing message: expected exit 2, got %d", code)
	}
}

// TestCLI_Capabilities covers GGG1: print contract version + flags
// in text + JSON. Asserts seeded flags (workspaces, sessions, mcp)
// are reported as enabled and the contract_version field appears.
func TestCLI_Capabilities(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"capabilities")
	if code != 0 {
		t.Fatalf("capabilities: exit %d", code)
	}
	if !strings.Contains(stdout, "contract_version:") {
		t.Errorf("expected contract_version line: %q", stdout)
	}
	for _, want := range []string{
		"✓ workspaces",
		"✓ sessions",
		"✓ mcp",
		"✓ session_tasks",
		"✓ agent_routing",
		"✓ integration_health",
		"✓ tool_telemetry",
		"✓ x_clio_agent_blueprints",
		"✓ x_clio_files_content",
		"· x_clio_semantic_events",
	} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in capabilities text: %q", want, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"caps", "--format", "json")
	if code != 0 {
		t.Fatalf("caps json: exit %d", code)
	}
	if !strings.Contains(stdout, `"contract_version"`) || !strings.Contains(stdout, `"workspaces"`) {
		t.Errorf("expected JSON with contract_version + capabilities: %q", stdout)
	}
}

func TestCapabilitiesTextRowsCoverDecodedCapabilityFlags(t *testing.T) {
	rows := capabilityFlagTextRows(gact.CapabilityFlags{
		Workspaces:                     true,
		XClioTextStreaming:             "sse",
		XClioStreamFallbackReasons:     map[string]any{"provider": map[string]any{"reason": "batch"}},
		XClioSyntheticPosthocStreaming: true,
	})
	seen := map[string]bool{}
	enabled := map[string]bool{}
	for _, row := range rows {
		if row.name == "" {
			t.Fatal("capability text row has empty name")
		}
		if seen[row.name] {
			t.Fatalf("duplicate capability text row %q", row.name)
		}
		seen[row.name] = true
		enabled[row.name] = row.on
	}

	typ := reflect.TypeOf(gact.CapabilityFlags{})
	for i := 0; i < typ.NumField(); i++ {
		name := strings.Split(typ.Field(i).Tag.Get("json"), ",")[0]
		if name == "" || name == "-" {
			continue
		}
		if !seen[name] {
			t.Fatalf("decoded capability flag %q is missing from CLI capability text rows", name)
		}
	}
	for _, name := range []string{
		"workspaces",
		"x_clio_text_streaming",
		"x_clio_stream_fallback_reasons",
		"x_clio_synthetic_posthoc_streaming",
	} {
		if !enabled[name] {
			t.Fatalf("%s should be marked enabled in text rows", name)
		}
	}
}

// TestCLI_AgentShow covers DDD1: fetch the seeded `default` agent
// and assert its title, description, default_model line, and tools
// list land in text output. JSON mode dumps the raw AgentDef.
func TestCLI_AgentShow(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"agent", "show", "default")
	if code != 0 {
		t.Fatalf("agent show: exit %d", code)
	}
	for _, want := range []string{"id:", "Default Agent", "default_model:", "tools:"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in output: %q", want, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"agent", "show", "default", "--format", "json")
	if code != 0 {
		t.Fatalf("agent show json: exit %d", code)
	}
	if !strings.Contains(stdout, `"id"`) || !strings.Contains(stdout, `"default"`) {
		t.Errorf("expected JSON with id+default: %q", stdout)
	}
}

// TestCLI_Watch covers DDD2: send a turn in the background, watch
// surfaces transitions, and exits cleanly when status settles.
func TestCLI_Watch(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "watch-target")

	go func() {
		time.Sleep(300 * time.Millisecond)
		_, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"send", sid, "hello watcher")
	}()

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"watch", sid, "--interval", "150ms", "--timeout", "20s")
	if code != 0 {
		t.Fatalf("watch: exit %d", code)
	}
	rows := strings.Split(strings.TrimSpace(stdout), "\n")
	if len(rows) < 2 {
		t.Errorf("expected at least 2 transition rows, got %d: %q", len(rows), stdout)
	}
	for _, r := range rows {
		fields := strings.Split(r, "\t")
		if len(fields) != 4 {
			t.Errorf("expected 4 TSV fields per row, got %d in %q", len(fields), r)
		}
	}
}

// TestCLI_WatchJSON covers SSSS1: --format json on `gact watch`
// emits one NDJSON record per state change. Asserts: ≥2 rows
// containing sid + status fields, every line parses, and an
// idle-status row terminates the run.
func TestCLI_WatchJSON(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "watch-json-target")

	go func() {
		time.Sleep(300 * time.Millisecond)
		_, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"send", sid, "hello watcher")
	}()

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"watch", sid, "--format", "json", "--interval", "150ms", "--timeout", "20s")
	if code != 0 {
		t.Fatalf("watch --format json: exit %d", code)
	}
	rows := strings.Split(strings.TrimSpace(stdout), "\n")
	if len(rows) < 2 {
		t.Fatalf("expected ≥2 NDJSON rows, got %d: %q", len(rows), stdout)
	}
	type rec struct {
		TS     string `json:"ts"`
		SID    string `json:"sid"`
		Status string `json:"status"`
		Msgs   int    `json:"message_count"`
		Tokens int    `json:"tokens_out"`
	}
	sawIdle := false
	for i, line := range rows {
		var r rec
		if err := json.Unmarshal([]byte(line), &r); err != nil {
			t.Fatalf("row %d not JSON: %v\n  raw=%q", i, err, line)
		}
		if r.SID != sid || r.TS == "" || r.Status == "" {
			t.Errorf("row %d malformed: %+v", i, r)
		}
		if r.Status == "idle" {
			sawIdle = true
		}
	}
	if !sawIdle {
		t.Errorf("expected an idle row before exit; rows=%q", stdout)
	}

	// Unknown format → exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"watch", sid, "--format", "yaml"); code != 2 {
		t.Errorf("watch --format yaml: want exit 2, got %d", code)
	}
}

// TestCLI_ToolShow covers CCC1: fetch one tool's full definition.
// Asserts the seeded `bash` tool's name, description, and schema.
func TestCLI_ToolShow(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tool", "show", "bash")
	if code != 0 {
		t.Fatalf("tool show: exit %d", code)
	}
	for _, want := range []string{"id:", "name:", "input_schema:", "command"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in output: %q", want, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tool", "show", "bash", "--format", "json")
	if code != 0 {
		t.Fatalf("tool show json: exit %d", code)
	}
	if !strings.Contains(stdout, `"input_schema"`) || !strings.Contains(stdout, `"bash"`) {
		t.Errorf("expected JSON with input_schema + id: %q", stdout)
	}
}

// TestCLI_McpReconnect covers CCC2: POST reconnect for a known MCP
// server returns exit 0 and a missing one returns exit 1. MMM1
// extends this: assert the workspace SSE stream picks up the
// `notification` event the reconnect handler now emits.
func TestCLI_McpReconnect(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "reconnect", "mcp_fake"); code != 0 {
		t.Fatalf("reconnect mcp_fake: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "reconnect", "nope"); code == 0 {
		t.Fatalf("reconnect nope: expected non-zero exit")
	}

	// MMM1: start tailing in the background, fire the reconnect, and
	// verify the workspace stream surfaces a `notification` event.
	tailDone := make(chan string, 1)
	go func() {
		stdout, _, _ := runGactWithDuration(t, bin,
			map[string]string{"GACT_BACKEND": url},
			1500*time.Millisecond,
			"tail", "--workspace", "ws_default")
		tailDone <- stdout
	}()
	time.Sleep(300 * time.Millisecond) // let SSE stream attach
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "reconnect", "mcp_fake"); code != 0 {
		t.Fatalf("reconnect for notification: exit %d", code)
	}
	out := <-tailDone
	if !strings.Contains(out, `"notification"`) {
		t.Errorf("expected notification event in tail output: %q", out)
	}
	if !strings.Contains(out, "MCP server reconnected") {
		t.Errorf("expected notification title in tail output: %q", out)
	}
}

// TestCLI_McpDetail covers BBB1: list tools, resources, and prompts
// for the seeded `mcp_fake` server. Each verb must return at least
// one row (the emulator seeds them statically).
func TestCLI_McpDetail(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	for _, verb := range []string{"tools", "resources", "prompts"} {
		stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"mcp", verb, "mcp_fake")
		if code != 0 {
			t.Fatalf("mcp %s: exit %d", verb, code)
		}
		if strings.TrimSpace(stdout) == "" {
			t.Errorf("expected at least one row for mcp %s, got empty", verb)
		}
	}

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "tools", "mcp_fake", "--format", "json")
	if code != 0 {
		t.Fatalf("mcp tools json: exit %d", code)
	}
	if !strings.Contains(stdout, `"id"`) {
		t.Errorf("expected JSON tool id field: %q", stdout)
	}
}

// TestCLI_RepoMap covers AAA1: render the seeded workspace repo map
// in tree and JSON formats; assert main.go and the Handler symbol
// surface.
func TestCLI_RepoMap(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"repo-map", "ws_default")
	if code != 0 {
		t.Fatalf("repo-map: exit %d", code)
	}
	if !strings.Contains(stdout, "main.go") {
		t.Errorf("expected main.go in tree: %q", stdout)
	}
	if !strings.Contains(stdout, "Handler") {
		t.Errorf("expected Handler symbol in tree: %q", stdout)
	}
	if !strings.Contains(stderr, "tokens") {
		t.Errorf("expected tokens summary on stderr: %q", stderr)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"repo-map", "ws_default", "--format", "json")
	if code != 0 {
		t.Fatalf("repo-map json: exit %d", code)
	}
	if !strings.Contains(stdout, `"tree"`) || !strings.Contains(stdout, `"tokens"`) {
		t.Errorf("expected JSON shape: %q", stdout)
	}
}

// TestCLI_FilesList covers ZZ1: list workspace files in TSV and JSON.
func TestCLI_FilesList(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"files", "list", "ws_default")
	if code != 0 {
		t.Fatalf("files list: exit %d", code)
	}
	if !strings.Contains(stdout, "main.go") {
		t.Errorf("expected main.go in workspace listing: %q", stdout)
	}
	if !strings.HasPrefix(stdout, "file\t") && !strings.HasPrefix(stdout, "dir\t") {
		t.Errorf("expected TSV with type as first column: %q", stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"files", "list", "ws_default", "--format", "json")
	if code != 0 {
		t.Fatalf("files list json: exit %d", code)
	}
	if !strings.Contains(stdout, `"path"`) || !strings.Contains(stdout, `"main.go"`) {
		t.Errorf("expected JSON entries with main.go: %q", stdout)
	}
}

// TestCLI_FilesListGlob covers ZZZZ1: --glob filters workspace
// listing by Go path.Match pattern. Tries '*.go' (basename
// fallback path), an exact path match, and a bad pattern → exit 2.
func TestCLI_FilesListGlob(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	// Capture an unfiltered baseline so we know we're truly
	// reducing the set, not coincidentally seeing a single match.
	allOut, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"files", "list", "ws_default")
	if code != 0 {
		t.Fatalf("files list (baseline): exit %d", code)
	}
	allRows := strings.Count(strings.TrimSpace(allOut), "\n") + 1

	// '*.go' should keep multiple .go files (the seeded workspace
	// has at least main.go + a couple under internal/).
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"files", "list", "ws_default", "--glob", "*.go")
	if code != 0 {
		t.Fatalf("files list --glob *.go: exit %d", code)
	}
	if strings.Contains(stdout, "README.md") || strings.Contains(stdout, "go.mod") {
		t.Errorf("non-.go entries leaked through *.go filter: %q", stdout)
	}
	if !strings.Contains(stdout, "main.go") {
		t.Errorf("expected main.go in *.go filter: %q", stdout)
	}
	goRows := strings.Count(strings.TrimSpace(stdout), "\n") + 1
	if goRows >= allRows {
		t.Errorf("*.go filter (got %d) should be narrower than baseline (got %d)", goRows, allRows)
	}

	// Exact-path glob: 'main.go' matches both the root main.go and
	// any deeper basename-equal path (cmd/server/main.go) due to the
	// basename-fallback rule. README.md should still be excluded.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"files", "list", "ws_default", "--glob", "main.go")
	if code != 0 {
		t.Fatalf("files list --glob main.go: exit %d", code)
	}
	if !strings.Contains(stdout, "main.go") {
		t.Errorf("expected main.go in exact glob: %q", stdout)
	}
	if strings.Contains(stdout, "README.md") || strings.Contains(stdout, "go.mod") {
		t.Errorf("non-main.go entries leaked: %q", stdout)
	}

	// Bad pattern → exit 2 without making the request.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"files", "list", "ws_default", "--glob", "[bad"); code != 2 {
		t.Errorf("files list --glob '[bad': want exit 2, got %d", code)
	}
}

// TestCLI_FilesRead covers ZZ2: read main.go from the seeded workspace
// and assert content contains `package main`.
func TestCLI_FilesRead(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"files", "read", "ws_default", "main.go")
	if code != 0 {
		t.Fatalf("files read: exit %d", code)
	}
	if !strings.Contains(stdout, "package main") {
		t.Errorf("expected file body to contain 'package main': %q", stdout)
	}
}

// TestCLI_Undo covers YY1: send + run a turn, count messages, undo
// the last one, and assert the count drops by one and the freshest
// message id is gone from the log.
func TestCLI_Undo(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "undo-target")

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "hello"); code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait: exit %d", code)
	}

	beforeLog, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid)
	if code != 0 {
		t.Fatalf("log before: exit %d", code)
	}
	beforeRoles := strings.Count(beforeLog, "[")

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"undo", sid, "--count", "1")
	if code != 0 {
		t.Fatalf("undo: exit %d", code)
	}
	revertedLines := 0
	for _, line := range strings.Split(strings.TrimSpace(stdout), "\n") {
		if strings.HasPrefix(line, "msg_") {
			revertedLines++
		}
	}
	if revertedLines != 1 {
		t.Errorf("expected 1 reverted msg id on stdout, got %d (stdout=%q)", revertedLines, stdout)
	}
	if !strings.Contains(stderr, "reverted 1 message") {
		t.Errorf("expected stderr summary, got %q", stderr)
	}

	afterLog, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid)
	if code != 0 {
		t.Fatalf("log after: exit %d", code)
	}
	afterRoles := strings.Count(afterLog, "[")
	if afterRoles != beforeRoles-1 {
		t.Errorf("expected role count to drop by 1: before=%d after=%d", beforeRoles, afterRoles)
	}
}

// TestCLI_Info covers XX1: get a single session's metadata in text
// and JSON, asserting the title round-trips and status is one of the
// known states.
func TestCLI_Info(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "info-roundtrip")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", sid)
	if code != 0 {
		t.Fatalf("info: exit %d", code)
	}
	if !strings.Contains(stdout, "info-roundtrip") {
		t.Errorf("expected title in info text: %q", stdout)
	}
	if !strings.Contains(stdout, "status:") {
		t.Errorf("expected status: line: %q", stdout)
	}
	hasStatus := false
	for _, st := range []string{"idle", "running", "waiting", "error"} {
		if strings.Contains(stdout, "status:        "+st) {
			hasStatus = true
			break
		}
	}
	if !hasStatus {
		t.Errorf("status not in known set: %q", stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", "--format", "json", sid)
	if code != 0 {
		t.Fatalf("info json: exit %d", code)
	}
	if !strings.Contains(stdout, `"id"`) || !strings.Contains(stdout, `"info-roundtrip"`) {
		t.Errorf("expected JSON with id+title: %q", stdout)
	}
}

// JJJJJJJJJ1: `gact info` surfaces the detached-registry flag in
// both text and json output — same source of truth as the other
// 10 surfaces that show it.
func TestCLI_InfoDetachedField(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sidPlain := createSession(t, url, "info-detach-plain")
	sidWalked := createSession(t, url, "info-detach-walked")

	dir := t.TempDir()
	regPath := filepath.Join(dir, "detached.json")
	body := fmt.Sprintf(
		`{"records":[{"session_id":%q,"title":"info-detach-walked","backend":%q,"detached_at":"2026-04-20T08:00:00Z"}]}`,
		sidWalked, url,
	)
	if err := os.WriteFile(regPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	env := map[string]string{"GACT_BACKEND": url, "GACT_DETACHED_PATH": regPath}

	// Plain (not in registry) → text shows "detached:      no".
	stdout, _, code := runGact(t, bin, env, "info", sidPlain)
	if code != 0 {
		t.Fatalf("info plain: exit %d", code)
	}
	if !strings.Contains(stdout, "detached:      no") {
		t.Errorf("plain session should show 'detached: no': %q", stdout)
	}

	// Walked (in registry) → text shows "detached:      yes".
	stdout, _, code = runGact(t, bin, env, "info", sidWalked)
	if code != 0 {
		t.Fatalf("info walked: exit %d", code)
	}
	if !strings.Contains(stdout, "detached:      yes") {
		t.Errorf("walked session should show 'detached: yes': %q", stdout)
	}

	// JSON carries the flag at top level.
	stdout, _, code = runGact(t, bin, env, "info", "--format", "json", sidWalked)
	if code != 0 {
		t.Fatalf("info json: exit %d", code)
	}
	if !strings.Contains(stdout, `"detached": true`) {
		t.Errorf("expected `\"detached\": true` in JSON: %q", stdout)
	}
	stdout, _, code = runGact(t, bin, env, "info", "--format", "json", sidPlain)
	if code != 0 {
		t.Fatalf("info json plain: exit %d", code)
	}
	if !strings.Contains(stdout, `"detached": false`) {
		t.Errorf("expected `\"detached\": false` in JSON: %q", stdout)
	}
}

// TestCLI_Models covers WW1: list providers + models, then filter
// to a single provider and assert no foreign rows leak in.
func TestCLI_Models(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"models", "list")
	if code != 0 {
		t.Fatalf("models list: exit %d", code)
	}
	for _, p := range []string{"anthropic", "openai", "local"} {
		if !strings.Contains(stdout, p) {
			t.Errorf("expected provider %q in models list: %q", p, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"models", "list", "--provider", "anthropic")
	if code != 0 {
		t.Fatalf("models list --provider: exit %d", code)
	}
	if !strings.Contains(stdout, "anthropic") {
		t.Errorf("expected anthropic rows: %q", stdout)
	}
	if strings.Contains(stdout, "openai") || strings.Contains(stdout, "local\t") {
		t.Errorf("filter leaked other providers: %q", stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"models", "list", "--format", "json")
	if code != 0 {
		t.Fatalf("models list json: exit %d", code)
	}
	if !strings.Contains(stdout, `"provider_id"`) || !strings.Contains(stdout, `"model_id"`) {
		t.Errorf("expected JSON shape: %q", stdout)
	}
}

// TestCLI_Fork covers VV1: fork an existing session, assert the new
// id differs and the child surfaces under the parent in
// /v1/sessions?parent_session_id=...
func TestCLI_Fork(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	parent := createSession(t, url, "fork-parent")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"fork", parent, "--title", "fork-child")
	if code != 0 {
		t.Fatalf("fork: exit %d", code)
	}
	child := strings.TrimSpace(stdout)
	if child == "" || child == parent {
		t.Fatalf("expected new child id distinct from parent; got %q (parent %q)", child, parent)
	}

	resp, err := http.Get(url + "/v1/sessions?parent_session_id=" + parent)
	if err != nil {
		t.Fatalf("list children: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), child) {
		t.Errorf("expected child %q in parent's children list: %s", child, body)
	}
}

// TestCLI_Workspaces covers UU1: list workspaces in TSV and JSON
// against the seeded `ws_default` workspace the emulator boots with.
func TestCLI_Workspaces(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"workspaces", "list")
	if code != 0 {
		t.Fatalf("workspaces list: exit %d", code)
	}
	if !strings.Contains(stdout, "ws_default") {
		t.Errorf("expected ws_default in TSV output: %q", stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"workspaces", "list", "--format", "json")
	if code != 0 {
		t.Fatalf("workspaces list json: exit %d", code)
	}
	if !strings.Contains(stdout, `"id"`) || !strings.Contains(stdout, `"ws_default"`) {
		t.Errorf("expected JSON with ws_default id: %q", stdout)
	}
}

// TestCLI_Search covers TT1: send a unique-token message, then
// search for that token and verify the message id + role + snippet
// land in the TSV output. Also exercises --format json.
func TestCLI_Search(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "search-target")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "the marker token is xyzzy42")
	if code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	mid := strings.TrimSpace(stdout)

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"search", sid, "xyzzy42")
	if code != 0 {
		t.Fatalf("search: exit %d", code)
	}
	if !strings.Contains(stdout, mid) {
		t.Errorf("expected matching mid %q in search output: %q", mid, stdout)
	}
	if !strings.Contains(stdout, "user") {
		t.Errorf("expected role 'user' in search output: %q", stdout)
	}
	if !strings.Contains(stdout, "xyzzy42") {
		t.Errorf("expected snippet to contain query token: %q", stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"search", "--format", "json", sid, "xyzzy42")
	if code != 0 {
		t.Fatalf("search json: exit %d", code)
	}
	if !strings.Contains(stdout, `"message_id"`) || !strings.Contains(stdout, `"snippet"`) {
		t.Errorf("expected JSON fields in output: %q", stdout)
	}
}

// TestCLI_PermsListJSON covers OOOOO1: --format json on
// `gact perms list` returns the raw PermissionWire array including
// the full ToolCall (tool_name + input args + annotations) which
// the TSV view loses. Default tsv preserved.
func TestCLI_PermsListJSON(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "perms-json-target")

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "delete the temp dir"); code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	// Wait for the permission to register.
	deadline := time.Now().Add(3 * time.Second)
	var pid string
	for time.Now().Before(deadline) {
		stdout, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"perms", "list", sid)
		for _, line := range strings.Split(stdout, "\n") {
			if strings.HasPrefix(line, "perm_") {
				pid = strings.SplitN(line, "\t", 2)[0]
				break
			}
		}
		if pid != "" {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if pid == "" {
		t.Fatalf("permission never appeared")
	}

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "list", sid, "--format", "json")
	if code != 0 {
		t.Fatalf("perms list --format json: exit %d", code)
	}
	var arr []struct {
		ID       string `json:"id"`
		Status   string `json:"status"`
		ToolCall struct {
			ToolName string         `json:"tool_name"`
			Input    map[string]any `json:"input"`
		} `json:"tool_call"`
	}
	if err := json.Unmarshal([]byte(stdout), &arr); err != nil {
		t.Fatalf("parse: %v\n  raw=%q", err, stdout)
	}
	if len(arr) != 1 {
		t.Fatalf("expected 1 perm, got %d", len(arr))
	}
	if arr[0].ID != pid {
		t.Errorf("id mismatch: %q vs %q", arr[0].ID, pid)
	}
	if arr[0].Status != "pending" {
		t.Errorf("status = %q, want pending", arr[0].Status)
	}
	// JSON-only payload: tool name + input args.
	if arr[0].ToolCall.ToolName == "" {
		t.Errorf("expected tool_name to be populated; got %+v", arr[0].ToolCall)
	}
	if _, ok := arr[0].ToolCall.Input["command"]; !ok {
		t.Errorf("expected tool_call.input.command in JSON view; got %+v", arr[0].ToolCall.Input)
	}

	// Default tsv still works (back-compat with TestCLI_Perms).
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "list", sid)
	if code != 0 {
		t.Fatalf("perms list (default tsv): exit %d", code)
	}
	if !strings.Contains(stdout, pid) || !strings.Contains(stdout, "pending") {
		t.Errorf("default tsv missing pid/pending: %q", stdout)
	}

	// Unknown format → exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "list", sid, "--format", "yaml"); code != 2 {
		t.Errorf("perms list --format yaml: want exit 2, got %d", code)
	}
}

// TestCLI_Perms covers RR1: send a permission-triggering message,
// list perms, find the pending one, allow it, list again and verify
// the action lands as "resolved/allow".
func TestCLI_Perms(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "perms-target")

	// Trigger a permission prompt by sending a "delete" keyword.
	_, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "delete the temp dir")
	if code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	// Give the scenario a beat to register the pending permission.
	time.Sleep(700 * time.Millisecond)

	// List → find the pending one.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "list", "--pending", sid)
	if code != 0 {
		t.Fatalf("perms list: exit %d", code)
	}
	if !strings.Contains(stdout, "pending") {
		t.Fatalf("expected pending entry in stdout: %q", stdout)
	}
	pid := strings.SplitN(strings.TrimSpace(stdout), "\t", 2)[0]
	if !strings.HasPrefix(pid, "perm_") {
		t.Fatalf("first column doesn't look like a perm id: %q", pid)
	}

	// Allow.
	_, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "allow", pid)
	if code != 0 {
		t.Fatalf("perms allow: exit %d", code)
	}

	// Re-list, expect resolved.
	stdout, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "list", sid)
	if !strings.Contains(stdout, "resolved\tallow") {
		t.Errorf("post-allow list missing resolved/allow row: %q", stdout)
	}
}

// TestCLI_Stream covers QQ1: pretty-print SSE timeline. Starts the
// stream in the background, lets it capture server.connected, kills
// it. Asserts at least one HH:MM:SS-prefixed row landed.
func TestCLI_Stream(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	cmd := exec.Command(bin, "stream", "--workspace", "ws_default")
	cmd.Env = append(os.Environ(), "GACT_BACKEND="+url)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		t.Fatalf("start stream: %v", err)
	}
	time.Sleep(1500 * time.Millisecond)
	_ = cmd.Process.Kill()
	_ = cmd.Wait()

	body := out.String()
	if !strings.Contains(body, "server.connected") {
		t.Fatalf("stream missed server.connected event: %q", body)
	}
	// Format check: every row begins with HH:MM:SS (10 chars then two
	// spaces). Split on newlines and verify the first non-empty row
	// matches.
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Expected prefix shape: NN:NN:NN<space><space>type
		if len(line) < 11 || line[2] != ':' || line[5] != ':' {
			t.Errorf("row doesn't look like HH:MM:SS-prefixed: %q", line)
		}
		break
	}
}

// TestCLI_DumpBundleParallel covers RRRR1: with N>workers sessions
// the bounded fanout still writes every session.json into the
// bundle. Seeds 12 sessions (workers=8), asserts the summary count
// matches and every file lands.
func TestCLI_DumpBundleParallel(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	const N = 12
	sids := make([]string, 0, N)
	for i := 0; i < N; i++ {
		sids = append(sids, createSession(t, url, fmt.Sprintf("dump-parallel-%d", i)))
	}

	dir := filepath.Join(t.TempDir(), "bundle")
	_, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"dump-bundle", "-o", dir)
	if code != 0 {
		t.Fatalf("dump-bundle: exit %d, stderr=%q", code, stderr)
	}
	wantSummary := fmt.Sprintf("wrote %d sessions", N)
	if !strings.Contains(stderr, wantSummary) {
		t.Errorf("summary mismatch — want %q, stderr=%q", wantSummary, stderr)
	}
	for _, sid := range sids {
		p := filepath.Join(dir, "sessions", sid+".json")
		if _, err := os.Stat(p); err != nil {
			t.Errorf("missing session export %s: %v", p, err)
		}
	}
}

// TestCLI_DumpBundle covers PP1: dump-bundle creates the expected
// directory layout with version + diag + metrics + per-session JSON
// files. Seeds a session first so the sessions/ subdir is non-empty.
func TestCLI_DumpBundle(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	_ = createSession(t, url, "bundle-target")

	dir := filepath.Join(t.TempDir(), "bundle")
	_, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"dump-bundle", "-o", dir)
	if code != 0 {
		t.Fatalf("dump-bundle: exit %d, stderr=%q", code, stderr)
	}
	for _, want := range []string{"version.txt", "diag.txt", "metrics.json"} {
		if _, err := os.Stat(filepath.Join(dir, want)); err != nil {
			t.Errorf("missing %s: %v", want, err)
		}
	}
	versionText, err := os.ReadFile(filepath.Join(dir, "version.txt"))
	if err != nil {
		t.Fatalf("read version.txt: %v", err)
	}
	for _, want := range []string{
		"gact " + binaryVersion,
		"(contract " + contractVersion + ")",
		"revision:",
		"go:",
		"platform:",
	} {
		if !strings.Contains(string(versionText), want) {
			t.Fatalf("version.txt missing %q:\n%s", want, versionText)
		}
	}
	if strings.Contains(string(versionText), "runtime:") {
		t.Fatalf("version.txt should use the same Go metadata label as gact version, got:\n%s", versionText)
	}
	entries, err := os.ReadDir(filepath.Join(dir, "sessions"))
	if err != nil {
		t.Fatalf("sessions/ dir missing: %v", err)
	}
	if len(entries) == 0 {
		t.Fatalf("sessions/ dir empty — expected ≥1 session export")
	}
}

// TestCLI_Catalog covers OO1: each kind (tools/agents/mcp/commands)
// returns non-empty TSV against the emulator's seeded fixtures.
func TestCLI_Catalog(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	for _, kind := range []string{"tools", "agents", "mcp", "commands"} {
		stdout, stderr, code := runGact(t, bin,
			map[string]string{"GACT_BACKEND": url},
			"catalog", kind)
		if code != 0 {
			t.Errorf("catalog %s: exit %d, stderr=%q", kind, code, stderr)
			continue
		}
		if strings.TrimSpace(stdout) == "" {
			t.Errorf("catalog %s: empty output", kind)
		}
	}

	// JSON format works too.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"catalog", "tools", "--format", "json")
	if code != 0 || !strings.Contains(stdout, `"name"`) {
		t.Errorf("catalog tools --format json: code=%d stdout=%q", code, stdout[:80])
	}

	// Unknown kind → exit 2.
	_, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"catalog", "skills")
	if code != 2 {
		t.Errorf("unknown kind should exit 2, got %d", code)
	}
}

// TestCLI_ContextRoundTrip covers NN1: list (empty) → add two
// files → list (both present) → rm one → list (one left).
func TestCLI_ContextRoundTrip(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "context-target")

	// Empty list to start.
	stdout, _, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"context", "list", sid)
	if code != 0 {
		t.Fatalf("list (empty): exit %d", code)
	}
	if strings.TrimSpace(stdout) != "" {
		t.Fatalf("expected empty list, got: %q", stdout)
	}

	// Add two files.
	for _, f := range []string{"main.go", "README.md"} {
		_, _, code := runGact(t, bin,
			map[string]string{"GACT_BACKEND": url},
			"context", "add", sid, f)
		if code != 0 {
			t.Fatalf("add %s: exit %d", f, code)
		}
	}

	// List should show both.
	stdout, _, _ = runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"context", "list", sid)
	if !strings.Contains(stdout, "main.go") || !strings.Contains(stdout, "README.md") {
		t.Errorf("list missing entries: %q", stdout)
	}

	// Remove one.
	_, _, code = runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"context", "rm", sid, "main.go")
	if code != 0 {
		t.Fatalf("rm: exit %d", code)
	}

	// Confirm only README.md remains.
	stdout, _, _ = runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"context", "list", sid)
	if strings.Contains(stdout, "main.go") {
		t.Errorf("main.go should be removed: %q", stdout)
	}
	if !strings.Contains(stdout, "README.md") {
		t.Errorf("README.md should remain: %q", stdout)
	}
}

// TestCLI_Summarize covers LL1: triggers /summarize and prints the
// updated session.summary. The emulator stamps a placeholder string
// so we just check it lands non-empty on stdout.
func TestCLI_Summarize(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "summarize-target")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"summarize", sid)
	if code != 0 {
		t.Fatalf("summarize: exit %d", code)
	}
	if strings.TrimSpace(stdout) == "" {
		t.Errorf("summarize returned empty stdout")
	}

	// MMM6: --instructions round-trips into the resulting summary
	// (emulator echoes the prompt; real backends would feed it to
	// the summarizer). Use a fresh session so the placeholder doesn't
	// stick around from the first call.
	sid2 := createSession(t, url, "summarize-with-instr")
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"summarize", sid2, "--instructions", "tldr in 3 words")
	if code != 0 {
		t.Fatalf("summarize --instructions: exit %d", code)
	}
	if !strings.Contains(stdout, "tldr in 3 words") {
		t.Errorf("expected instructions echoed in summary, got %q", stdout)
	}
}

// TestCLI_Quick covers KK1: one-shot create + ask + delete chain.
// The session count before and after should be identical because
// quick cleans up the scratch session it creates.
func TestCLI_Quick(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	preList, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	preCount := strings.Count(preList, "\n")

	stdout, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"quick", "--timeout", "30s", "please read main.go")
	if code != 0 {
		t.Fatalf("quick: exit %d, stderr=%q", code, stderr)
	}
	if strings.TrimSpace(stdout) == "" {
		t.Fatalf("quick returned empty stdout")
	}

	postList, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	postCount := strings.Count(postList, "\n")
	if postCount != preCount {
		t.Errorf("session count changed: pre=%d post=%d (cleanup didn't run?)", preCount, postCount)
	}
}

// TestCLI_Metrics covers JJ1: text format prints uptime / sessions /
// messages / tokens / cost; json format emits parseable JSON with
// uptime_s present.
func TestCLI_Metrics(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "metrics")
	if code != 0 {
		t.Fatalf("metrics text: exit %d", code)
	}
	for _, want := range []string{"uptime:", "sessions:", "messages:", "tokens:", "cost:"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("text output missing %q: %q", want, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"metrics", "--format", "json")
	if code != 0 {
		t.Fatalf("metrics json: exit %d", code)
	}
	if !strings.Contains(stdout, `"uptime_s"`) {
		t.Errorf("json output missing uptime_s field: %q", stdout)
	}
}

// TestCLI_ArchiveRoundTrip covers II1: archive hides from default
// list, unarchive restores. Both exit 0 against the emulator.
func TestCLI_ArchiveRoundTrip(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"new", "--title", "archive-target")
	if code != 0 {
		t.Fatalf("new: exit %d", code)
	}
	sid := strings.TrimSpace(stdout)

	// Archive.
	_, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "archive", sid)
	if code != 0 {
		t.Fatalf("archive: exit %d", code)
	}

	// Default list now omits the session (emulator filters archived).
	listOut, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	if strings.Contains(listOut, sid) {
		t.Errorf("archived session still in default list: %q", listOut)
	}

	// Unarchive restores.
	_, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "unarchive", sid)
	if code != 0 {
		t.Fatalf("unarchive: exit %d", code)
	}
	listOut, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	if !strings.Contains(listOut, sid) {
		t.Errorf("unarchived session missing from list: %q", listOut)
	}

	// Cleanup.
	_, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "delete", sid)
}

// TestCLI_Completion covers II2: each shell mode prints a script
// with at least the canonical "completion" entry. KKKKKKKKK1 adds
// assertions for `detached` + `resume` subcommands so future
// additions don't silently drop off the completion list.
func TestCLI_Completion(t *testing.T) {
	bin := buildGact(t)
	for _, shell := range []string{"bash", "zsh", "fish"} {
		stdout, _, code := runGact(t, bin, nil, "completion", shell)
		if code != 0 {
			t.Errorf("completion %s: exit %d", shell, code)
		}
		if !strings.Contains(stdout, "gact") {
			t.Errorf("completion %s: missing 'gact' in script: %q", shell, stdout[:120])
		}
		for _, subcmd := range []string{"detached", "resume", "dashboard", "log"} {
			if !strings.Contains(stdout, subcmd) {
				t.Errorf("completion %s: missing subcommand %q", shell, subcmd)
			}
		}
	}
	// Unknown shell → exit 2.
	_, _, code := runGact(t, bin, nil, "completion", "powershell")
	if code != 2 {
		t.Errorf("unknown shell should exit 2, got %d", code)
	}
}

// TestCLI_DeleteRoundTrip covers HH1: gact new → gact delete →
// list confirms the session is gone.
func TestCLI_DeleteRoundTrip(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "new")
	if code != 0 {
		t.Fatalf("new: exit %d", code)
	}
	sid := strings.TrimSpace(stdout)

	_, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "delete", sid)
	if code != 0 {
		t.Fatalf("delete: exit %d", code)
	}

	listOut, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	if code != 0 {
		t.Fatalf("list: exit %d", code)
	}
	if strings.Contains(listOut, sid) {
		t.Errorf("session %q still in list after delete: %s", sid, listOut)
	}
}

// TestCLI_RenameUpdatesTitle covers HH2: rename + list shows the
// new title.
func TestCLI_RenameUpdatesTitle(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"new", "--title", "before")
	if code != 0 {
		t.Fatalf("new: exit %d", code)
	}
	sid := strings.TrimSpace(stdout)

	_, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"rename", sid, "after-rename")
	if code != 0 {
		t.Fatalf("rename: exit %d", code)
	}

	listOut, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	if !strings.Contains(listOut, "after-rename") {
		t.Errorf("renamed title missing from list: %s", listOut)
	}
}

// TestCLI_New covers GG1: gact new prints a session id; the id can
// then be passed to subsequent commands. Validates:
//   - exit code 0 on success
//   - stdout begins with sess_ (canonical id prefix)
//   - the session is reachable via gact list afterwards
func TestCLI_New(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"new", "--title", "shell-created")
	if code != 0 {
		t.Fatalf("new: exit %d, stderr=%q", code, stderr)
	}
	sid := strings.TrimSpace(stdout)
	if !strings.HasPrefix(sid, "sess_") {
		t.Fatalf("new: stdout doesn't look like a session id: %q", stdout)
	}

	// Round-trip through list to confirm the session landed.
	listOut, _, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url}, "list")
	if code != 0 {
		t.Fatalf("list after new: exit %d", code)
	}
	if !strings.Contains(listOut, sid) {
		t.Errorf("list didn't include the new session %q: %q", sid, listOut)
	}
}

// TestCLI_Ask covers FF1: ask returns the assistant's reply text on
// stdout (no role headers, no extra noise) so shell capture works.
// Validates non-empty output and that stdout contains assistant
// content rather than the question echoed back.
func TestCLI_Ask(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "ask-target")

	stdout, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"ask", "--timeout", "30s", sid, "please read main.go")
	if code != 0 {
		t.Fatalf("ask: exit %d, stderr=%q", code, stderr)
	}
	if strings.TrimSpace(stdout) == "" {
		t.Fatalf("ask returned empty stdout")
	}
	// The emulator's scenario emits assistant text containing
	// "I'll take a look" — verify it landed.
	if !strings.Contains(stdout, "main.go") && !strings.Contains(stdout, "took") &&
		!strings.Contains(stdout, "look") {
		t.Errorf("stdout doesn't look like an assistant reply: %q", stdout)
	}
}

// TestCLI_Log covers DD2: send a message that triggers a scenario,
// wait for idle, then dump the log and verify role headers + the
// user message text appear in the output.
func TestCLI_Log(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "log-target")

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"run", "--timeout", "30s", sid, "please read main.go"); code != 0 {
		t.Fatalf("run setup: exit %d", code)
	}

	stdout, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url}, "log", sid)
	if code != 0 {
		t.Fatalf("log: exit %d, stderr=%q", code, stderr)
	}
	if !strings.Contains(stdout, "[USER @") {
		t.Errorf("log missing USER role header: %q", stdout)
	}
	if !strings.Contains(stdout, "please read main.go") {
		t.Errorf("log missing user text: %q", stdout)
	}
	if !strings.Contains(stdout, "[ASSISTANT @") {
		t.Errorf("log missing ASSISTANT role header: %q", stdout)
	}
}

// TestCLI_Cancel covers CC1: POST cancel, exit 0 even when session
// is already idle (the emulator + most backends accept idempotent
// cancels).
func TestCLI_Cancel(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "cancel-target")

	_, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url}, "cancel", sid)
	if code != 0 {
		t.Fatalf("cancel: exit %d, stderr=%q", code, stderr)
	}
}

// TestCLI_Run covers CC2: combined send + wait. Emits the message id
// to stdout then blocks until idle. Test runs against scenario
// timing=fast so it completes quickly.
func TestCLI_Run(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "run-target")

	stdout, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"run", "--timeout", "30s", sid, "please read main.go")
	if code != 0 {
		t.Fatalf("run: exit %d, stderr=%q", code, stderr)
	}
	if !strings.HasPrefix(strings.TrimSpace(stdout), "msg_") {
		t.Errorf("expected msg_* on stdout, got %q", stdout)
	}
}

// TestCLI_Wait covers BB1: post a message + immediately poll status
// with `wait`. Exits 0 once the emulator returns idle. We use the
// real emulator; scenario timing=fast keeps the running window
// below a second so the test doesn't drag.
func TestCLI_Wait(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "wait-target")

	// Send a message that triggers a scenario (which runs briefly
	// then returns to idle), then wait for idle.
	_, _, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"send", sid, "please read main.go")
	if code != 0 {
		t.Fatalf("send failed: exit %d", code)
	}
	_, _, code = runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid)
	if code != 0 {
		t.Fatalf("wait: exit %d", code)
	}
}

// TestCLI_Send covers AA1: `gact send` posts a user message and
// prints the returned message_id. Also covers the stdin-via-`-`
// path for pipe use.
func TestCLI_Send(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "send-target")

	// Positional text argument.
	stdout, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"send", sid, "hello from the shell")
	if code != 0 {
		t.Fatalf("send: exit %d, stderr=%q", code, stderr)
	}
	if !strings.HasPrefix(strings.TrimSpace(stdout), "msg_") {
		t.Errorf("expected msg_* on stdout, got %q", stdout)
	}

	// Stdin sentinel.
	cmd := exec.Command(bin, "send", "--backend", url, sid, "-")
	cmd.Env = append(os.Environ(), "GACT_BACKEND="+url)
	cmd.Stdin = strings.NewReader("pipe input\n")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		t.Fatalf("stdin send: %v", err)
	}
	if !strings.HasPrefix(strings.TrimSpace(out.String()), "msg_") {
		t.Errorf("stdin send stdout = %q", out.String())
	}
}

// TestCLI_Tail covers X1: tail emits at least the `server.connected`
// event as a JSON line when the emulator is up. Test runs with a
// short timeout + kills the tail process since the stream is
// long-lived by design.
func TestCLI_Tail(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	cmd := exec.Command(bin, "tail", "--workspace", "ws_default")
	cmd.Env = append(os.Environ(), "GACT_BACKEND="+url)
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		t.Fatalf("start tail: %v", err)
	}
	// Give the stream a second to emit the server.connected event.
	time.Sleep(1500 * time.Millisecond)
	_ = cmd.Process.Kill()
	_ = cmd.Wait()

	out := stdout.String()
	if !strings.Contains(out, `"type"`) {
		t.Fatalf("tail produced no JSON lines: %q", out)
	}
	if !strings.Contains(out, "server.connected") {
		t.Errorf("tail missed server.connected event: %q", out)
	}
}

// TestCLI_TailFormatText covers TTTT1: --format text on `gact tail`
// emits the same human-readable rows as `gact stream` (HH:MM:SS
// type summary). Default JSON behavior unchanged.
func TestCLI_TailFormatText(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	cmd := exec.Command(bin, "tail", "--workspace", "ws_default", "--format", "text")
	cmd.Env = append(os.Environ(), "GACT_BACKEND="+url)
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		t.Fatalf("start tail: %v", err)
	}
	time.Sleep(1500 * time.Millisecond)
	_ = cmd.Process.Kill()
	_ = cmd.Wait()

	out := stdout.String()
	if strings.Contains(out, `"type"`) || strings.Contains(out, `"seq"`) {
		t.Errorf("text mode should not emit JSON keys: %q", out)
	}
	if !strings.Contains(out, "server.connected") {
		t.Errorf("missed server.connected row: %q", out)
	}
	// Human row format is "HH:MM:SS  type [summary]" — first field
	// must look like a clock time.
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			t.Errorf("malformed row: %q", line)
			continue
		}
		if !strings.Contains(fields[0], ":") || len(fields[0]) != 8 {
			t.Errorf("first field doesn't look like HH:MM:SS: %q (line=%q)", fields[0], line)
		}
	}

	// Unknown format → exit 2 quickly.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tail", "--workspace", "ws_default", "--format", "yaml"); code != 2 {
		t.Errorf("tail --format yaml: want exit 2, got %d", code)
	}
}

// TestCLI_ExportAllParallel covers QQQQ1: with N>workers sessions
// the bounded-pool fanout still exports everything. Seeds 12
// sessions (workers=8) so the pool must reuse slots, then asserts
// every session.json landed in the output dir.
func TestCLI_ExportAllParallel(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	const N = 12
	sids := make([]string, 0, N)
	for i := 0; i < N; i++ {
		sids = append(sids, createSession(t, url, fmt.Sprintf("parallel-export-%d", i)))
	}

	outDir := filepath.Join(t.TempDir(), "bulk")
	_, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"export", "--all", "-o", outDir)
	if code != 0 {
		t.Fatalf("exit %d, stderr=%q", code, stderr)
	}
	wantSummary := fmt.Sprintf("%d ok, 0 failed", N)
	if !strings.Contains(stderr, wantSummary) {
		t.Errorf("summary mismatch — want %q, stderr=%q", wantSummary, stderr)
	}
	for _, sid := range sids {
		p := filepath.Join(outDir, sid+".json")
		if _, err := os.Stat(p); err != nil {
			t.Errorf("missing export %s: %v", p, err)
		}
	}
}

// TestCLI_ExportAll covers V1: `gact export --all -o DIR` writes one
// JSON file per session into DIR. Exercises the full CLI path against
// a real emulator binary.
func TestCLI_ExportAll(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	// Seed 3 sessions so the bulk export has real material.
	sid1 := createSession(t, url, "alpha")
	sid2 := createSession(t, url, "beta")
	sid3 := createSession(t, url, "gamma")

	outDir := filepath.Join(t.TempDir(), "exports")
	_, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"export", "--all", "-o", outDir)
	if code != 0 {
		t.Fatalf("exit %d, stderr=%q", code, stderr)
	}
	if !strings.Contains(stderr, "ok") {
		t.Errorf("summary missing from stderr: %q", stderr)
	}

	for _, sid := range []string{sid1, sid2, sid3} {
		p := filepath.Join(outDir, sid+".json")
		b, err := os.ReadFile(p)
		if err != nil {
			t.Fatalf("missing export for %s: %v", sid, err)
		}
		if !strings.Contains(string(b), `"gact-v1"`) {
			t.Errorf("%s doesn't look like an export blob: %s", sid, string(b)[:80])
		}
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

// CCCCCCCC1: defaultAttachTarget reads the detached-sessions
// registry and picks the most-recent entry for the current
// backend so `gact attach` (no args) just works. FFFFFFFF1 made
// it probe each candidate before returning so a stale registry
// entry doesn't crash the TUI on attach — tests stub the probe.
//
// allAlive treats every (backend, sid) as live; allDead treats
// none alive; specificDead returns false for the listed SIDs only.
func allAlive(_, _ string) bool { return true }
func allDead(_, _ string) bool  { return false }
func specificDead(deadSIDs ...string) func(string, string) bool {
	dead := map[string]bool{}
	for _, s := range deadSIDs {
		dead[s] = true
	}
	return func(_, sid string) bool { return !dead[sid] }
}

// AAAAAAAAA1: `gact attach <sid> --print-only` resolves the target
// and prints the sid to stdout without launching the TUI. Used for
// scripting: SID=$(gact attach <prefix> --print-only). Tested via
// the real binary since runAttach is os.Exit-based.
func TestCLI_AttachPrintOnly_ExplicitSid(t *testing.T) {
	// Explicit-sid path doesn't touch the registry or the backend —
	// no-arg validation happens only for the no-arg case. We can
	// test without an emulator.
	bin := buildGact(t)
	stdout, _, code := runGact(t, bin, nil,
		"attach", "sess_abc123def456", "--print-only")
	if code != 0 {
		t.Fatalf("attach --print-only: exit %d (want 0)", code)
	}
	if got := strings.TrimSpace(stdout); got != "sess_abc123def456" {
		t.Errorf("stdout = %q, want 'sess_abc123def456'", got)
	}
}

// PPPPPPPPP1: `gact session <verb>` alias layer over existing
// session CRUD. Verifies create → list → show → rename → rm
// round-trip works through the alias verbs.
func TestCLI_SessionAliasCRUD(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	env := map[string]string{"GACT_BACKEND": url}

	// create
	stdout, _, code := runGact(t, bin, env, "session", "create", "--title", "alias-test")
	if code != 0 {
		t.Fatalf("session create: exit %d", code)
	}
	sid := strings.TrimSpace(stdout)
	if !strings.HasPrefix(sid, "sess_") {
		t.Fatalf("session create should print sess_xxx; got %q", stdout)
	}
	defer func() { _, _, _ = runGact(t, bin, env, "session", "rm", sid) }()

	// list → should contain the new sid + title
	stdout, _, code = runGact(t, bin, env, "session", "list")
	if code != 0 {
		t.Fatalf("session list: exit %d", code)
	}
	if !strings.Contains(stdout, sid) || !strings.Contains(stdout, "alias-test") {
		t.Errorf("session list missing new session: %q", stdout)
	}

	// show → should report status + title
	stdout, _, code = runGact(t, bin, env, "session", "show", sid)
	if code != 0 {
		t.Fatalf("session show: exit %d", code)
	}
	if !strings.Contains(stdout, "title:") || !strings.Contains(stdout, "alias-test") {
		t.Errorf("session show missing title: %q", stdout)
	}

	// rename → show should now print the new title
	_, _, code = runGact(t, bin, env, "session", "rename", sid, "alias-test-renamed")
	if code != 0 {
		t.Fatalf("session rename: exit %d", code)
	}
	stdout, _, _ = runGact(t, bin, env, "session", "show", sid)
	if !strings.Contains(stdout, "alias-test-renamed") {
		t.Errorf("session show after rename missing new title: %q", stdout)
	}

	// rm → list should no longer include it
	_, _, code = runGact(t, bin, env, "session", "rm", sid)
	if code != 0 {
		t.Fatalf("session rm: exit %d", code)
	}
	stdout, _, _ = runGact(t, bin, env, "session", "list")
	if strings.Contains(stdout, sid) {
		t.Errorf("session list still shows removed sid %s: %q", sid, stdout)
	}

	// Unknown verb fails fast.
	_, stderr, code := runGact(t, bin, env, "session", "bogus")
	if code != 2 {
		t.Errorf("session bogus: exit %d, want 2", code)
	}
	if !strings.Contains(stderr, "unknown verb") {
		t.Errorf("stderr: %q", stderr)
	}
}

// OOOOOOOOO1: `gact agent deploy/list/stop/rm` round-trips a
// locally-spawned adapter. Builds the real claudecode adapter
// (~2s compile) so the --host/--port/--cwd flags match and
// /v1/capabilities probes succeed. Skips if the `claude` CLI isn't
// installed since the adapter shells out to it during init.
func TestCLI_AgentDeployLifecycle(t *testing.T) {
	if _, err := exec.LookPath("claude"); err != nil {
		t.Skip("claude CLI not on PATH; agent-deploy e2e needs real adapter init")
	}
	bin := buildGact(t)

	tmp := t.TempDir()
	adapterBin := testBinaryPath(tmp, "gact-claudecode-adapter")
	_, file, _, _ := runtime.Caller(0)
	repoRoot := filepath.Join(filepath.Dir(file), "..")
	build := exec.Command("go", "build", "-o", adapterBin,
		"./adapters/claudecode/cmd/gact-claudecode-adapter")
	build.Dir = repoRoot
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build adapter: %v\n%s", err, out)
	}

	regPath := filepath.Join(tmp, "agents.json")
	env := map[string]string{"GACT_AGENTS_PATH": regPath}

	stdout, stderr, code := runGact(t, bin, env,
		"agent", "deploy", "claudecode", "testagent",
		"--bin", adapterBin, "--cwd", tmp)
	if code != 0 {
		t.Fatalf("agent deploy: exit %d stdout=%q stderr=%q", code, stdout, stderr)
	}
	if !strings.Contains(stderr, "deployed testagent") {
		t.Errorf("expected 'deployed testagent' hint on stderr: %q", stderr)
	}

	// Cleanup runs even if later assertions fail.
	defer func() {
		_, _, _ = runGact(t, bin, env, "agent", "rm", "testagent")
	}()

	// list should show it + alive=yes (truecolor; just look for the word).
	stdout, _, code = runGact(t, bin, env, "agent", "list", "--format", "tsv")
	if code != 0 {
		t.Fatalf("agent list: exit %d", code)
	}
	if !strings.Contains(stdout, "testagent\t") {
		t.Errorf("list should include testagent row: %q", stdout)
	}
	if !strings.Contains(stdout, "started_at") {
		t.Errorf("list should include started_at column: %q", stdout)
	}
	if !strings.Contains(stdout, "\tyes\t") {
		t.Errorf("list should report alive=yes tsv: %q", stdout)
	}

	// stop — give the adapter a moment to exit, then list should report no.
	_, stderr, code = runGact(t, bin, env, "agent", "stop", "testagent")
	if code != 0 {
		t.Fatalf("agent stop: exit %d stderr=%q", code, stderr)
	}
	time.Sleep(500 * time.Millisecond)
	stdout, _, _ = runGact(t, bin, env, "agent", "list", "--format", "tsv")
	if !strings.Contains(stdout, "\tno\t") {
		t.Errorf("stopped agent should report alive=no: %q", stdout)
	}

	// rm drops the entry.
	_, _, code = runGact(t, bin, env, "agent", "rm", "testagent")
	if code != 0 {
		t.Fatalf("agent rm: exit %d", code)
	}
	stdout, _, _ = runGact(t, bin, env, "agent", "list")
	if strings.Contains(stdout, "testagent") {
		t.Errorf("rm should drop entry from list: %q", stdout)
	}
}

// CLIO-BBBBBBBBBB12: gact agent deploy clio walks the same
// deploy/list/stop/rm lifecycle as the claudecode adapter but
// against the Python clio-agent-gact console script. Skips when
// the script isn't on PATH (CI environments without
// iowarp/clio-agent installed).
func TestCLI_AgentDeployLifecycle_Clio(t *testing.T) {
	clioBin, err := exec.LookPath("clio-agent-gact")
	if err != nil {
		t.Skip("clio-agent-gact not on PATH; install with `uv pip install -e /path/to/clio-agent`")
	}
	bin := buildGact(t)
	tmp := t.TempDir()
	regPath := filepath.Join(tmp, "agents.json")
	env := map[string]string{"GACT_AGENTS_PATH": regPath}

	stdout, stderr, code := runGact(t, bin, env,
		"agent", "deploy", "clio", "testclio",
		"--bin", clioBin)
	if code != 0 {
		t.Fatalf("agent deploy clio: exit %d stdout=%q stderr=%q",
			code, stdout, stderr)
	}
	if !strings.Contains(stderr, "deployed testclio") {
		t.Errorf("expected 'deployed testclio' hint on stderr: %q", stderr)
	}
	defer func() {
		_, _, _ = runGact(t, bin, env, "agent", "rm", "testclio")
	}()

	// list should report kind=clio + alive=yes.
	stdout, _, code = runGact(t, bin, env, "agent", "list", "--format", "tsv")
	if code != 0 {
		t.Fatalf("agent list: exit %d", code)
	}
	if !strings.Contains(stdout, "testclio\tclio\t") {
		t.Errorf("list should show 'testclio\\tclio\\t...' row: %q", stdout)
	}
	if !strings.Contains(stdout, "started_at") {
		t.Errorf("list should include started_at column: %q", stdout)
	}
	if !strings.Contains(stdout, "\tyes\t") {
		t.Errorf("list should report alive=yes after deploy: %q", stdout)
	}

	// stop + cleanup.
	_, stderr, code = runGact(t, bin, env, "agent", "stop", "testclio")
	if code != 0 {
		t.Fatalf("agent stop: exit %d stderr=%q", code, stderr)
	}
	time.Sleep(500 * time.Millisecond)
}

func TestAgentDeployStartupTimeoutDefaults(t *testing.T) {
	t.Setenv("GACT_AGENT_DEPLOY_STARTUP_TIMEOUT", "")
	if got := defaultAgentDeployStartupTimeout("clio"); got != 60*time.Second {
		t.Fatalf("clio deploy startup timeout = %s, want 60s", got)
	}
	if got := defaultAgentDeployStartupTimeout("claudecode"); got != 3*time.Second {
		t.Fatalf("claudecode deploy startup timeout = %s, want 3s", got)
	}

	t.Setenv("GACT_AGENT_DEPLOY_STARTUP_TIMEOUT", "25s")
	if got := defaultAgentDeployStartupTimeout("clio"); got != 25*time.Second {
		t.Fatalf("env deploy startup timeout = %s, want 25s", got)
	}

	t.Setenv("GACT_AGENT_DEPLOY_STARTUP_TIMEOUT", "not-a-duration")
	if got := defaultAgentDeployStartupTimeout("clio"); got != 60*time.Second {
		t.Fatalf("invalid env deploy startup timeout = %s, want clio default 60s", got)
	}
}

func TestClioPythonEntrypointPrefersVenvPython(t *testing.T) {
	tmp := t.TempDir()
	scripts := filepath.Join(tmp, "Scripts")
	if err := os.MkdirAll(scripts, 0o755); err != nil {
		t.Fatal(err)
	}
	console := filepath.Join(scripts, "clio-agent-gact.exe")
	python := filepath.Join(scripts, "python.exe")
	if err := os.WriteFile(console, []byte("stub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(python, []byte("python"), 0o755); err != nil {
		t.Fatal(err)
	}

	gotBin, gotArgs, ok := clioPythonEntrypoint(console)
	if !ok {
		t.Fatal("expected venv python entrypoint")
	}
	if gotBin != python {
		t.Fatalf("entrypoint bin = %q, want %q", gotBin, python)
	}
	if len(gotArgs) != 2 || gotArgs[0] != "-c" ||
		!strings.Contains(gotArgs[1], "clio_agent.gact.app") {
		t.Fatalf("entrypoint args = %#v", gotArgs)
	}
}

func TestCLI_AttachPrintOnly_NoArgsReadsRegistry(t *testing.T) {
	// No-arg path probes each candidate so we need a live backend
	// for it to return a sid instead of the "all dead" error.
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	// Create a real session so the probe succeeds.
	sid := createSession(t, url, "print-only-target")

	// Point GACT_DETACHED_PATH at a temp registry with just this sid.
	dir := t.TempDir()
	regPath := filepath.Join(dir, "detached.json")
	body := fmt.Sprintf(
		`{"records":[{"session_id":%q,"title":"print-only-target","backend":%q,"detached_at":"2026-04-20T08:00:00Z"}]}`,
		sid, url,
	)
	if err := os.WriteFile(regPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}

	stdout, stderr, code := runGact(t, bin, map[string]string{
		"GACT_BACKEND":       url,
		"GACT_DETACHED_PATH": regPath,
	}, "attach", "--print-only")
	if code != 0 {
		t.Fatalf("attach --print-only no args: exit %d stderr=%q", code, stderr)
	}
	if got := strings.TrimSpace(stdout); got != sid {
		t.Errorf("stdout = %q, want %q", got, sid)
	}
}

func TestDefaultAttachTarget_PicksMostRecentForBackend(t *testing.T) {
	dir := t.TempDir()
	regPath := filepath.Join(dir, "detached.json")
	t.Setenv("GACT_DETACHED_PATH", regPath)
	t.Setenv("GACT_BACKEND", "http://localhost:7777")
	t.Setenv("GACT_CONFIG", filepath.Join(dir, "missing-config.json"))

	body := `{"records":[
		{"session_id":"sess_old","title":"old","backend":"http://localhost:7777","detached_at":"2026-04-19T07:00:00Z"},
		{"session_id":"sess_new","title":"new","backend":"http://localhost:7777","detached_at":"2026-04-20T07:00:00Z"},
		{"session_id":"sess_other","title":"other","backend":"http://other:9999","detached_at":"2026-04-20T08:00:00Z"}
	]}`
	if err := os.WriteFile(regPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := defaultAttachTargetWithProbe(allAlive)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "sess_new" {
		t.Errorf("got %q, want sess_new", got)
	}
}

func TestDefaultAttachTarget_NoMatchReturnsHelpfulError(t *testing.T) {
	dir := t.TempDir()
	regPath := filepath.Join(dir, "detached.json")
	t.Setenv("GACT_DETACHED_PATH", regPath)
	t.Setenv("GACT_BACKEND", "http://localhost:7777")
	t.Setenv("GACT_CONFIG", filepath.Join(dir, "missing-config.json"))

	body := `{"records":[{"session_id":"sess_a","backend":"http://other:9999","detached_at":"2026-04-20T07:00:00Z"}]}`
	if err := os.WriteFile(regPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := defaultAttachTargetWithProbe(allAlive)
	if err == nil {
		t.Fatal("expected error when no detach matches the current backend")
	}
	if !strings.Contains(err.Error(), "no detached sessions") ||
		!strings.Contains(err.Error(), "http://localhost:7777") {
		t.Errorf("error should name the backend; got %q", err.Error())
	}
}

func TestDefaultAttachTarget_MissingRegistryIsHandled(t *testing.T) {
	dir := t.TempDir()
	regPath := filepath.Join(dir, "never-existed.json")
	t.Setenv("GACT_DETACHED_PATH", regPath)
	t.Setenv("GACT_BACKEND", "http://localhost:7777")
	t.Setenv("GACT_CONFIG", filepath.Join(dir, "missing-config.json"))

	_, err := defaultAttachTargetWithProbe(allAlive)
	if err == nil {
		t.Fatal("expected error when registry is empty/missing")
	}
	if !strings.Contains(err.Error(), "no detached sessions") {
		t.Errorf("error should be the no-match message, got %q", err.Error())
	}
}

// FFFFFFFF1: when the most-recent candidate is dead, fall through
// to the next-newest live entry instead of attaching to a dead sid
// and crashing the TUI on first request.
func TestDefaultAttachTarget_SkipsDeadCandidates(t *testing.T) {
	dir := t.TempDir()
	regPath := filepath.Join(dir, "detached.json")
	t.Setenv("GACT_DETACHED_PATH", regPath)
	t.Setenv("GACT_BACKEND", "http://localhost:7777")
	t.Setenv("GACT_CONFIG", filepath.Join(dir, "missing-config.json"))

	// Newest is dead, next is dead, third is alive — should pick third.
	body := `{"records":[
		{"session_id":"sess_dead_top","backend":"http://localhost:7777","detached_at":"2026-04-20T08:00:00Z"},
		{"session_id":"sess_dead_mid","backend":"http://localhost:7777","detached_at":"2026-04-20T07:30:00Z"},
		{"session_id":"sess_alive","backend":"http://localhost:7777","detached_at":"2026-04-20T07:00:00Z"}
	]}`
	if err := os.WriteFile(regPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := defaultAttachTargetWithProbe(specificDead("sess_dead_top", "sess_dead_mid"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "sess_alive" {
		t.Errorf("got %q, want sess_alive", got)
	}
}

// FFFFFFFF1: when EVERY candidate is dead, return a helpful error
// pointing to `gact detached --probe` so the user can clean up.
func TestDefaultAttachTarget_AllDeadReturnsHelpfulError(t *testing.T) {
	dir := t.TempDir()
	regPath := filepath.Join(dir, "detached.json")
	t.Setenv("GACT_DETACHED_PATH", regPath)
	t.Setenv("GACT_BACKEND", "http://localhost:7777")
	t.Setenv("GACT_CONFIG", filepath.Join(dir, "missing-config.json"))

	body := `{"records":[
		{"session_id":"sess_a","backend":"http://localhost:7777","detached_at":"2026-04-20T08:00:00Z"},
		{"session_id":"sess_b","backend":"http://localhost:7777","detached_at":"2026-04-20T07:00:00Z"}
	]}`
	if err := os.WriteFile(regPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := defaultAttachTargetWithProbe(allDead)
	if err == nil {
		t.Fatal("expected error when every candidate is dead")
	}
	if !strings.Contains(err.Error(), "none are still alive") ||
		!strings.Contains(err.Error(), "gact detached --probe") {
		t.Errorf("error should point to --probe for cleanup; got %q", err.Error())
	}
}
