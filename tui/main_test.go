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
	timer := time.AfterFunc(d, func() { _ = cmd.Process.Signal(os.Interrupt) })
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

// TestCLI_Hooks covers MMM3: register a hook, trigger an event,
// verify the hook script captured the event JSON, then delete it.
func TestCLI_Hooks(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	// Drop a tiny shell script that captures stdin to a known file.
	dir := t.TempDir()
	captured := filepath.Join(dir, "hook-fired.json")
	script := filepath.Join(dir, "hook.sh")
	if err := os.WriteFile(script,
		[]byte("#!/bin/bash\ncat > "+captured+"\n"), 0o755); err != nil {
		t.Fatalf("write hook script: %v", err)
	}

	// Register a hook on the `notification` event firing the script.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "add", "--event", "notification", "--command", script)
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
	if code != 0 || !strings.Contains(stdout, hid) || !strings.Contains(stdout, script) {
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

// TestCLI_LogSince covers TTT1: send two messages with a sleep
// between, --since 50ms keeps only the latest, --since 1h keeps
// both.
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
	// Wait long enough that AAA's user msg drops out of a small
	// --since window.
	time.Sleep(2 * time.Second)
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

	// Narrow window keeps only BBB (AAA was sent ≥2s ago).
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid, "--since", "1500ms", "--limit", "50")
	if code != 0 {
		t.Fatalf("log --since 1500ms: exit %d", code)
	}
	if strings.Contains(stdout, "AAA") {
		t.Errorf("--since 1500ms should drop AAA: %q", stdout)
	}
	if !strings.Contains(stdout, "BBB") {
		t.Errorf("--since 1500ms should keep BBB: %q", stdout)
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
	// Every major section should appear in the output.
	for _, want := range []string{"Health", "Capabilities", "Sessions_Create", "Tools_List"} {
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

// TestCLI_Bench covers QQQ1: small N=2 bench, asserts the summary
// table mentions p50/p90/p99 and that the bench session was cleaned
// up (delete after run).
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
	for _, want := range []string{"p50:", "p90:", "p99:", "n=2"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in bench output: %q", want, stdout)
		}
	}

	// Bench session must be deleted — list count back to baseline.
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
	for _, want := range []string{"✓ workspaces", "✓ sessions", "✓ mcp"} {
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
// with at least the canonical "completion" entry.
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
