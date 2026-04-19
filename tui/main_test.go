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
