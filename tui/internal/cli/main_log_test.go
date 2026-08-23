package cli

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

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
		t.Fatalf("expected >=2 NDJSON lines (user + assistant), got %d: %q", len(lines), stdout)
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

	// Unknown format -> exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid, "--format", "yaml"); code != 2 {
		t.Errorf("log --format yaml: want exit 2, got %d", code)
	}
}

// `gact log --role` drops messages whose role isn't in
// the keep-set. Accepts comma-separated list; an unknown role
// errors fast instead of silently empty-logging.
func TestCLI_LogRoleFilter(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "log-role-target")

	// Send a "read main.go" turn - produces user + thinking
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

	// --role user -> only the user row.
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

	// --role assistant,tool -> keeps both, drops user.
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

	// Unknown role -> exit 2 with a helpful error.
	_, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid, "--role", "bogus")
	if code == 0 {
		t.Fatal("expected non-zero exit for unknown --role")
	}
	if !strings.Contains(stderr, "unknown --role") {
		t.Errorf("stderr should mention 'unknown --role': %q", stderr)
	}
}

// `gact log --grep` drops messages whose flattened text
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

	// All messages - should include user + assistant + tool turns.
	stdoutAll, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid)
	allRows := strings.Count(stdoutAll, "[USER @") +
		strings.Count(stdoutAll, "[ASSISTANT @") +
		strings.Count(stdoutAll, "[TOOL @")
	if allRows < 3 {
		t.Fatalf("expected >=3 rows before filter, got %d: %q", allRows, stdoutAll)
	}

	// Grep for a string only the tool_result carries (the file
	// content contains "println"; case-insensitive).
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

	// Unmatched pattern -> empty output, no error.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid, "--grep", "zzznomatch")
	if code != 0 {
		t.Fatalf("--grep zzznomatch should still exit 0, got %d", code)
	}
	if strings.Contains(stdout, "[USER @") || strings.Contains(stdout, "[ASSISTANT @") {
		t.Errorf("unmatched pattern should yield empty rows: %q", stdout)
	}

	// Bad regex -> exit 2 with helpful error.
	_, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid, "--grep", "[")
	if code == 0 {
		t.Fatal("expected non-zero exit for malformed regex")
	}
	if !strings.Contains(stderr, "bad --grep pattern") {
		t.Errorf("stderr should mention 'bad --grep pattern': %q", stderr)
	}
}

// TestCLI_LogSince covers TTT1: send two messages with a sleep
// between, --since 50ms keeps only the latest, --since 1h keeps
// both.
func TestCLI_LogSince(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	now := time.Now().UTC()
	imported := map[string]any{
		"format":      "gact-v1",
		"exported_at": now,
		"session": map[string]any{
			"workspace_id": "ws_default",
			"title":        "log-since-target",
			"status":       gact.StatusIdle,
		},
		"messages": []gact.Message{
			{
				Role:      gact.RoleUser,
				CreatedAt: now.Add(-10 * time.Minute),
				Parts:     []gact.Part{gact.NewTextPart("AAA")},
			},
			{
				Role:      gact.RoleUser,
				CreatedAt: now.Add(-30 * time.Second),
				Parts:     []gact.Part{gact.NewTextPart("BBB")},
			},
		},
	}
	body, err := json.Marshal(imported)
	if err != nil {
		t.Fatalf("marshal import fixture: %v", err)
	}
	resp, err := http.Post(url+"/v1/sessions/import", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("import fixture: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		raw, _ := io.ReadAll(resp.Body)
		t.Fatalf("import fixture status %d: %s", resp.StatusCode, raw)
	}
	var sess gact.Session
	if err := json.NewDecoder(resp.Body).Decode(&sess); err != nil {
		t.Fatalf("decode imported session: %v", err)
	}
	sid := sess.ID
	if sid == "" {
		t.Fatal("imported session has no id")
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

	// Narrow window keeps only BBB.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid, "--since", "2m", "--limit", "50")
	if code != 0 {
		t.Fatalf("log --since 2m: exit %d", code)
	}
	if strings.Contains(stdout, "AAA") {
		t.Errorf("--since 2m should drop AAA: %q", stdout)
	}
	if !strings.Contains(stdout, "BBB") {
		t.Errorf("--since 2m should keep BBB: %q", stdout)
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
